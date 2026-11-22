import { Request, Response } from "express";
import { toSessionDto } from "../dtos/session.dto";
import { asyncHandler } from "../middlewares/asyncHandler.middleware";
import { getWorkspaceContext } from "../middlewares/workspace-access.middleware";
import { getValidatedPart } from "../middlewares/validate-request.middleware";
import {
    createSessionService,
    getSessionByIdService,
    listSessionsService,
    updateSessionService,
} from "../services/session.service";
import {
    CreateSessionInput,
    SessionListQuery,
    UpdateSessionInput,
} from "../validators/session.validation";

const getWorkspaceId = (req: Request) =>
    getWorkspaceContext(req).workspace._id;

export const listSessionsController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const result = await listSessionsService(
            getWorkspaceId(req),
            getValidatedPart<SessionListQuery>(req, "query")
        );

        res.status(200).json({
            message: "Sessions retrieved successfully",
            data: {
                items: result.items.map(toSessionDto),
                pagination: result.pagination,
            },
        });
    }
);

export const createSessionController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const session = await createSessionService(
            getWorkspaceId(req),
            getValidatedPart<CreateSessionInput>(req, "body")
        );

        res.status(201).json({
            message: "Session created successfully",
            data: toSessionDto(session),
        });
    }
);

export const getSessionController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const { sessionId } = getValidatedPart<{ sessionId: string }>(
            req,
            "params"
        );
        const session = await getSessionByIdService(
            getWorkspaceId(req),
            sessionId
        );

        res.status(200).json({
            message: "Session retrieved successfully",
            data: toSessionDto(session),
        });
    }
);

export const updateSessionController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const { sessionId } = getValidatedPart<{ sessionId: string }>(
            req,
            "params"
        );
        const session = await updateSessionService(
            getWorkspaceId(req),
            sessionId,
            getValidatedPart<UpdateSessionInput>(req, "body")
        );

        res.status(200).json({
            message: "Session updated successfully",
            data: toSessionDto(session),
        });
    }
);
