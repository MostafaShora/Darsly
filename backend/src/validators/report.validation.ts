import { z } from "zod";
import {
    objectIdSchema,
    paginationQueryFields,
} from "./common.validation";

const timestampSchema = z.iso.datetime({ offset: true }).transform(
    (value) => new Date(value)
);

const timezoneSchema = z.string().trim().min(1).max(100).refine(
    (value) => {
        try {
            new Intl.DateTimeFormat("en-US", { timeZone: value });
            return true;
        } catch {
            return false;
        }
    },
    { message: "timezone must be a valid IANA timezone" }
);

const reportRangeFields = {
    from: timestampSchema.optional(),
    to: timestampSchema.optional(),
    studentId: objectIdSchema.optional(),
    groupId: objectIdSchema.optional(),
    timezone: timezoneSchema,
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

export const dashboardActivityQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(10).default(5),
});

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
export type DashboardActivityQuery = z.infer<
    typeof dashboardActivityQuerySchema
>;
export type AttendanceReportQuery = z.infer<
    typeof attendanceReportQuerySchema
>;
export type FinanceReportQuery = z.infer<typeof financeReportQuerySchema>;
