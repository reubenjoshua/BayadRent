import { relations } from 'drizzle-orm';
import {
  boolean,
  date,
  integer,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', ['LANDLORD', 'RENTER']);
export const leaseStatusEnum = pgEnum('lease_status', ['ACTIVE', 'ENDED']);
export const invoiceStatusEnum = pgEnum('invoice_status', [
  'DRAFT',
  'DUE',
  'PARTIAL',
  'PAID',
  'OVERDUE',
  'WAIVED',
]);
export const paymentStatusEnum = pgEnum('payment_status', [
  'PENDING',
  'PENDING_REVIEW',
  'CONFIRMED',
  'REJECTED',
  'FAILED',
]);
export const notificationTypeEnum = pgEnum('notification_type', [
  'RENT_DUE',
  'RENT_OVERDUE',
  'PAYMENT_SUBMITTED',
  'PAYMENT_CONFIRMED',
  'PAYMENT_REJECTED',
]);
export const invoiceLineKindEnum = pgEnum('invoice_line_kind', ['RENT', 'UTILITY']);

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  fullName: varchar('full_name', { length: 255 }).notNull(),
  role: userRoleEnum('role').notNull(),
  phone: varchar('phone', { length: 40 }),
  emergencyContactName: varchar('emergency_contact_name', { length: 255 }),
  emergencyContactPhone: varchar('emergency_contact_phone', { length: 40 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const properties = pgTable('properties', {
  id: uuid('id').defaultRandom().primaryKey(),
  landlordId: uuid('landlord_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  address: varchar('address', { length: 500 }).notNull(),
  gcashAccountName: varchar('gcash_account_name', { length: 255 }),
  gcashMobileNumber: varchar('gcash_mobile_number', { length: 40 }),
  gcashQrPath: varchar('gcash_qr_path', { length: 500 }),
  gcashQrOriginalName: varchar('gcash_qr_original_name', { length: 255 }),
  gcashQrMimeType: varchar('gcash_qr_mime_type', { length: 100 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const propertyUtilityTypes = pgTable('property_utility_types', {
  id: uuid('id').defaultRandom().primaryKey(),
  propertyId: uuid('property_id')
    .notNull()
    .references(() => properties.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  /** e.g. kWh, m³ — used with unitRate for amount = round(rate × quantity) */
  unitLabel: varchar('unit_label', { length: 20 }).notNull().default('unit'),
  /** Pesos per unit, e.g. 15.06 for Meralco ₱/kWh */
  unitRate: numeric('unit_rate', { precision: 12, scale: 4 }).notNull().default('0'),
  sortOrder: integer('sort_order').notNull().default(0),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const units = pgTable('units', {
  id: uuid('id').defaultRandom().primaryKey(),
  propertyId: uuid('property_id')
    .notNull()
    .references(() => properties.id, { onDelete: 'cascade' }),
  label: varchar('label', { length: 100 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const leases = pgTable('leases', {
  id: uuid('id').defaultRandom().primaryKey(),
  unitId: uuid('unit_id')
    .notNull()
    .references(() => units.id, { onDelete: 'cascade' }),
  renterId: uuid('renter_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  rentAmount: integer('rent_amount').notNull(),
  dueDay: smallint('due_day').notNull(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date'),
  status: leaseStatusEnum('status').notNull().default('ACTIVE'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    leaseId: uuid('lease_id')
      .notNull()
      .references(() => leases.id, { onDelete: 'cascade' }),
    periodYear: integer('period_year').notNull(),
    periodMonth: integer('period_month').notNull(),
    /** Remaining balance due */
    amount: integer('amount').notNull(),
    /** Bill total from line items (rent + utilities) */
    originalAmount: integer('original_amount'),
    /** Cumulative partial payments recorded */
    amountPaid: integer('amount_paid').notNull().default(0),
    dueDate: date('due_date').notNull(),
    status: invoiceStatusEnum('status').notNull().default('DUE'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique('invoices_lease_period_uq').on(table.leaseId, table.periodYear, table.periodMonth)],
);

export const invoiceLineItems = pgTable('invoice_line_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  invoiceId: uuid('invoice_id')
    .notNull()
    .references(() => invoices.id, { onDelete: 'cascade' }),
  kind: invoiceLineKindEnum('kind').notNull(),
  label: varchar('label', { length: 100 }).notNull(),
  amount: integer('amount').notNull().default(0),
  /** Snapshot of rate used for this month (utilities only) */
  unitRate: numeric('unit_rate', { precision: 12, scale: 4 }),
  unitLabel: varchar('unit_label', { length: 20 }),
  /** Consumed units this period (utilities only) */
  quantity: numeric('quantity', { precision: 12, scale: 4 }).notNull().default('0'),
  utilityTypeId: uuid('utility_type_id').references(() => propertyUtilityTypes.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const payments = pgTable('payments', {
  id: uuid('id').defaultRandom().primaryKey(),
  invoiceId: uuid('invoice_id')
    .notNull()
    .references(() => invoices.id, { onDelete: 'cascade' }),
  amount: integer('amount').notNull(),
  status: paymentStatusEnum('status').notNull().default('PENDING_REVIEW'),
  note: text('note'),
  proofPath: varchar('proof_path', { length: 500 }),
  proofOriginalName: varchar('proof_original_name', { length: 255 }),
  proofMimeType: varchar('proof_mime_type', { length: 100 }),
  submittedBy: uuid('submitted_by')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const notifications = pgTable('notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: notificationTypeEnum('type').notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  body: text('body').notNull(),
  relatedInvoiceId: uuid('related_invoice_id').references(() => invoices.id, {
    onDelete: 'set null',
  }),
  channel: varchar('channel', { length: 50 }).notNull().default('inbox'),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const auditEvents = pgTable('audit_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 100 }).notNull(),
  entityType: varchar('entity_type', { length: 50 }).notNull(),
  entityId: uuid('entity_id'),
  summary: text('summary').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  properties: many(properties),
  leases: many(leases),
  notifications: many(notifications),
}));

export const propertiesRelations = relations(properties, ({ one, many }) => ({
  landlord: one(users, {
    fields: [properties.landlordId],
    references: [users.id],
  }),
  units: many(units),
  utilityTypes: many(propertyUtilityTypes),
}));

export const propertyUtilityTypesRelations = relations(propertyUtilityTypes, ({ one, many }) => ({
  property: one(properties, {
    fields: [propertyUtilityTypes.propertyId],
    references: [properties.id],
  }),
  lineItems: many(invoiceLineItems),
}));

export const unitsRelations = relations(units, ({ one, many }) => ({
  property: one(properties, {
    fields: [units.propertyId],
    references: [properties.id],
  }),
  leases: many(leases),
}));

export const leasesRelations = relations(leases, ({ one, many }) => ({
  unit: one(units, {
    fields: [leases.unitId],
    references: [units.id],
  }),
  renter: one(users, {
    fields: [leases.renterId],
    references: [users.id],
  }),
  invoices: many(invoices),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  lease: one(leases, {
    fields: [invoices.leaseId],
    references: [leases.id],
  }),
  payments: many(payments),
  lineItems: many(invoiceLineItems),
}));

export const invoiceLineItemsRelations = relations(invoiceLineItems, ({ one }) => ({
  invoice: one(invoices, {
    fields: [invoiceLineItems.invoiceId],
    references: [invoices.id],
  }),
  utilityType: one(propertyUtilityTypes, {
    fields: [invoiceLineItems.utilityTypeId],
    references: [propertyUtilityTypes.id],
  }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  invoice: one(invoices, {
    fields: [payments.invoiceId],
    references: [invoices.id],
  }),
  submitter: one(users, {
    fields: [payments.submittedBy],
    references: [users.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
  invoice: one(invoices, {
    fields: [notifications.relatedInvoiceId],
    references: [invoices.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Property = typeof properties.$inferSelect;
export type Unit = typeof units.$inferSelect;
export type Lease = typeof leases.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type PropertyUtilityType = typeof propertyUtilityTypes.$inferSelect;
export type InvoiceLineItem = typeof invoiceLineItems.$inferSelect;
