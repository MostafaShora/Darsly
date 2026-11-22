import { z } from "zod";
import {
    objectIdSchema,
    paginationQueryFields,
} from "./common.validation";

export const subjectListQuerySchema = z.object({
    ...paginationQueryFields,
    search: z.string().trim().max(100).optional(),
    status: z.enum(["active", "archived"]).optional(),
});

export const subjectParamsSchema = z.object({
    subjectId: objectIdSchema,
});

export const createSubjectSchema = z.strictObject({
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().max(1000).optional(),
});

export const updateSubjectSchema = z
    .strictObject({
        name: z.string().trim().min(2).max(100).optional(),
        description: z.string().trim().max(1000).optional(),
        status: z.enum(["active", "archived"]).optional(),
    })
    .refine((value) => Object.keys(value).length > 0, {
        message: "Provide at least one field to update",
    });

export type SubjectListQuery = z.infer<typeof subjectListQuerySchema>;
export type CreateSubjectInput = z.infer<typeof createSubjectSchema>;
export type UpdateSubjectInput = z.infer<typeof updateSubjectSchema>;
