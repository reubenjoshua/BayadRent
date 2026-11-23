import { z } from 'zod';

export const UserRole = {
  LANDLORD: 'LANDLORD',
  RENTER: 'RENTER',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const InvoiceStatus = {
  DRAFT: 'DRAFT',
  DUE: 'DUE',
  PARTIAL: 'PARTIAL',
  PAID: 'PAID',
  OVERDUE: 'OVERDUE',
  WAIVED: 'WAIVED',
} as const;

export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];

export const PaymentStatus = {
  PENDING: 'PENDING',
  PENDING_REVIEW: 'PENDING_REVIEW',
  CONFIRMED: 'CONFIRMED',
  REJECTED: 'REJECTED',
  FAILED: 'FAILED',
} as const;

export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(2),
  role: z.enum([UserRole.LANDLORD, UserRole.RENTER]),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const LeaseStatus = {
  ACTIVE: 'ACTIVE',
  ENDED: 'ENDED',
} as const;

export type LeaseStatus = (typeof LeaseStatus)[keyof typeof LeaseStatus];

export const createPropertySchema = z.object({
  name: z.string().min(2),
  address: z.string().min(5),
});

export type CreatePropertyInput = z.infer<typeof createPropertySchema>;

export const createUnitSchema = z.object({
  label: z.string().min(1),
});

export type CreateUnitInput = z.infer<typeof createUnitSchema>;

export const createLeaseSchema = z.object({
  renterEmail: z.string().email(),
  rentAmount: z.number().int().positive(),
  dueDay: z.number().int().min(1).max(28),
  startDate: z.string().optional(),
});

export type CreateLeaseInput = z.infer<typeof createLeaseSchema>;

export const generateInvoicesSchema = z.object({
  year: z.number().int().min(2020).max(2100).optional(),
  month: z.number().int().min(1).max(12).optional(),
});

export type GenerateInvoicesInput = z.infer<typeof generateInvoicesSchema>;
