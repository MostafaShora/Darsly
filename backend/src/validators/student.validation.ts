import { z } from "zod";
import {
    objectIdSchema,
    paginationQueryFields,
} from "./common.validation";
import { guardianRelationshipSchema } from "./guardian.validation";

const optionalEmailSchema = z
    .string()
    .trim()
    .email("Invalid email address")
    .max(254)
    .transform((value) => value.toLowerCase())
    .nullable()
    .optional();

const optionalPhoneSchema = z.string().trim().max(25).nullable().optional();

export const studentListQuerySchema = z.object({
    ...paginationQueryFields,
    search: z.string().trim().max(100).optional(),
    status: z.enum(["active", "inactive", "archived"]).optional(),
});

export const studentParamsSchema = z.object({
    studentId: objectIdSchema,
});

export const studentGuardianParamsSchema = z.object({
    studentId: objectIdSchema,
    guardianId: objectIdSchema,
});

export const createStudentSchema = z.object({
    name: z.string().trim().min(2).max(120),
    phone: optionalPhoneSchema,
    email: optionalEmailSchema,
    schoolName: z.string().trim().max(150).optional(),
    grade: z.string().trim().max(80).optional(),
    status: z.enum(["active", "inactive", "archived"]).optional(),
    notes: z.string().trim().max(2000).optional(),
});

export const updateStudentSchema = z
    .object({
        name: z.string().trim().min(2).max(120).optional(),
        phone: optionalPhoneSchema,
        email: optionalEmailSchema,
        schoolName: z.string().trim().max(150).optional(),
        grade: z.string().trim().max(80).optional(),
        status: z.enum(["active", "inactive", "archived"]).optional(),
        notes: z.string().trim().max(2000).optional(),
    })
    .refine((value) => Object.keys(value).length > 0, {
        message: "Provide at least one field to update",
    });

export const createStudentGuardianSchema = z.object({
    guardianId: objectIdSchema,
    relationship: guardianRelationshipSchema.optional(),
    isPrimary: z.boolean().optional(),
    receivesNotifications: z.boolean().optional(),
});

export const updateStudentGuardianSchema = z
    .object({
        relationship: guardianRelationshipSchema.optional(),
        isPrimary: z.boolean().optional(),
        receivesNotifications: z.boolean().optional(),
    })
    .refine((value) => Object.keys(value).length > 0, {
        message: "Provide at least one field to update",
    });

export type StudentListQuery = z.infer<typeof studentListQuerySchema>;
export type CreateStudentInput = z.infer<typeof createStudentSchema>;
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;
export type CreateStudentGuardianInput = z.infer<typeof createStudentGuardianSchema>;
export type UpdateStudentGuardianInput = z.infer<typeof updateStudentGuardianSchema>;
