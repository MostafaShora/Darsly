import { z } from "zod";
import {
    objectIdSchema,
    paginationQueryFields,
} from "./common.validation";

export const studentInvitationApprovalParamsSchema = z.object({
    redemptionId: objectIdSchema,
});

export const studentInvitationApprovalListQuerySchema = z.object({
    ...paginationQueryFields,
});

export type StudentInvitationApprovalListQuery = z.infer<
    typeof studentInvitationApprovalListQuerySchema
>;
