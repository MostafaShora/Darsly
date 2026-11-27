import { Router } from "express";
import { passportAuthenticateJwt } from "../config/passport.config";
import {
    bindStudentInvitationToExistingAccountController,
    completeStudentInvitationRegistrationController,
    getStudentInvitationRedemptionStateController,
    requestStudentInvitationOtpController,
    startStudentInvitationRedemptionController,
    verifyStudentInvitationOtpController,
} from "../controllers/student-invitation-redemption.controller";
import { validateRequest } from "../middlewares/validate-request.middleware";
import {
    completeStudentInvitationRegistrationSchema,
    startStudentInvitationRedemptionSchema,
    studentInvitationClaimSchema,
    studentInvitationRedemptionParamsSchema,
    verifyStudentInvitationOtpSchema,
} from "../validators/student-invitation-redemption.validation";

const studentInvitationRedemptionRoutes = Router()
    .post(
        "/",
        validateRequest({ body: startStudentInvitationRedemptionSchema }),
        startStudentInvitationRedemptionController
    )
    .post(
        "/:redemptionId/otp",
        validateRequest({
            params: studentInvitationRedemptionParamsSchema,
            body: studentInvitationClaimSchema,
        }),
        requestStudentInvitationOtpController
    )
    .post(
        "/:redemptionId/verify",
        validateRequest({
            params: studentInvitationRedemptionParamsSchema,
            body: verifyStudentInvitationOtpSchema,
        }),
        verifyStudentInvitationOtpController
    )
    .post(
        "/:redemptionId/status",
        validateRequest({
            params: studentInvitationRedemptionParamsSchema,
            body: studentInvitationClaimSchema,
        }),
        getStudentInvitationRedemptionStateController
    )
    .post(
        "/:redemptionId/claim-existing-account",
        passportAuthenticateJwt,
        validateRequest({
            params: studentInvitationRedemptionParamsSchema,
            body: studentInvitationClaimSchema,
        }),
        bindStudentInvitationToExistingAccountController
    )
    .post(
        "/:redemptionId/register",
        validateRequest({
            params: studentInvitationRedemptionParamsSchema,
            body: completeStudentInvitationRegistrationSchema,
        }),
        completeStudentInvitationRegistrationController
    );

export default studentInvitationRedemptionRoutes;
