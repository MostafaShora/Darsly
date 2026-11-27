import { Router } from "express";
import {
    createStudentInvitationController,
    getStudentInvitationController,
    listStudentInvitationsController,
    revokeStudentInvitationController,
} from "../controllers/student-invitation.controller";
import { validateRequest } from "../middlewares/validate-request.middleware";
import {
    createStudentInvitationSchema,
    studentInvitationListQuerySchema,
    studentInvitationParamsSchema,
} from "../validators/student-invitation.validation";

const studentInvitationRoutes = Router()
    .get(
        "/",
        validateRequest({ query: studentInvitationListQuerySchema }),
        listStudentInvitationsController
    )
    .post(
        "/",
        validateRequest({ body: createStudentInvitationSchema }),
        createStudentInvitationController
    )
    .get(
        "/:invitationId",
        validateRequest({ params: studentInvitationParamsSchema }),
        getStudentInvitationController
    )
    .patch(
        "/:invitationId/revoke",
        validateRequest({ params: studentInvitationParamsSchema }),
        revokeStudentInvitationController
    );

export default studentInvitationRoutes;
