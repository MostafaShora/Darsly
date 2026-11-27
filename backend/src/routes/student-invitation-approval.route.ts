import { Router } from "express";
import {
    approveStudentInvitationRedemptionController,
    listStudentInvitationApprovalRequestsController,
    rejectStudentInvitationRedemptionController,
} from "../controllers/student-invitation-approval.controller";
import { validateRequest } from "../middlewares/validate-request.middleware";
import {
    studentInvitationApprovalListQuerySchema,
    studentInvitationApprovalParamsSchema,
} from "../validators/student-invitation-approval.validation";

const studentInvitationApprovalRoutes = Router()
    .get(
        "/",
        validateRequest({ query: studentInvitationApprovalListQuerySchema }),
        listStudentInvitationApprovalRequestsController
    )
    .post(
        "/:redemptionId/approve",
        validateRequest({ params: studentInvitationApprovalParamsSchema }),
        approveStudentInvitationRedemptionController
    )
    .post(
        "/:redemptionId/reject",
        validateRequest({ params: studentInvitationApprovalParamsSchema }),
        rejectStudentInvitationRedemptionController
    );

export default studentInvitationApprovalRoutes;
