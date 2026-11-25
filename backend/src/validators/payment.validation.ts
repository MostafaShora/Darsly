import { z } from "zod";
import {
    objectIdSchema,
    paginationQueryFields,
} from "./common.validation";
import { positiveDecimalStringSchema } from "./money.validation";

const paymentStatusSchema = z.enum([
    "pending",
    "completed",
    "failed",
    "refunded",
]);
const paymentMethodSchema = z.enum([
    "cash",
    "bank_transfer",
    "card",
    "wallet",
    "other",
]);
const timestampSchema = z.iso.datetime({ offset: true }).transform(
    (value) => new Date(value)
);

export const paymentListQuerySchema = z
    .object({
        ...paginationQueryFields,
        studentId: objectIdSchema.optional(),
        status: paymentStatusSchema.optional(),
        from: timestampSchema.optional(),
        to: timestampSchema.optional(),
    })
    .refine(
        ({ from, to }) =>
            from === undefined || to === undefined || from <= to,
        {
            message: "from must be before or equal to to",
            path: ["to"],
        }
    );

export const paymentParamsSchema = z.object({
    paymentId: objectIdSchema,
});

export const paymentAllocationParamsSchema = z.object({
    paymentId: objectIdSchema,
});

export const createPaymentSchema = z.strictObject({
    studentId: objectIdSchema,
    amount: positiveDecimalStringSchema,
    method: paymentMethodSchema,
    receivedAt: timestampSchema.optional(),
    reference: z.string().trim().max(150).nullable().optional(),
    notes: z.string().trim().max(2000).optional(),
});

export const createPaymentAllocationSchema = z.strictObject({
    invoiceId: objectIdSchema,
    amount: positiveDecimalStringSchema,
});

export type PaymentListQuery = z.infer<typeof paymentListQuerySchema>;
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type CreatePaymentAllocationInput = z.infer<
    typeof createPaymentAllocationSchema
>;
