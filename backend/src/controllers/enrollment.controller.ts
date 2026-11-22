import { Request, Response } from "express";
import { toEnrollmentDto } from "../dtos/enrollment.dto";
import { asyncHandler } from "../middlewares/asyncHandler.middleware";
import { getWorkspaceContext } from "../middlewares/workspace-access.middleware";
import { getValidatedPart } from "../middlewares/validate-request.middleware";
import {
    createEnrollmentService,
    getEnrollmentByIdService,
    listEnrollmentsService,
    listGroupEnrollmentsService,
    updateEnrollmentService,
} from "../services/enrollment.service";
import {
    CreateEnrollmentInput,
    EnrollmentListQuery,
    GroupEnrollmentListQuery,
    UpdateEnrollmentInput,
} from "../validators/enrollment.validation";

const getWorkspaceId = (req: Request) =>
    getWorkspaceContext(req).workspace._id;

export const listEnrollmentsController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const result = await listEnrollmentsService(
            getWorkspaceId(req),
            getValidatedPart<EnrollmentListQuery>(req, "query")
        );

        res.status(200).json({
            message: "Enrollments retrieved successfully",
            data: {
                items: result.items.map(toEnrollmentDto),
                pagination: result.pagination,
            },
        });
    }
);

export const listGroupEnrollmentsController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const { groupId } = getValidatedPart<{ groupId: string }>(
            req,
            "params"
        );
        const result = await listGroupEnrollmentsService(
            getWorkspaceId(req),
            groupId,
            getValidatedPart<GroupEnrollmentListQuery>(req, "query")
        );

        res.status(200).json({
            message: "Group enrollments retrieved successfully",
            data: {
                items: result.items.map(toEnrollmentDto),
                pagination: result.pagination,
            },
        });
    }
);

export const createEnrollmentController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const { groupId } = getValidatedPart<{ groupId: string }>(
            req,
            "params"
        );
        const enrollment = await createEnrollmentService(
            getWorkspaceId(req),
            groupId,
            getValidatedPart<CreateEnrollmentInput>(req, "body")
        );

        res.status(201).json({
            message: "Student enrolled successfully",
            data: toEnrollmentDto(enrollment),
        });
    }
);

export const getEnrollmentController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const { enrollmentId } = getValidatedPart<{ enrollmentId: string }>(
            req,
            "params"
        );
        const enrollment = await getEnrollmentByIdService(
            getWorkspaceId(req),
            enrollmentId
        );

        res.status(200).json({
            message: "Enrollment retrieved successfully",
            data: toEnrollmentDto(enrollment),
        });
    }
);

export const updateEnrollmentController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const { enrollmentId } = getValidatedPart<{ enrollmentId: string }>(
            req,
            "params"
        );
        const enrollment = await updateEnrollmentService(
            getWorkspaceId(req),
            enrollmentId,
            getValidatedPart<UpdateEnrollmentInput>(req, "body")
        );

        res.status(200).json({
            message: "Enrollment updated successfully",
            data: toEnrollmentDto(enrollment),
        });
    }
);
