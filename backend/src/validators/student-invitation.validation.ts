import { z } from "zod";
import {
    objectIdSchema,
    paginationQueryFields,
} from "./common.validation";

export const createStudentInvitationSchema = z.object({
    studentId: objectIdSchema,
});

export const studentInvitationListQuerySchema = z.object({
    ...paginationQueryFields,
    studentId: objectIdSchema.optional(),
});

export const studentInvitationParamsSchema = z.object({
    invitationId: objectIdSchema,
});

export type CreateStudentInvitationInput = z.infer<
    typeof createStudentInvitationSchema
>;
export type StudentInvitationListQuery = z.infer<
    typeof studentInvitationListQuerySchema
>;
