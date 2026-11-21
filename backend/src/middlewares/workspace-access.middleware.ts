import { Request, RequestHandler } from "express";
import { asyncHandler } from "./asyncHandler.middleware";
import {
    resolveWorkspaceAccess,
    type WorkspaceAccessOptions,
} from "../services/workspace-access.service";
import {
    BadRequestException,
    InternalServerException,
    UnauthorizedException,
} from "../utils/app-error";
import { WorkspaceAccessContext } from "../services/workspace-access.service";

export const requireWorkspaceAccess = (
    options: WorkspaceAccessOptions = {}
): RequestHandler =>
    asyncHandler(async (req, _res, next) => {
        const userId = req.user?._id?.toString();
        const workspaceId = req.params.workspaceId;

        if (!userId) {
            throw new UnauthorizedException("Authentication required");
        }

        if (typeof workspaceId !== "string" || !workspaceId) {
            throw new BadRequestException("Invalid workspace ID");
        }

        req.workspaceContext = await resolveWorkspaceAccess(userId, workspaceId, options);

        next();
    });

export const getWorkspaceContext = (
    req: Request
): WorkspaceAccessContext => {
    if (!req.workspaceContext) {
        throw new InternalServerException();
    }

    return req.workspaceContext;
};
