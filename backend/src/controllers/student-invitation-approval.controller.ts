import { Request, Response } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware";
import { getWorkspaceContext } from "../middlewares/workspace-access.middleware";
import { getValidatedPart } from "../middlewares/validate-request.middleware";
import {
    ForbiddenException,
} from "../utils/app-error";
import {
    approveStudentInvitationRedemptionService,
    listStudentInvitationApprovalRequestsService,
    rejectStudentInvitationRedemptionService,
} from "../services/student-invitation-approval.service";
import {
    StudentInvitationApprovalListQuery,
} from "../validators/student-invitation-approval.validation";

const getReviewerContext = (req: Request) => {
    const context = getWorkspaceContext(req);
    if (
        context.membership.role !== "owner" &&
        context.membership.role !== "teacher"
    ) {
        throw new ForbiddenException("Workspace teacher approval required");
    }
    return context;
};

export const listStudentInvitationApprovalRequestsController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const context = getReviewerContext(req);
        const result = await listStudentInvitationApprovalRequestsService(
            context.workspace._id,
            getValidatedPart<StudentInvitationApprovalListQuery>(req, "query")
        );

        res.status(200).json({
            message: "Student approval requests retrieved",
            data: result,
        });
    }
);

export const approveStudentInvitationRedemptionController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const context = getReviewerContext(req);
        const { redemptionId } =
            getValidatedPart<{ redemptionId: string }>(req, "params");
        const state = await approveStudentInvitationRedemptionService(
            context.workspace._id,
            redemptionId,
            context.userId
        );

        res.status(200).json({
            message:
                state === "consumed"
                    ? "Student access activated"
                    : "Student invitation approved; account registration remains pending",
            data: { state },
        });
    }
);

export const rejectStudentInvitationRedemptionController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const context = getReviewerContext(req);
        const { redemptionId } =
            getValidatedPart<{ redemptionId: string }>(req, "params");
        await rejectStudentInvitationRedemptionService(
            context.workspace._id,
            redemptionId,
            context.userId
        );

        res.status(200).json({
            message: "Student invitation rejected; a new invitation is required",
        });
    }
);
