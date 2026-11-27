import { Request, Response } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware";
import { getValidatedPart } from "../middlewares/validate-request.middleware";
import {
    bindStudentInvitationToExistingAccountService,
    completeStudentInvitationRegistrationService,
    getStudentInvitationRedemptionStateService,
    requestStudentInvitationOtpService,
    startStudentInvitationRedemptionService,
    verifyStudentInvitationOtpService,
} from "../services/student-invitation-redemption.service";
import {
    CompleteStudentInvitationRegistrationInput,
    StartStudentInvitationRedemptionInput,
    StudentInvitationClaimInput,
    VerifyStudentInvitationOtpInput,
} from "../validators/student-invitation-redemption.validation";
import { UnauthorizedException } from "../utils/app-error";

export const startStudentInvitationRedemptionController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const { invitationSecret } =
            getValidatedPart<StartStudentInvitationRedemptionInput>(
                req,
                "body"
            );
        const redemption =
            await startStudentInvitationRedemptionService(invitationSecret);

        res.status(201).json({
            message: "Student invitation redemption started",
            data: redemption,
        });
    }
);

export const createRequestStudentInvitationOtpController = (
    requestOtp: typeof requestStudentInvitationOtpService =
        requestStudentInvitationOtpService
) =>
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
        const { redemptionId } =
            getValidatedPart<{ redemptionId: string }>(req, "params");
        const { claimToken } =
            getValidatedPart<StudentInvitationClaimInput>(req, "body");
        await requestOtp(redemptionId, claimToken);

        res.status(202).json({
            message: "If eligible, a verification code has been sent",
        });
    });

export const requestStudentInvitationOtpController =
    createRequestStudentInvitationOtpController();

export const verifyStudentInvitationOtpController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const { redemptionId } =
            getValidatedPart<{ redemptionId: string }>(req, "params");
        const { claimToken, otp } =
            getValidatedPart<VerifyStudentInvitationOtpInput>(req, "body");
        await verifyStudentInvitationOtpService(
            redemptionId,
            claimToken,
            otp
        );

        res.status(200).json({
            message: "Verification completed; teacher approval is required",
        });
    }
);

export const bindStudentInvitationToExistingAccountController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const userId = req.user?._id?.toString();
        if (!userId) {
            throw new UnauthorizedException("Authentication required");
        }

        const { redemptionId } =
            getValidatedPart<{ redemptionId: string }>(req, "params");
        const { claimToken } =
            getValidatedPart<StudentInvitationClaimInput>(req, "body");
        const accessState =
            await bindStudentInvitationToExistingAccountService(
                redemptionId,
                claimToken,
                userId
            );

        res.status(200).json({
            message:
                accessState === "active"
                    ? "Student access activated"
                    : "Account verified; teacher approval is required",
        });
    }
);

export const completeStudentInvitationRegistrationController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const { redemptionId } =
            getValidatedPart<{ redemptionId: string }>(req, "params");
        const { claimToken, password } =
            getValidatedPart<CompleteStudentInvitationRegistrationInput>(
                req,
                "body"
            );
        const accessState =
            await completeStudentInvitationRegistrationService(
                redemptionId,
                claimToken,
                password
            );

        res.status(201).json({
            message:
                accessState === "active"
                    ? "Student account created and access activated"
                    : "Student account created; teacher approval is required",
        });
    }
);

export const getStudentInvitationRedemptionStateController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const { redemptionId } =
            getValidatedPart<{ redemptionId: string }>(req, "params");
        const { claimToken } =
            getValidatedPart<StudentInvitationClaimInput>(req, "body");
        const state = await getStudentInvitationRedemptionStateService(
            redemptionId,
            claimToken
        );

        res.status(200).json({
            message: "Student invitation redemption status retrieved",
            data: {
                state: state.state,
                otpStatus: state.otpStatus,
                otpVerifiedAt: state.otpVerifiedAt,
            },
        });
    }
);
