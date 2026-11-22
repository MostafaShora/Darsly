import { Request, Response } from "express";
import { toSubjectDto } from "../dtos/subject.dto";
import { asyncHandler } from "../middlewares/asyncHandler.middleware";
import { getWorkspaceContext } from "../middlewares/workspace-access.middleware";
import { getValidatedPart } from "../middlewares/validate-request.middleware";
import {
    createSubjectService,
    getSubjectByIdService,
    listSubjectsService,
    updateSubjectService,
} from "../services/subject.service";
import {
    CreateSubjectInput,
    SubjectListQuery,
    UpdateSubjectInput,
} from "../validators/subject.validation";

const getWorkspaceId = (req: Request) =>
    getWorkspaceContext(req).workspace._id;

export const listSubjectsController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const result = await listSubjectsService(
            getWorkspaceId(req),
            getValidatedPart<SubjectListQuery>(req, "query")
        );

        res.status(200).json({
            message: "Subjects retrieved successfully",
            data: {
                items: result.items.map(toSubjectDto),
                pagination: result.pagination,
            },
        });
    }
);

export const createSubjectController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const subject = await createSubjectService(
            getWorkspaceId(req),
            getValidatedPart<CreateSubjectInput>(req, "body")
        );

        res.status(201).json({
            message: "Subject created successfully",
            data: toSubjectDto(subject),
        });
    }
);

export const getSubjectController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const { subjectId } = getValidatedPart<{ subjectId: string }>(
            req,
            "params"
        );
        const subject = await getSubjectByIdService(
            getWorkspaceId(req),
            subjectId
        );

        res.status(200).json({
            message: "Subject retrieved successfully",
            data: toSubjectDto(subject),
        });
    }
);

export const updateSubjectController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const { subjectId } = getValidatedPart<{ subjectId: string }>(
            req,
            "params"
        );
        const subject = await updateSubjectService(
            getWorkspaceId(req),
            subjectId,
            getValidatedPart<UpdateSubjectInput>(req, "body")
        );

        res.status(200).json({
            message: "Subject updated successfully",
            data: toSubjectDto(subject),
        });
    }
);
