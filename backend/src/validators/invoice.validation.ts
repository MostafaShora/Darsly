import { z } from "zod";
import {
    objectIdSchema,
    paginationQueryFields,
} from "./common.validation";

const calendarDateSchema = z.iso.date();
const invoiceStatusValueSchema = z.enum(["draft", "issued", "void"]);
const dueDateSchema = z.iso.datetime({ offset: true }).transform(
    (value) => new Date(value)
);

const invoicePeriodFields = {
    periodStart: calendarDateSchema,
    periodEnd: calendarDateSchema,
};

const periodRangeIsValid = (value: {
    periodStart?: string;
    periodEnd?: string;
}) =>
    value.periodStart === undefined ||
    value.periodEnd === undefined ||
    value.periodEnd >= value.periodStart;

export const invoiceListQuerySchema = z
    .object({
        ...paginationQueryFields,
        studentId: objectIdSchema.optional(),
        status: invoiceStatusValueSchema.optional(),
        from: calendarDateSchema.optional(),
        to: calendarDateSchema.optional(),
    })
    .refine(({ from, to }) => from === undefined || to === undefined || from <= to, {
        message: "from must be before or equal to to",
        path: ["to"],
    });

export const invoiceParamsSchema = z.object({
    invoiceId: objectIdSchema,
});

export const invoiceActionBodySchema = z.strictObject({}).optional();

export const invoiceAllocationParamsSchema = z.object({
    invoiceId: objectIdSchema,
});

export const createInvoiceSchema = z
    .strictObject({
        studentId: objectIdSchema,
        enrollmentId: objectIdSchema,
        ...invoicePeriodFields,
        dueDate: dueDateSchema.nullable().optional(),
        description: z.string().trim().max(500).optional(),
        notes: z.string().trim().max(2000).optional(),
        status: z.literal("draft").optional(),
    })
    .refine(periodRangeIsValid, {
        message: "periodEnd must be on or after periodStart",
        path: ["periodEnd"],
    });

export const updateInvoiceSchema = z
    .strictObject({
        studentId: objectIdSchema.optional(),
        enrollmentId: objectIdSchema.optional(),
        periodStart: calendarDateSchema.optional(),
        periodEnd: calendarDateSchema.optional(),
    })
    .refine((value) => Object.keys(value).length > 0, {
        message: "Provide at least one field to update",
    })
    .refine(periodRangeIsValid, {
        message: "periodEnd must be on or after periodStart",
        path: ["periodEnd"],
    });

export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>;
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
