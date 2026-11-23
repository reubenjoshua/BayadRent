import { z } from 'zod';
export declare const UserRole: {
    readonly LANDLORD: "LANDLORD";
    readonly RENTER: "RENTER";
};
export type UserRole = (typeof UserRole)[keyof typeof UserRole];
export declare const InvoiceStatus: {
    readonly DRAFT: "DRAFT";
    readonly DUE: "DUE";
    readonly PARTIAL: "PARTIAL";
    readonly PAID: "PAID";
    readonly OVERDUE: "OVERDUE";
    readonly WAIVED: "WAIVED";
};
export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];
export declare const PaymentStatus: {
    readonly PENDING: "PENDING";
    readonly PENDING_REVIEW: "PENDING_REVIEW";
    readonly CONFIRMED: "CONFIRMED";
    readonly REJECTED: "REJECTED";
    readonly FAILED: "FAILED";
};
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];
export declare const loginSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
}, z.core.$strip>;
export type LoginInput = z.infer<typeof loginSchema>;
export declare const registerSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
    fullName: z.ZodString;
    role: z.ZodEnum<{
        LANDLORD: "LANDLORD";
        RENTER: "RENTER";
    }>;
}, z.core.$strip>;
export type RegisterInput = z.infer<typeof registerSchema>;
//# sourceMappingURL=index.d.ts.map