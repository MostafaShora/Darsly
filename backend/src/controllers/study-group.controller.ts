import { Request, Response } from "express";
import { toStudyGroupDto } from "../dtos/study-group.dto";
import { asyncHandler } from "../middlewares/asyncHandler.middleware";
import { getWorkspaceContext } from "../middlewares/workspace-access.middleware";
import { getValidatedPart } from "../middlewares/validate-request.middleware";
import {
    createStudyGroupService,
    getStudyGroupByIdService,
    listStudyGroupsService,
    updateStudyGroupService,
} from "../services/study-group.service";
import {
    CreateStudyGroupInput,
    StudyGroupListQuery,
    UpdateStudyGroupInput,
} from "../validators/study-group.validation";

const getWorkspaceId = (req: Request) =>
    getWorkspaceContext(req).workspace._id;

export const listStudyGroupsController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const result = await listStudyGroupsService(
            getWorkspaceId(req),
            getValidatedPart<StudyGroupListQuery>(req, "query")
        );

        res.status(200).json({
            message: "Study groups retrieved successfully",
            data: {
                items: result.items.map(toStudyGroupDto),
                pagination: result.pagination,
            },
        });
    }
);

export const createStudyGroupController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const group = await createStudyGroupService(
            getWorkspaceId(req),
            getValidatedPart<CreateStudyGroupInput>(req, "body")
        );

        res.status(201).json({
            message: "Study group created successfully",
            data: toStudyGroupDto(group),
        });
    }
);

export const getStudyGroupController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const { groupId } = getValidatedPart<{ groupId: string }>(
            req,
            "params"
        );
        const group = await getStudyGroupByIdService(
            getWorkspaceId(req),
            groupId
        );

        res.status(200).json({
            message: "Study group retrieved successfully",
            data: toStudyGroupDto(group),
        });
    }
);

export const updateStudyGroupController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const { groupId } = getValidatedPart<{ groupId: string }>(
            req,
            "params"
        );
        const group = await updateStudyGroupService(
            getWorkspaceId(req),
            groupId,
            getValidatedPart<UpdateStudyGroupInput>(req, "body")
        );

        res.status(200).json({
            message: "Study group updated successfully",
            data: toStudyGroupDto(group),
        });
    }
);
