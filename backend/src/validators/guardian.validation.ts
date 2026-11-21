import { z } from "zod";
import {
    objectIdSchema,
    paginationQueryFields,
} from "./common.validation";

export const guardianRelationshipSchema = z.enum([
    "father",
    "mother",
    "brother",
    "sister",
    "relative",
    "other",
]);

const optionalEmailSchema = z
    .string()
    .trim()
    .email("Invalid email address")
    .max(254)
    .transform((value) => value.toLowerCase())
    .nullable()
    .optional();

const optionalPhoneSchema = z.string().trim().max(25).nullable().optional();

export const guardianListQuerySchema = z.object({
    ...paginationQueryFields,
    search: z.string().trim().max(100).optional(),
});

export const guardianParamsSchema = z.object({
    guardianId: objectIdSchema,
});

export const createGuardianSchema = z.object({
    name: z.string().trim().min(2).max(120),
    phone: z.string().trim().min(1).max(25),
    alternatePhone: optionalPhoneSchema,
    email: optionalEmailSchema,
    relationship: guardianRelationshipSchema.optional(),
    notes: z.string().trim().max(2000).optional(),
});

export const updateGuardianSchema = z
    .object({
        name: z.string().trim().min(2).max(120).optional(),
        phone: z.string().trim().min(1).max(25).optional(),
        alternatePhone: optionalPhoneSchema,
        email: optionalEmailSchema,
        relationship: guardianRelationshipSchema.optional(),
        notes: z.string().trim().max(2000).optional(),
    })
    .refine((value) => Object.keys(value).length > 0, {
        message: "Provide at least one field to update",
    });

export type GuardianListQuery = z.infer<typeof guardianListQuerySchema>;
export type CreateGuardianInput = z.infer<typeof createGuardianSchema>;
export type UpdateGuardianInput = z.infer<typeof updateGuardianSchema>;
