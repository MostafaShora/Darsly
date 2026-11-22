import { z } from "zod";
import {
    objectIdSchema,
    paginationQueryFields,
} from "./common.validation";

const isoDateSchema = z
    .iso.datetime({ offset: true })
    .transform((value) => new Date(value));

export const enrollmentListQuerySchema = z.object({
    ...paginationQueryFields,
    studentId: objectIdSchema.optional(),
    groupId: objectIdSchema.optional(),
    status: z.enum(["active", "paused", "completed", "cancelled"]).optional(),
});

export const groupEnrollmentListQuerySchema = z.object({
    ...paginationQueryFields,
    studentId: objectIdSchema.optional(),
    status: z.enum(["active", "paused", "completed", "cancelled"]).optional(),
});

export const enrollmentParamsSchema = z.object({
    enrollmentId: objectIdSchema,
});

export const groupEnrollmentParamsSchema = z.object({
    groupId: objectIdSchema,
});

export const createEnrollmentSchema = z.strictObject({
    studentId: objectIdSchema,
    enrolledAt: isoDateSchema.optional(),
    notes: z.string().trim().max(1000).optional(),
    status: z.enum(["active", "paused"]).optional(),
});

export const updateEnrollmentSchema = z
    .strictObject({
        status: z.enum(["active", "paused", "completed", "cancelled"]).optional(),
        endedAt: isoDateSchema.nullable().optional(),
        notes: z.string().trim().max(1000).optional(),
    })
    .refine((value) => Object.keys(value).length > 0, {
        message: "Provide at least one field to update",
    });

export type EnrollmentListQuery = z.infer<typeof enrollmentListQuerySchema>;
export type GroupEnrollmentListQuery = z.infer<
    typeof groupEnrollmentListQuerySchema
>;
export type CreateEnrollmentInput = z.infer<typeof createEnrollmentSchema>;
export type UpdateEnrollmentInput = z.infer<typeof updateEnrollmentSchema>;
