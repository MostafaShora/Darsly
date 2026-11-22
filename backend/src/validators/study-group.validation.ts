import { z } from "zod";
import {
    objectIdSchema,
    paginationQueryFields,
} from "./common.validation";

const decimalStringSchema = z
    .string()
    .trim()
    .max(128)
    .regex(/^\d+(?:\.\d+)?$/, "Monthly fee must be a non-negative decimal string")
    .refine(
        (value) => value.replace(".", "").replace(/^0+/, "").length <= 34,
        "Monthly fee exceeds Decimal128 precision"
    );

const capacitySchema = z.number().int().min(1).max(1000).nullable();

export const studyGroupListQuerySchema = z.object({
    ...paginationQueryFields,
    search: z.string().trim().max(100).optional(),
    subjectId: objectIdSchema.optional(),
    status: z.enum(["active", "inactive", "archived"]).optional(),
});

export const studyGroupParamsSchema = z.object({
    groupId: objectIdSchema,
});

export const createStudyGroupSchema = z.strictObject({
    subjectId: objectIdSchema,
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(1000).optional(),
    monthlyFee: decimalStringSchema,
    capacity: capacitySchema.optional(),
});

export const updateStudyGroupSchema = z
    .strictObject({
        subjectId: objectIdSchema.optional(),
        name: z.string().trim().min(2).max(120).optional(),
        description: z.string().trim().max(1000).optional(),
        monthlyFee: decimalStringSchema.optional(),
        capacity: capacitySchema.optional(),
        status: z.enum(["active", "inactive", "archived"]).optional(),
    })
    .refine((value) => Object.keys(value).length > 0, {
        message: "Provide at least one field to update",
    });

export type StudyGroupListQuery = z.infer<typeof studyGroupListQuerySchema>;
export type CreateStudyGroupInput = z.infer<typeof createStudyGroupSchema>;
export type UpdateStudyGroupInput = z.infer<typeof updateStudyGroupSchema>;
