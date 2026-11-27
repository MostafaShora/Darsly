import { Request, Response } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware";
import { getWorkspaceContext } from "../middlewares/workspace-access.middleware";
import { getValidatedPart } from "../middlewares/validate-request.middleware";
import { toStudentInvitationDto } from "../dtos/student-invitation.dto";
import {
    createStudentInvitationService,
    getStudentInvitationService,
    listStudentInvitationsService,
    revokeStudentInvitationService,
} from "../services/student-invitation.service";
import {
    CreateStudentInvitationInput,
    StudentInvitationListQuery,
} from "../validators/student-invitation.validation";

export const createStudentInvitationController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const context = getWorkspaceContext(req);
        const { studentId } =
            getValidatedPart<CreateStudentInvitationInput>(req, "body");
        const { invitation, invitationSecret } =
            await createStudentInvitationService(
                context.workspace._id,
                context.userId,
                studentId
            );

        res.status(201).json({
            message: "Student invitation created successfully",
            data: {
                ...toStudentInvitationDto(invitation),
                invitationSecret,
            },
        });
    }
);

export const listStudentInvitationsController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const context = getWorkspaceContext(req);
        const result = await listStudentInvitationsService(
            context.workspace._id,
            getValidatedPart<StudentInvitationListQuery>(req, "query")
        );

        res.status(200).json({
            message: "Student invitations retrieved successfully",
            data: {
                items: result.items.map((invitation) =>
                    toStudentInvitationDto(invitation)
                ),
                pagination: result.pagination,
            },
        });
    }
);

export const getStudentInvitationController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const context = getWorkspaceContext(req);
        const { invitationId } = getValidatedPart<{ invitationId: string }>(
            req,
            "params"
        );
        const invitation = await getStudentInvitationService(
            context.workspace._id,
            invitationId
        );

        res.status(200).json({
            message: "Student invitation retrieved successfully",
            data: toStudentInvitationDto(invitation),
        });
    }
);

export const revokeStudentInvitationController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const context = getWorkspaceContext(req);
        const { invitationId } = getValidatedPart<{ invitationId: string }>(
            req,
            "params"
        );
        const invitation = await revokeStudentInvitationService(
            context.workspace._id,
            invitationId,
            context.userId
        );

        res.status(200).json({
            message: "Student invitation revoked successfully",
            data: toStudentInvitationDto(invitation),
        });
    }
);
