import { z } from "zod";
import {
    objectIdSchema,
    paginationQueryFields,
} from "./common.validation";

const timestampSchema = z.iso.datetime({ offset: true }).transform(
    (value) => new Date(value)
);

const reportRangeFields = {
    from: timestampSchema.optional(),
    to: timestampSchema.optional(),
    studentId: objectIdSchema.optional(),
    groupId: objectIdSchema.optional(),
    timezone: z.string().trim().min(1).max(100).optional(),
};

export const reportRangeQuerySchema = z
    .object(reportRangeFields)
    .refine(
        ({ from, to }) =>
            from === undefined || to === undefined || from <= to,
        {
            message: "from must be before or equal to to",
            path: ["to"],
        }
    );

export const attendanceReportQuerySchema = z
    .object({
        ...reportRangeFields,
        page: paginationQueryFields.page,
        pageSize: paginationQueryFields.pageSize,
        status: z.enum(["present", "absent", "late", "excused"]).optional(),
    })
    .refine(
        ({ from, to }) =>
            from === undefined || to === undefined || from <= to,
        {
            message: "from must be before or equal to to",
            path: ["to"],
        }
    );

export const financeReportQuerySchema = z
    .object({
        ...reportRangeFields,
        page: paginationQueryFields.page,
        pageSize: paginationQueryFields.pageSize,
    })
    .refine(
        ({ from, to }) =>
            from === undefined || to === undefined || from <= to,
        {
            message: "from must be before or equal to to",
            path: ["to"],
        }
    );

export type ReportRangeQuery = z.infer<typeof reportRangeQuerySchema>;
export type AttendanceReportQuery = z.infer<
    typeof attendanceReportQuerySchema
>;
export type FinanceReportQuery = z.infer<typeof financeReportQuerySchema>;
