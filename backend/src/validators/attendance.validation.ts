import { z } from "zod";
import {
    objectIdSchema,
    paginationQueryFields,
} from "./common.validation";

const isoDateSchema = z
    .iso.datetime({ offset: true })
    .transform((value) => new Date(value));

const attendanceStatusSchema = z.enum([
    "present",
    "absent",
    "late",
    "excused",
]);

const dateRangeFields = {
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
};

const refineDateRange = <T extends { from?: Date; to?: Date }>(value: T) =>
    value.from === undefined ||
    value.to === undefined ||
    value.from <= value.to;

export const sessionAttendanceListQuerySchema = z.object({
    ...paginationQueryFields,
    status: attendanceStatusSchema.optional(),
});

export const studentAttendanceListQuerySchema = z
    .object({
        ...paginationQueryFields,
        ...dateRangeFields,
        status: attendanceStatusSchema.optional(),
    })
    .refine(refineDateRange, {
        message: "from must be before or equal to to",
        path: ["to"],
    });

export const sessionAttendanceParamsSchema = z.object({
    sessionId: objectIdSchema,
});

export const attendanceRecordParamsSchema = z.object({
    sessionId: objectIdSchema,
    attendanceId: objectIdSchema,
});

export const studentAttendanceParamsSchema = z.object({
    studentId: objectIdSchema,
});

export const createAttendanceRecordSchema = z.strictObject({
    studentId: objectIdSchema,
    status: attendanceStatusSchema.optional(),
    lateMinutes: z.number().min(0).optional(),
    notes: z.string().trim().max(1000).optional(),
});

export const updateAttendanceRecordSchema = z
    .strictObject({
        status: attendanceStatusSchema.optional(),
        lateMinutes: z.number().min(0).optional(),
        notes: z.string().trim().max(1000).optional(),
    })
    .refine((value) => Object.keys(value).length > 0, {
        message: "Provide at least one field to update",
    });

export type SessionAttendanceListQuery = z.infer<
    typeof sessionAttendanceListQuerySchema
>;
export type StudentAttendanceListQuery = z.infer<
    typeof studentAttendanceListQuerySchema
>;
export type CreateAttendanceRecordInput = z.infer<
    typeof createAttendanceRecordSchema
>;
export type UpdateAttendanceRecordInput = z.infer<
    typeof updateAttendanceRecordSchema
>;
