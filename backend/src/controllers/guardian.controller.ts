import { Request, Response } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware";
import { getWorkspaceContext } from "../middlewares/workspace-access.middleware";
import { getValidatedPart } from "../middlewares/validate-request.middleware";
import { toGuardianDto } from "../dtos/guardian.dto";
import {
    createGuardianService,
    getGuardianByIdService,
    listGuardiansService,
    updateGuardianService,
} from "../services/guardian.service";
import {
    CreateGuardianInput,
    GuardianListQuery,
    UpdateGuardianInput,
} from "../validators/guardian.validation";

const getWorkspaceId = (req: Request) =>
    getWorkspaceContext(req).workspace._id;

export const listGuardiansController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const result = await listGuardiansService(
            getWorkspaceId(req),
            getValidatedPart<GuardianListQuery>(req, "query")
        );

        res.status(200).json({
            message: "Guardians retrieved successfully",
            data: {
                items: result.items.map(toGuardianDto),
                pagination: result.pagination,
            },
        });
    }
);

export const createGuardianController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const guardian = await createGuardianService(
            getWorkspaceId(req),
            getValidatedPart<CreateGuardianInput>(req, "body")
        );

        res.status(201).json({
            message: "Guardian created successfully",
            data: toGuardianDto(guardian),
        });
    }
);

export const getGuardianController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const { guardianId } = getValidatedPart<{ guardianId: string }>(
            req,
            "params"
        );
        const guardian = await getGuardianByIdService(
            getWorkspaceId(req),
            guardianId
        );

        res.status(200).json({
            message: "Guardian retrieved successfully",
            data: toGuardianDto(guardian),
        });
    }
);

export const updateGuardianController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const { guardianId } = getValidatedPart<{ guardianId: string }>(
            req,
            "params"
        );
        const guardian = await updateGuardianService(
            getWorkspaceId(req),
            guardianId,
            getValidatedPart<UpdateGuardianInput>(req, "body")
        );

        res.status(200).json({
            message: "Guardian updated successfully",
            data: toGuardianDto(guardian),
        });
    }
);
