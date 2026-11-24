import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InvoiceStatus } from '@bayadrent/shared-types';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { DATABASE } from '../db/db.constants';
import type { Database } from '../db';
import {
  invoiceLineItems,
  invoices,
  leases,
  properties,
  propertyUtilityTypes,
  units,
} from '../db/schema';
import { PaymentService } from '../payment/payment.service';
import { GenerateInvoicesDto } from './dto/generate-invoices.dto';
import { PartialPayDto } from './dto/partial-pay.dto';
import { UpdateInvoiceLinesDto } from './dto/update-invoice-lines.dto';

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function lastDayOfMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function buildDueDate(year: number, month: number, dueDay: number) {
  const day = Math.min(dueDay, lastDayOfMonth(year, month));
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

@Injectable()
export class BillingService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly payments: PaymentService,
    private readonly audit: AuditService,
  ) {}

  async generateForLandlord(landlordId: string, dto: GenerateInvoicesDto = {}) {
    const now = new Date();
    const year = dto.year ?? now.getUTCFullYear();
    const month = dto.month ?? now.getUTCMonth() + 1;
    const today = todayIsoDate();

    const activeLeases = await this.db.query.leases.findMany({
      where: eq(leases.status, 'ACTIVE'),
      with: {
        unit: {
          with: {
            property: true,
          },
        },
      },
    });

    const owned = activeLeases.filter(
      (lease) => lease.unit.property.landlordId === landlordId,
    );

    let created = 0;
    let skipped = 0;
    const items = [];

    for (const lease of owned) {
      const existing = await this.db.query.invoices.findFirst({
        where: and(
          eq(invoices.leaseId, lease.id),
          eq(invoices.periodYear, year),
          eq(invoices.periodMonth, month),
        ),
      });

      if (existing) {
        skipped += 1;
        continue;
      }

      const dueDate = buildDueDate(year, month, lease.dueDay);
      const status = dueDate < today ? InvoiceStatus.OVERDUE : InvoiceStatus.DUE;

      const [invoice] = await this.db
        .insert(invoices)
        .values({
          leaseId: lease.id,
          periodYear: year,
          periodMonth: month,
          amount: lease.rentAmount,
          originalAmount: lease.rentAmount,
          amountPaid: 0,
          dueDate,
          status,
        })
        .returning();

      const utilityTypes = await this.db.query.propertyUtilityTypes.findMany({
        where: and(
          eq(propertyUtilityTypes.propertyId, lease.unit.property.id),
          eq(propertyUtilityTypes.active, true),
        ),
        orderBy: [asc(propertyUtilityTypes.sortOrder), asc(propertyUtilityTypes.createdAt)],
      });

      await this.db.insert(invoiceLineItems).values([
        {
          invoiceId: invoice.id,
          kind: 'RENT',
          label: 'Rent',
          amount: lease.rentAmount,
          quantity: '0',
          unitRate: null,
          unitLabel: null,
          utilityTypeId: null,
        },
        ...utilityTypes.map((u) => ({
          invoiceId: invoice.id,
          kind: 'UTILITY' as const,
          label: u.name,
          amount: 0,
          quantity: '0',
          unitRate: u.unitRate,
          unitLabel: u.unitLabel,
          utilityTypeId: u.id,
        })),
      ]);

      created += 1;
      items.push(invoice);
    }

    return { year, month, created, skipped, items };
  }

  async getTracker(landlordId: string) {
    await this.refreshOverdueForLeaseIds(await this.leaseIdsForLandlord(landlordId));

    const rows = await this.db.query.invoices.findMany({
      orderBy: [desc(invoices.dueDate), desc(invoices.createdAt)],
      with: {
        lineItems: {
          orderBy: [asc(invoiceLineItems.createdAt)],
        },
        lease: {
          with: {
            renter: {
              columns: { id: true, email: true, fullName: true },
            },
            unit: {
              with: {
                property: true,
              },
            },
          },
        },
      },
    });

    const owned = rows.filter((row) => row.lease.unit.property.landlordId === landlordId);
    const pendingMap = await this.payments.latestPendingByInvoiceIds(owned.map((r) => r.id));

    const items = [];
    for (const row of owned) {
      const lineItems = await this.ensureLineItems(row, {
        propertyId: row.lease.unit.property.id,
        status: row.status,
      });
      items.push({
        ...this.toTrackerItem(row),
        lineItems,
        pendingPayment: pendingMap.get(row.id) ?? null,
      });
    }

    return {
      summary: {
        due: items.filter((i) => i.status === InvoiceStatus.DUE).length,
        overdue: items.filter((i) => i.status === InvoiceStatus.OVERDUE).length,
        paid: items.filter((i) => i.status === InvoiceStatus.PAID).length,
        partial: items.filter((i) => i.status === InvoiceStatus.PARTIAL).length,
        waived: items.filter((i) => i.status === InvoiceStatus.WAIVED).length,
        pendingReview: items.filter((i) => Boolean(i.pendingPayment)).length,
        total: items.length,
      },
      items,
    };
  }

  async getRenterInvoices(renterId: string) {
    const leaseIds = await this.db
      .select({ id: leases.id })
      .from(leases)
      .where(eq(leases.renterId, renterId));

    await this.refreshOverdueForLeaseIds(leaseIds.map((l) => l.id));

    const rows = await this.db.query.invoices.findMany({
      orderBy: [desc(invoices.dueDate), desc(invoices.createdAt)],
      with: {
        lineItems: {
          orderBy: [asc(invoiceLineItems.createdAt)],
        },
        lease: {
          with: {
            unit: {
              with: {
                property: {
                  columns: {
                    id: true,
                    name: true,
                    address: true,
                    gcashAccountName: true,
                    gcashMobileNumber: true,
                    gcashQrPath: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const mine = rows.filter((row) => row.lease.renterId === renterId);
    const pendingMap = await this.payments.latestPendingByInvoiceIds(mine.map((r) => r.id));

    const result = [];
    for (const row of mine) {
      const lineItems = await this.ensureLineItems(row, {
        propertyId: row.lease.unit.property.id,
        status: row.status,
      });
      result.push({
        id: row.id,
        amount: row.amount,
        originalAmount: row.originalAmount ?? row.amount + (row.amountPaid ?? 0),
        amountPaid: row.amountPaid ?? 0,
        dueDate: row.dueDate,
        status: row.status,
        periodYear: row.periodYear,
        periodMonth: row.periodMonth,
        paidAt: row.paidAt,
        lineItems,
        unit: {
          id: row.lease.unit.id,
          label: row.lease.unit.label,
        },
        property: {
          id: row.lease.unit.property.id,
          name: row.lease.unit.property.name,
          address: row.lease.unit.property.address,
          gcashAccountName: row.lease.unit.property.gcashAccountName,
          gcashMobileNumber: row.lease.unit.property.gcashMobileNumber,
          hasGcashQr: Boolean(row.lease.unit.property.gcashQrPath),
        },
        pendingPayment: pendingMap.get(row.id) ?? null,
      });
    }
    return result;
  }

  async getRenterCalendar(renterId: string, year: number, month: number) {
    const leaseIds = await this.db
      .select({ id: leases.id })
      .from(leases)
      .where(eq(leases.renterId, renterId));

    await this.refreshOverdueForLeaseIds(leaseIds.map((l) => l.id));

    if (!leaseIds.length) {
      return { year, month, items: [] };
    }

    const rows = await this.db.query.invoices.findMany({
      where: and(
        inArray(
          invoices.leaseId,
          leaseIds.map((l) => l.id),
        ),
        eq(invoices.periodYear, year),
        eq(invoices.periodMonth, month),
      ),
      orderBy: [asc(invoices.dueDate)],
      with: {
        lineItems: {
          orderBy: [asc(invoiceLineItems.createdAt)],
        },
        lease: {
          with: {
            unit: {
              with: {
                property: {
                  columns: { id: true, name: true, address: true },
                },
              },
            },
          },
        },
      },
    });

    const items = [];
    for (const row of rows) {
      const lineItems = await this.ensureLineItems(row, {
        propertyId: row.lease.unit.property.id,
        status: row.status,
      });
      items.push({
        id: row.id,
        amount: row.amount,
        dueDate: row.dueDate,
        status: row.status,
        periodYear: row.periodYear,
        periodMonth: row.periodMonth,
        paidAt: row.paidAt,
        timing: this.paymentTiming(row),
        lineItems,
        unit: { id: row.lease.unit.id, label: row.lease.unit.label },
        property: {
          id: row.lease.unit.property.id,
          name: row.lease.unit.property.name,
          address: row.lease.unit.property.address,
        },
      });
    }

    return { year, month, items };
  }

  async updateInvoiceLines(landlordId: string, invoiceId: string, dto: UpdateInvoiceLinesDto) {
    const invoice = await this.loadInvoice(invoiceId);
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.lease.unit.property.landlordId !== landlordId) {
      throw new ForbiddenException('You cannot update this invoice');
    }
    if (
      invoice.status === InvoiceStatus.PAID ||
      invoice.status === InvoiceStatus.WAIVED ||
      invoice.status === InvoiceStatus.PARTIAL
    ) {
      throw new BadRequestException(
        invoice.status === InvoiceStatus.PARTIAL
          ? 'Finish or adjust partial payments before editing utilities'
          : `Cannot edit lines on ${invoice.status} invoice`,
      );
    }

    await this.ensureLineItems(invoice, {
      propertyId: invoice.lease.unit.property.id,
      status: invoice.status,
    });

    const existingLines = await this.db.query.invoiceLineItems.findMany({
      where: eq(invoiceLineItems.invoiceId, invoiceId),
    });
    const byId = new Map(existingLines.map((l) => [l.id, l]));

    const catalogRates = new Map<string, { unitRate: string; unitLabel: string }>();
    const utilityTypeIds = existingLines
      .map((l) => l.utilityTypeId)
      .filter((id): id is string => Boolean(id));
    if (utilityTypeIds.length) {
      const catalog = await this.db.query.propertyUtilityTypes.findMany({
        where: inArray(propertyUtilityTypes.id, utilityTypeIds),
      });
      for (const u of catalog) {
        catalogRates.set(u.id, { unitRate: u.unitRate, unitLabel: u.unitLabel });
      }
    }

    for (const update of dto.lines) {
      const line = byId.get(update.id);
      if (!line) {
        throw new BadRequestException(`Line ${update.id} does not belong to this invoice`);
      }

      if (line.kind === 'RENT') {
        throw new BadRequestException('Rent amount comes from the lease; edit utilities only');
      }

      const catalog = line.utilityTypeId ? catalogRates.get(line.utilityTypeId) : undefined;
      const unitRate =
        update.unitRate !== undefined
          ? update.unitRate
          : Number(line.unitRate ?? catalog?.unitRate ?? 0);
      const quantity = update.quantity !== undefined ? update.quantity : Number(line.quantity ?? 0);
      const unitLabel = catalog?.unitLabel ?? line.unitLabel ?? 'unit';
      const amount = this.computeUtilityAmount(unitRate, quantity);

      await this.db
        .update(invoiceLineItems)
        .set({
          amount,
          quantity: String(quantity),
          unitRate: String(unitRate),
          unitLabel,
          label: update.label !== undefined ? update.label.trim() : line.label,
          updatedAt: new Date(),
        })
        .where(eq(invoiceLineItems.id, update.id));
    }

    const refreshed = await this.db.query.invoiceLineItems.findMany({
      where: eq(invoiceLineItems.invoiceId, invoiceId),
      orderBy: [asc(invoiceLineItems.createdAt)],
    });
    const total = refreshed.reduce((sum, l) => sum + l.amount, 0);
    const amountPaid = invoice.amountPaid ?? 0;
    const remaining = Math.max(0, total - amountPaid);

    await this.db
      .update(invoices)
      .set({
        originalAmount: total,
        amount: remaining,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId));

    await this.audit.log({
      actorId: landlordId,
      action: 'INVOICE_LINES_UPDATED',
      entityType: 'invoice',
      entityId: invoiceId,
      summary: `Updated invoice lines; bill ₱${total}; due ₱${remaining}`,
    });

    const updated = await this.loadInvoice(invoiceId);
    return {
      ...this.toTrackerItem(updated!),
      lineItems: refreshed.map((l) => this.toLineItem(l)),
    };
  }

  async markPaid(landlordId: string, invoiceId: string) {
    const invoice = await this.loadInvoice(invoiceId);
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.lease.unit.property.landlordId !== landlordId) {
      throw new ForbiddenException('You cannot update this invoice');
    }

    if (invoice.status === InvoiceStatus.PAID) {
      return this.toTrackerItem(invoice);
    }

    if (
      invoice.status !== InvoiceStatus.DUE &&
      invoice.status !== InvoiceStatus.OVERDUE &&
      invoice.status !== InvoiceStatus.PARTIAL
    ) {
      throw new ForbiddenException(`Cannot mark ${invoice.status} invoice as paid`);
    }

    await this.db
      .update(invoices)
      .set({
        status: InvoiceStatus.PAID,
        paidAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId));

    await this.audit.log({
      actorId: landlordId,
      action: 'INVOICE_MARKED_PAID',
      entityType: 'invoice',
      entityId: invoiceId,
      summary: `Marked invoice paid for ${invoice.lease.renter.fullName} · ${invoice.lease.unit.property.name} · ${invoice.lease.unit.label}`,
    });

    const updated = await this.loadInvoice(invoiceId);
    return this.toTrackerItem(updated!);
  }

  async waive(landlordId: string, invoiceId: string) {
    const invoice = await this.loadInvoice(invoiceId);
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.lease.unit.property.landlordId !== landlordId) {
      throw new ForbiddenException('You cannot update this invoice');
    }
    if (invoice.status === InvoiceStatus.PAID || invoice.status === InvoiceStatus.WAIVED) {
      throw new BadRequestException(`Cannot waive ${invoice.status} invoice`);
    }

    await this.db
      .update(invoices)
      .set({ status: InvoiceStatus.WAIVED, updatedAt: new Date() })
      .where(eq(invoices.id, invoiceId));

    await this.audit.log({
      actorId: landlordId,
      action: 'INVOICE_WAIVED',
      entityType: 'invoice',
      entityId: invoiceId,
      summary: `Waived invoice for ${invoice.lease.renter.fullName} · ${invoice.lease.unit.label}`,
    });

    const updated = await this.loadInvoice(invoiceId);
    return this.toTrackerItem(updated!);
  }

  async recordPartial(landlordId: string, invoiceId: string, dto: PartialPayDto) {
    const invoice = await this.loadInvoice(invoiceId);
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.lease.unit.property.landlordId !== landlordId) {
      throw new ForbiddenException('You cannot update this invoice');
    }
    if (
      invoice.status !== InvoiceStatus.DUE &&
      invoice.status !== InvoiceStatus.OVERDUE &&
      invoice.status !== InvoiceStatus.PARTIAL
    ) {
      throw new BadRequestException(`Cannot record partial on ${invoice.status} invoice`);
    }
    if (dto.paidAmount <= 0) {
      throw new BadRequestException('Partial amount must be greater than zero');
    }
    if (dto.paidAmount >= invoice.amount) {
      throw new BadRequestException('Use Mark paid when the full amount is covered');
    }

    const billTotal =
      invoice.originalAmount ??
      (invoice.status === InvoiceStatus.PARTIAL
        ? invoice.amount + (invoice.amountPaid ?? 0)
        : invoice.amount);
    const amountPaid = (invoice.amountPaid ?? 0) + dto.paidAmount;
    const remaining = Math.max(0, billTotal - amountPaid);

    await this.db
      .update(invoices)
      .set({
        originalAmount: billTotal,
        amountPaid,
        amount: remaining,
        status: InvoiceStatus.PARTIAL,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId));

    await this.audit.log({
      actorId: landlordId,
      action: 'INVOICE_PARTIAL',
      entityType: 'invoice',
      entityId: invoiceId,
      summary: `Recorded partial ₱${dto.paidAmount}; paid ₱${amountPaid} of ₱${billTotal}; remaining ₱${remaining} for ${invoice.lease.renter.fullName}`,
    });

    const updated = await this.loadInvoice(invoiceId);
    return this.toTrackerItem(updated!);
  }

  async getReceipt(userId: string, role: string, invoiceId: string) {
    const invoice = await this.loadInvoice(invoiceId);
    if (!invoice) throw new NotFoundException('Invoice not found');

    const isLandlord = invoice.lease.unit.property.landlordId === userId;
    const isRenter = invoice.lease.renterId === userId;
    if (!isLandlord && !isRenter) {
      throw new ForbiddenException('You cannot view this receipt');
    }
    if (invoice.status !== InvoiceStatus.PAID) {
      throw new BadRequestException('Receipt is only available for paid invoices');
    }

  const money = (value: number) =>
      new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP',
        maximumFractionDigits: 0,
      }).format(value);

    const lines = await this.ensureLineItems(invoice, {
      propertyId: invoice.lease.unit.property.id,
      status: invoice.status,
    });
    const billTotal =
      invoice.originalAmount ??
      lines.reduce((sum, line) => sum + line.amount, 0) ??
      invoice.amount;
    const paidAt = invoice.paidAt
      ? new Date(invoice.paidAt).toLocaleString('en-PH')
      : '—';

    const lineRows = lines
      .map((line) => {
        const detail =
          line.kind === 'UTILITY' && (line.quantity ?? 0) > 0
            ? `${line.quantity} ${line.unitLabel || 'unit'} × ₱${Number(line.unitRate ?? 0).toFixed(2)}`
            : line.kind === 'RENT'
              ? 'Monthly rent'
              : 'Utility';
        return `<tr><td>${line.label}<div class="muted">${detail}</div></td><td>${money(line.amount)}</td></tr>`;
      })
      .join('');

    const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>BayadRent Receipt</title>
<style>
  body{font-family:Georgia,serif;max-width:560px;margin:40px auto;color:#171c1a;background:#fff;line-height:1.5}
  h1{font-size:1.6rem;margin:0 0 0.25rem} .muted{color:#5f6b65;font-size:0.85rem}
  table{width:100%;border-collapse:collapse;margin-top:1.25rem}
  td{padding:0.5rem 0;border-bottom:1px solid #d5dbd7;vertical-align:top}
  td:last-child{text-align:right;font-family:ui-monospace,monospace;white-space:nowrap}
  .total td{font-weight:700;border-bottom:0;padding-top:0.85rem}
  .print-actions{margin:1.25rem 0 0;display:flex;gap:0.75rem}
  .print-actions button{font:inherit;padding:0.45rem 0.9rem;border:1px solid #d5dbd7;background:#fff;border-radius:8px;cursor:pointer;color:#171c1a}
  @media print{
    body{margin:0;max-width:none;color:#000;background:#fff!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .print-actions{display:none!important}
    a{color:#000;text-decoration:none}
  }
</style></head><body>
  <h1>BayadRent</h1>
  <p class="muted">Official payment receipt</p>
  <table>
    <tr><td>Renter</td><td>${invoice.lease.renter.fullName}</td></tr>
    <tr><td>Property</td><td>${invoice.lease.unit.property.name} · ${invoice.lease.unit.label}</td></tr>
    <tr><td>Period</td><td>${invoice.periodYear}-${pad2(invoice.periodMonth)}</td></tr>
    <tr><td>Paid at</td><td>${paidAt}</td></tr>
  </table>
  <table>
    <tr><td colspan="2" class="muted" style="border:0;padding-bottom:0.25rem">Breakdown</td></tr>
    ${lineRows}
    <tr class="total"><td>Total paid</td><td>${money(billTotal)}</td></tr>
  </table>
  <p class="muted" style="margin-top:1.5rem">Invoice ${invoice.id}<br/>Generated for ${role === 'LANDLORD' ? 'landlord' : 'renter'} · ${new Date().toISOString()}</p>
  <div class="print-actions"><button type="button" onclick="window.print()">Print / Save PDF</button></div>
</body></html>`;

    return {
      filename: `bayadrent-receipt-${invoice.periodYear}-${pad2(invoice.periodMonth)}.html`,
      html,
    };
  }

  async loadInvoice(invoiceId: string) {
    return this.db.query.invoices.findFirst({
      where: eq(invoices.id, invoiceId),
      with: {
        lineItems: {
          orderBy: [asc(invoiceLineItems.createdAt)],
        },
        lease: {
          with: {
            renter: {
              columns: { id: true, email: true, fullName: true },
            },
            unit: {
              with: { property: true },
            },
          },
        },
      },
    });
  }

  private async ensureLineItems(
    invoice: {
      id: string;
      amount: number;
      originalAmount?: number | null;
      amountPaid?: number | null;
      lineItems?: Array<{
        id: string;
        kind: 'RENT' | 'UTILITY';
        label: string;
        amount: number;
        utilityTypeId: string | null;
        unitRate?: string | number | null;
        unitLabel?: string | null;
        quantity?: string | number | null;
      }>;
    },
    ctx: { propertyId: string; status: string },
  ) {
    let existing = invoice.lineItems?.length
      ? [...invoice.lineItems]
      : await this.db.query.invoiceLineItems.findMany({
          where: eq(invoiceLineItems.invoiceId, invoice.id),
          orderBy: [asc(invoiceLineItems.createdAt)],
        });

    if (existing.length === 0) {
      const [created] = await this.db
        .insert(invoiceLineItems)
        .values({
          invoiceId: invoice.id,
          kind: 'RENT',
          label: 'Rent',
          amount: invoice.amount,
          utilityTypeId: null,
        })
        .returning();
      existing = [created];
    }

    const canSyncUtilities =
      ctx.status !== InvoiceStatus.PAID && ctx.status !== InvoiceStatus.WAIVED;

    if (canSyncUtilities) {
      const activeUtils = await this.db.query.propertyUtilityTypes.findMany({
        where: and(
          eq(propertyUtilityTypes.propertyId, ctx.propertyId),
          eq(propertyUtilityTypes.active, true),
        ),
        orderBy: [asc(propertyUtilityTypes.sortOrder), asc(propertyUtilityTypes.createdAt)],
      });

      const linkedIds = new Set(
        existing
          .filter((l) => l.kind === 'UTILITY' && l.utilityTypeId)
          .map((l) => l.utilityTypeId as string),
      );

      const missing = activeUtils.filter((u) => !linkedIds.has(u.id));
      if (missing.length > 0) {
        const inserted = await this.db
          .insert(invoiceLineItems)
          .values(
            missing.map((u) => ({
              invoiceId: invoice.id,
              kind: 'UTILITY' as const,
              label: u.name,
              amount: 0,
              quantity: '0',
              unitRate: u.unitRate,
              unitLabel: u.unitLabel,
              utilityTypeId: u.id,
            })),
          )
          .returning();
        existing = [...existing, ...inserted];
      }

      // Keep unpaid utility lines on the current property rate; amount = rate × consumption
      for (const line of existing) {
        if (line.kind !== 'UTILITY' || !line.utilityTypeId) continue;
        const catalog = activeUtils.find((u) => u.id === line.utilityTypeId);
        if (!catalog) continue;
        const qty = Number(line.quantity ?? 0);
        const rate = Number(catalog.unitRate);
        const amount = this.computeUtilityAmount(rate, qty);
        if (
          String(line.unitRate ?? '') === String(catalog.unitRate) &&
          (line.unitLabel ?? '') === catalog.unitLabel &&
          line.amount === amount &&
          line.label === catalog.name
        ) {
          continue;
        }
        await this.db
          .update(invoiceLineItems)
          .set({
            unitRate: catalog.unitRate,
            unitLabel: catalog.unitLabel,
            label: catalog.name,
            amount,
            updatedAt: new Date(),
          })
          .where(eq(invoiceLineItems.id, line.id));
        line.unitRate = catalog.unitRate;
        line.unitLabel = catalog.unitLabel;
        line.label = catalog.name;
        line.amount = amount;
      }

      const billTotal = existing.reduce((sum, l) => sum + l.amount, 0);
      const amountPaid = invoice.amountPaid ?? 0;
      const remaining = Math.max(0, billTotal - amountPaid);
      if (
        invoice.originalAmount !== billTotal ||
        invoice.amount !== remaining
      ) {
        await this.db
          .update(invoices)
          .set({
            originalAmount: billTotal,
            amount: remaining,
            updatedAt: new Date(),
          })
          .where(eq(invoices.id, invoice.id));
        invoice.originalAmount = billTotal;
        invoice.amount = remaining;
      }
    }

    return existing.map((l) => this.toLineItem(l));
  }

  private computeUtilityAmount(unitRate: number, quantity: number) {
    if (!Number.isFinite(unitRate) || !Number.isFinite(quantity)) return 0;
    return Math.max(0, Math.round(unitRate * quantity));
  }

  private toLineItem(line: {
    id: string;
    kind: 'RENT' | 'UTILITY';
    label: string;
    amount: number;
    utilityTypeId: string | null;
    unitRate?: string | number | null;
    unitLabel?: string | null;
    quantity?: string | number | null;
  }) {
    return {
      id: line.id,
      kind: line.kind,
      label: line.label,
      amount: line.amount,
      utilityTypeId: line.utilityTypeId,
      unitRate: line.unitRate == null ? null : Number(line.unitRate),
      unitLabel: line.unitLabel ?? null,
      quantity: Number(line.quantity ?? 0),
    };
  }

  private paymentTiming(invoice: {
    status: string;
    dueDate: string;
    paidAt: Date | null;
  }): 'EARLY' | 'ON_TIME' | 'LATE' | 'UNPAID' | 'WAIVED' {
    if (invoice.status === InvoiceStatus.WAIVED) return 'WAIVED';
    if (invoice.status !== InvoiceStatus.PAID || !invoice.paidAt) return 'UNPAID';

    const paidDate = invoice.paidAt.toISOString().slice(0, 10);
    if (paidDate < invoice.dueDate) return 'EARLY';
    if (paidDate === invoice.dueDate) return 'ON_TIME';
    return 'LATE';
  }

  private async leaseIdsForLandlord(landlordId: string) {
    const propertyRows = await this.db
      .select({ id: properties.id })
      .from(properties)
      .where(eq(properties.landlordId, landlordId));

    if (!propertyRows.length) return [];

    const unitRows = await this.db
      .select({ id: units.id })
      .from(units)
      .where(
        inArray(
          units.propertyId,
          propertyRows.map((p) => p.id),
        ),
      );

    if (!unitRows.length) return [];

    const leaseRows = await this.db
      .select({ id: leases.id })
      .from(leases)
      .where(
        inArray(
          leases.unitId,
          unitRows.map((u) => u.id),
        ),
      );

    return leaseRows.map((l) => l.id);
  }

  private async refreshOverdueForLeaseIds(leaseIds: string[]) {
    if (!leaseIds.length) return;

    const today = todayIsoDate();
    const dueRows = await this.db.query.invoices.findMany({
      where: and(inArray(invoices.leaseId, leaseIds), eq(invoices.status, InvoiceStatus.DUE)),
    });

    const overdueIds = dueRows.filter((row) => row.dueDate < today).map((row) => row.id);
    if (!overdueIds.length) return;

    await this.db
      .update(invoices)
      .set({ status: InvoiceStatus.OVERDUE, updatedAt: new Date() })
      .where(inArray(invoices.id, overdueIds));
  }

  private toTrackerItem(
    row: NonNullable<Awaited<ReturnType<BillingService['loadInvoice']>>>,
  ) {
    const originalAmount = row.originalAmount ?? row.amount + (row.amountPaid ?? 0);
    const amountPaid = row.amountPaid ?? 0;
    return {
      id: row.id,
      amount: row.amount,
      originalAmount,
      amountPaid,
      dueDate: row.dueDate,
      status: row.status,
      periodYear: row.periodYear,
      periodMonth: row.periodMonth,
      paidAt: row.paidAt,
      leaseId: row.lease.id,
      renter: row.lease.renter,
      unit: {
        id: row.lease.unit.id,
        label: row.lease.unit.label,
      },
      property: {
        id: row.lease.unit.property.id,
        name: row.lease.unit.property.name,
        address: row.lease.unit.property.address,
      },
      lineItems: (row.lineItems ?? []).map((l) => this.toLineItem(l)),
    };
  }
}
