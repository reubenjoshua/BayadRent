"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerSchema = exports.loginSchema = exports.PaymentStatus = exports.InvoiceStatus = exports.UserRole = void 0;
const zod_1 = require("zod");
exports.UserRole = {
    LANDLORD: 'LANDLORD',
    RENTER: 'RENTER',
};
exports.InvoiceStatus = {
    DRAFT: 'DRAFT',
    DUE: 'DUE',
    PARTIAL: 'PARTIAL',
    PAID: 'PAID',
    OVERDUE: 'OVERDUE',
    WAIVED: 'WAIVED',
};
exports.PaymentStatus = {
    PENDING: 'PENDING',
    PENDING_REVIEW: 'PENDING_REVIEW',
    CONFIRMED: 'CONFIRMED',
    REJECTED: 'REJECTED',
    FAILED: 'FAILED',
};
exports.loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8),
});
exports.registerSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8),
    fullName: zod_1.z.string().min(2),
    role: zod_1.z.enum([exports.UserRole.LANDLORD, exports.UserRole.RENTER]),
});
//# sourceMappingURL=index.js.map