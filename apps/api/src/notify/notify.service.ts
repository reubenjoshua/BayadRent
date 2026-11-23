import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InvoiceStatus } from '@bayadrent/shared-types';
import { Queue, Worker, type Job } from 'bullmq';
import { and, desc, eq, gte, inArray, isNull } from 'drizzle-orm';
import { DATABASE } from '../db/db.constants';
import type { Database } from '../db';
import { invoices, leases, notifications, properties, units, users } from '../db/schema';
import { MailService } from './mail.service';
import { createRedisConnection } from './redis.connection';

const QUEUE_NAME = 'bayadrent-reminders';
const JOB_NAME = 'run-reminders';

type ReminderJobData = {
  landlordId?: string;
  triggeredBy?: string;
  force?: boolean;
};

@Injectable()
export class NotifyService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotifyService.name);
  private connection!: ReturnType<typeof createRedisConnection>;
  private queue!: Queue<ReminderJobData>;
  private worker!: Worker<ReminderJobData>;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  async onModuleInit() {
    this.connection = createRedisConnection(this.config);
    this.queue = new Queue<ReminderJobData>(QUEUE_NAME, {
      connection: this.connection,
    });

    this.worker = new Worker<ReminderJobData>(
      QUEUE_NAME,
      async (job) => this.processReminders(job),
      { connection: this.connection.duplicate() },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Reminder job ${job?.id} failed: ${err.message}`);
    });

    await this.queue.add(
      JOB_NAME,
      { triggeredBy: 'scheduler' },
      {
        repeat: { every: 6 * 60 * 60 * 1000 },
        jobId: 'scheduled-reminders',
        removeOnComplete: 20,
        removeOnFail: 50,
      },
    );

    this.logger.log('Reminder queue worker started (every 6 hours)');
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
    await this.connection?.quit();
  }

  async enqueueReminders(
    input: { landlordId?: string; triggeredBy?: string; force?: boolean } = {},
  ) {
    // Manual runs execute immediately so the UI can show real results.
    // Scheduled BullMQ jobs still use the worker path.
    const result = await this.runReminders({
      landlordId: input.landlordId,
      triggeredBy: input.triggeredBy ?? 'manual',
      force: input.force ?? true,
    });

    let message: string;
    if (result.leaseCount === 0) {
      message =
        'No leases found for your account. Add a property, unit, and renter lease first.';
    } else if (result.scanned === 0) {
      message =
        'No due/overdue invoices to remind about. Generate invoices first (and ensure some are unpaid).';
    } else if (result.created === 0) {
      message = `Checked ${result.scanned} invoice(s); no new reminders (already sent in the last 24h, or use force).`;
    } else {
      message = `Sent ${result.created} reminder(s) for ${result.scanned} due/overdue invoice(s).`;
    }

    return {
      ...result,
      queued: false,
      message,
    };
  }

  async listForUser(userId: string) {
    const rows = await this.db.query.notifications.findMany({
      where: eq(notifications.userId, userId),
      orderBy: [desc(notifications.createdAt)],
      limit: 50,
    });

    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      body: row.body,
      relatedInvoiceId: row.relatedInvoiceId,
      readAt: row.readAt,
      createdAt: row.createdAt,
    }));
  }

  async markRead(userId: string, notificationId: string) {
    const [updated] = await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
      .returning();

    return updated ?? null;
  }

  async markAllRead(userId: string) {
    await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));

    return { ok: true };
  }

  async send(input: {
    userId: string;
    type: 'RENT_DUE' | 'RENT_OVERDUE' | 'PAYMENT_SUBMITTED' | 'PAYMENT_CONFIRMED' | 'PAYMENT_REJECTED';
    title: string;
    body: string;
    relatedInvoiceId?: string | null;
  }) {
    return this.createNotification(input);
  }

  private async processReminders(job: Job<ReminderJobData>) {
    const result = await this.runReminders(job.data);
    this.logger.log(
      `Reminders processed (job=${job.id}, created=${result.created}, scanned=${result.scanned})`,
    );
    return result;
  }

  private async runReminders(data: ReminderJobData) {
    const landlordId = data.landlordId;
    const force = Boolean(data.force);
    const leaseIds = landlordId
      ? await this.leaseIdsForLandlord(landlordId)
      : await this.allActiveLeaseIds();

    await this.refreshOverdue(leaseIds);

    if (!leaseIds.length) {
      return { created: 0, scanned: 0, leaseCount: 0 };
    }

    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);
    const soon = new Date(today);
    soon.setUTCDate(soon.getUTCDate() + 3);
    const soonIso = soon.toISOString().slice(0, 10);

    const rows = await this.db.query.invoices.findMany({
      where: and(
        inArray(invoices.leaseId, leaseIds),
        inArray(invoices.status, [InvoiceStatus.DUE, InvoiceStatus.OVERDUE]),
      ),
      with: {
        lease: {
          with: {
            renter: true,
            unit: {
              with: { property: true },
            },
          },
        },
      },
    });

    const candidates = rows.filter((row) => {
      if (row.status === InvoiceStatus.OVERDUE) return true;
      return row.dueDate >= todayIso && row.dueDate <= soonIso;
    });

    let created = 0;

    for (const invoice of candidates) {
      const type =
        invoice.status === InvoiceStatus.OVERDUE || invoice.dueDate < todayIso
          ? 'RENT_OVERDUE'
          : 'RENT_DUE';

      const alreadyRenter =
        !force &&
        (await this.recentNotificationExists(invoice.lease.renterId, type, invoice.id));
      if (alreadyRenter) continue;

      const amount = new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP',
        maximumFractionDigits: 0,
      }).format(invoice.amount);

      const title =
        type === 'RENT_OVERDUE' ? 'Rent payment overdue' : 'Rent payment due soon';
      const body =
        type === 'RENT_OVERDUE'
          ? `${invoice.lease.unit.property.name} · ${invoice.lease.unit.label}: ${amount} was due on ${invoice.dueDate}.`
          : `${invoice.lease.unit.property.name} · ${invoice.lease.unit.label}: ${amount} is due on ${invoice.dueDate}.`;

      await this.createNotification({
        userId: invoice.lease.renterId,
        type,
        title,
        body,
        relatedInvoiceId: invoice.id,
      });
      created += 1;

      if (type === 'RENT_OVERDUE') {
        const landlordAlready =
          !force &&
          (await this.recentNotificationExists(
            invoice.lease.unit.property.landlordId,
            'RENT_OVERDUE',
            invoice.id,
          ));
        if (!landlordAlready) {
          await this.createNotification({
            userId: invoice.lease.unit.property.landlordId,
            type: 'RENT_OVERDUE',
            title: 'Tenant overdue',
            body: `${invoice.lease.renter.fullName} is overdue for ${invoice.lease.unit.property.name} · ${invoice.lease.unit.label} (${amount}).`,
            relatedInvoiceId: invoice.id,
          });
          created += 1;
        }
      }
    }

    return { created, scanned: candidates.length, leaseCount: leaseIds.length };
  }

  private async createNotification(input: {
    userId: string;
    type: 'RENT_DUE' | 'RENT_OVERDUE' | 'PAYMENT_SUBMITTED' | 'PAYMENT_CONFIRMED' | 'PAYMENT_REJECTED';
    title: string;
    body: string;
    relatedInvoiceId?: string | null;
  }) {
    const [row] = await this.db
      .insert(notifications)
      .values({
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        relatedInvoiceId: input.relatedInvoiceId ?? null,
        channel: 'inbox',
      })
      .returning();

    const user = await this.db.query.users.findFirst({
      where: eq(users.id, input.userId),
      columns: { email: true, fullName: true },
    });
    if (user?.email) {
      try {
        const result = await this.mail.send(
          user.email,
          `[BayadRent] ${input.title}`,
          `Hi ${user.fullName},\n\n${input.body}\n\n— BayadRent`,
        );
        if (result.delivered) {
          await this.db
            .update(notifications)
            .set({ channel: 'inbox+email' })
            .where(eq(notifications.id, row.id));
        }
      } catch (err) {
        this.logger.warn(
          `Email delivery failed for ${user.email}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    return row;
  }

  private async recentNotificationExists(
    userId: string,
    type: 'RENT_DUE' | 'RENT_OVERDUE',
    invoiceId: string,
  ) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const existing = await this.db.query.notifications.findFirst({
      where: and(
        eq(notifications.userId, userId),
        eq(notifications.type, type),
        eq(notifications.relatedInvoiceId, invoiceId),
        gte(notifications.createdAt, since),
      ),
    });
    return Boolean(existing);
  }

  private async refreshOverdue(leaseIds: string[]) {
    if (!leaseIds.length) return;
    const today = new Date().toISOString().slice(0, 10);
    const dueRows = await this.db.query.invoices.findMany({
      where: and(
        inArray(invoices.leaseId, leaseIds),
        eq(invoices.status, InvoiceStatus.DUE),
      ),
    });
    const overdueIds = dueRows.filter((row) => row.dueDate < today).map((row) => row.id);
    if (!overdueIds.length) return;

    await this.db
      .update(invoices)
      .set({ status: InvoiceStatus.OVERDUE, updatedAt: new Date() })
      .where(inArray(invoices.id, overdueIds));
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

  private async allActiveLeaseIds() {
    const leaseRows = await this.db
      .select({ id: leases.id })
      .from(leases)
      .where(eq(leases.status, 'ACTIVE'));
    return leaseRows.map((l) => l.id);
  }
}
