import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { InvoiceStatus, PaymentStatus } from '@bayadrent/shared-types';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { createReadStream, existsSync } from 'fs';
import { join } from 'path';
import { AuditService } from '../audit/audit.service';
import { DATABASE } from '../db/db.constants';
import type { Database } from '../db';
import { invoices, leases, payments, properties, units } from '../db/schema';
import { NotifyService } from '../notify/notify.service';
import { ObjectStorageService } from '../storage/object-storage.service';
import {
  isS3Path,
  persistUploadedFile,
  s3KeyFromPath,
} from '../storage/upload-persist';
import { UPLOAD_DIR } from './payment-storage';

@Injectable()
export class PaymentService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly notify: NotifyService,
    private readonly audit: AuditService,
    private readonly storage: ObjectStorageService,
  ) {}

  async submitProof(
    renterId: string,
    invoiceId: string,
    input: { note?: string; file?: Express.Multer.File },
  ) {
    const invoice = await this.loadInvoice(invoiceId);
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    if (invoice.lease.renterId !== renterId) {
      throw new ForbiddenException('You cannot pay this invoice');
    }
    if (invoice.status === InvoiceStatus.PAID) {
      throw new ConflictException('Invoice is already paid');
    }
    if (
      invoice.status !== InvoiceStatus.DUE &&
      invoice.status !== InvoiceStatus.OVERDUE &&
      invoice.status !== InvoiceStatus.PARTIAL
    ) {
      throw new BadRequestException(`Cannot submit payment for ${invoice.status} invoice`);
    }

    const existingPending = await this.db.query.payments.findFirst({
      where: and(
        eq(payments.invoiceId, invoiceId),
        eq(payments.status, PaymentStatus.PENDING_REVIEW),
      ),
    });
    if (existingPending) {
      throw new ConflictException('A payment is already awaiting landlord review');
    }

    let proofPath: string | null = null;
    if (input.file) {
      proofPath = await persistUploadedFile(this.storage, input.file, 'proofs');
    }

    const [payment] = await this.db
      .insert(payments)
      .values({
        invoiceId,
        amount: invoice.amount,
        status: PaymentStatus.PENDING_REVIEW,
        note: input.note?.trim() || null,
        proofPath,
        proofOriginalName: input.file?.originalname ?? null,
        proofMimeType: input.file?.mimetype ?? null,
        submittedBy: renterId,
      })
      .returning();

    await this.notify.send({
      userId: invoice.lease.unit.property.landlordId,
      type: 'PAYMENT_SUBMITTED',
      title: 'Payment submitted for review',
      body: `${invoice.lease.renter.fullName} submitted payment for ${invoice.lease.unit.property.name} · ${invoice.lease.unit.label}.`,
      relatedInvoiceId: invoice.id,
    });

    return this.toPaymentDto(payment, invoice);
  }

  async listPendingForLandlord(landlordId: string) {
    const leaseIds = await this.leaseIdsForLandlord(landlordId);
    if (!leaseIds.length) return [];

    const invoiceRows = await this.db
      .select({ id: invoices.id })
      .from(invoices)
      .where(inArray(invoices.leaseId, leaseIds));

    if (!invoiceRows.length) return [];

    const rows = await this.db.query.payments.findMany({
      where: and(
        inArray(
          payments.invoiceId,
          invoiceRows.map((i) => i.id),
        ),
        eq(payments.status, PaymentStatus.PENDING_REVIEW),
      ),
      orderBy: [desc(payments.createdAt)],
      with: {
        invoice: {
          with: {
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
        },
      },
    });

    return rows.map((row) => this.toPaymentDto(row, row.invoice));
  }

  async confirm(landlordId: string, paymentId: string) {
    const payment = await this.loadPayment(paymentId);
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    this.assertLandlordOwnsPayment(landlordId, payment);
    if (payment.status !== PaymentStatus.PENDING_REVIEW) {
      throw new BadRequestException('Only pending payments can be confirmed');
    }

    await this.db
      .update(payments)
      .set({
        status: PaymentStatus.CONFIRMED,
        reviewedBy: landlordId,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(payments.id, paymentId));

    await this.db
      .update(invoices)
      .set({
        status: InvoiceStatus.PAID,
        paidAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, payment.invoiceId));

    await this.notify.send({
      userId: payment.invoice.lease.renterId,
      type: 'PAYMENT_CONFIRMED',
      title: 'Payment confirmed',
      body: `Your payment for ${payment.invoice.lease.unit.property.name} · ${payment.invoice.lease.unit.label} was confirmed.`,
      relatedInvoiceId: payment.invoiceId,
    });

    await this.audit.log({
      actorId: landlordId,
      action: 'PAYMENT_CONFIRMED',
      entityType: 'payment',
      entityId: paymentId,
      summary: `Confirmed payment for invoice ${payment.invoiceId}`,
    });

    const updated = await this.loadPayment(paymentId);
    return this.toPaymentDto(updated!, updated!.invoice);
  }

  async reject(landlordId: string, paymentId: string) {
    const payment = await this.loadPayment(paymentId);
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    this.assertLandlordOwnsPayment(landlordId, payment);
    if (payment.status !== PaymentStatus.PENDING_REVIEW) {
      throw new BadRequestException('Only pending payments can be rejected');
    }

    await this.db
      .update(payments)
      .set({
        status: PaymentStatus.REJECTED,
        reviewedBy: landlordId,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(payments.id, paymentId));

    await this.notify.send({
      userId: payment.invoice.lease.renterId,
      type: 'PAYMENT_REJECTED',
      title: 'Payment rejected',
      body: `Your payment for ${payment.invoice.lease.unit.property.name} · ${payment.invoice.lease.unit.label} was rejected. Please resubmit.`,
      relatedInvoiceId: payment.invoiceId,
    });

    await this.audit.log({
      actorId: landlordId,
      action: 'PAYMENT_REJECTED',
      entityType: 'payment',
      entityId: paymentId,
      summary: `Rejected payment for invoice ${payment.invoiceId}`,
    });

    const updated = await this.loadPayment(paymentId);
    return this.toPaymentDto(updated!, updated!.invoice);
  }

  async getProofFile(actor: { id: string; role: string }, paymentId: string) {
    const payment = await this.loadPayment(paymentId);
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    const landlordId = payment.invoice.lease.unit.property.landlordId;
    const renterId = payment.invoice.lease.renterId;
    const allowed =
      (actor.role === 'LANDLORD' && actor.id === landlordId) ||
      (actor.role === 'RENTER' && actor.id === renterId);

    if (!allowed) {
      throw new ForbiddenException('You cannot view this proof');
    }
    if (!payment.proofPath) {
      throw new NotFoundException('No proof uploaded for this payment');
    }

    if (isS3Path(payment.proofPath)) {
      try {
        const { stream, contentType } = await this.storage.getObjectStream(
          s3KeyFromPath(payment.proofPath),
        );
        return {
          file: new StreamableFile(stream),
          mimeType: payment.proofMimeType ?? contentType ?? 'application/octet-stream',
          filename: payment.proofOriginalName ?? s3KeyFromPath(payment.proofPath),
        };
      } catch {
        throw new NotFoundException('Proof file missing on storage');
      }
    }

    const fullPath = join(UPLOAD_DIR, payment.proofPath);
    if (!existsSync(fullPath)) {
      throw new NotFoundException('Proof file missing on server');
    }

    const stream = createReadStream(fullPath);
    return {
      file: new StreamableFile(stream),
      mimeType: payment.proofMimeType ?? 'application/octet-stream',
      filename: payment.proofOriginalName ?? payment.proofPath,
    };
  }

  async latestPendingByInvoiceIds(invoiceIds: string[]) {
    if (!invoiceIds.length) return new Map<string, { id: string; status: string; hasProof: boolean; note: string | null }>();

    const rows = await this.db.query.payments.findMany({
      where: and(
        inArray(payments.invoiceId, invoiceIds),
        eq(payments.status, PaymentStatus.PENDING_REVIEW),
      ),
      orderBy: [desc(payments.createdAt)],
    });

    const map = new Map<
      string,
      { id: string; status: string; hasProof: boolean; note: string | null; createdAt: Date }
    >();

    for (const row of rows) {
      if (!map.has(row.invoiceId)) {
        map.set(row.invoiceId, {
          id: row.id,
          status: row.status,
          hasProof: Boolean(row.proofPath),
          note: row.note,
          createdAt: row.createdAt,
        });
      }
    }

    return map;
  }

  private assertLandlordOwnsPayment(
    landlordId: string,
    payment: NonNullable<Awaited<ReturnType<PaymentService['loadPayment']>>>,
  ) {
    if (payment.invoice.lease.unit.property.landlordId !== landlordId) {
      throw new ForbiddenException('You cannot review this payment');
    }
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

  private async loadInvoice(invoiceId: string) {
    return this.db.query.invoices.findFirst({
      where: eq(invoices.id, invoiceId),
      with: {
        lease: {
          with: {
            renter: { columns: { id: true, email: true, fullName: true } },
            unit: { with: { property: true } },
          },
        },
      },
    });
  }

  private async loadPayment(paymentId: string) {
    return this.db.query.payments.findFirst({
      where: eq(payments.id, paymentId),
      with: {
        invoice: {
          with: {
            lease: {
              with: {
                renter: { columns: { id: true, email: true, fullName: true } },
                unit: { with: { property: true } },
              },
            },
          },
        },
      },
    });
  }

  private toPaymentDto(
    payment: {
      id: string;
      invoiceId: string;
      amount: number;
      status: string;
      note: string | null;
      proofPath: string | null;
      proofOriginalName: string | null;
      createdAt: Date;
      reviewedAt: Date | null;
    },
    invoice: {
      id: string;
      periodYear: number;
      periodMonth: number;
      dueDate: string;
      status: string;
      lease: {
        renter: { id: string; email: string; fullName: string };
        unit: {
          id: string;
          label: string;
          property: { id: string; name: string; address: string };
        };
      };
    },
  ) {
    return {
      id: payment.id,
      invoiceId: payment.invoiceId,
      amount: payment.amount,
      status: payment.status,
      note: payment.note,
      hasProof: Boolean(payment.proofPath),
      proofOriginalName: payment.proofOriginalName,
      createdAt: payment.createdAt,
      reviewedAt: payment.reviewedAt,
      invoice: {
        id: invoice.id,
        periodYear: invoice.periodYear,
        periodMonth: invoice.periodMonth,
        dueDate: invoice.dueDate,
        status: invoice.status,
      },
      renter: invoice.lease.renter,
      unit: {
        id: invoice.lease.unit.id,
        label: invoice.lease.unit.label,
      },
      property: {
        id: invoice.lease.unit.property.id,
        name: invoice.lease.unit.property.name,
        address: invoice.lease.unit.property.address,
      },
    };
  }
}
