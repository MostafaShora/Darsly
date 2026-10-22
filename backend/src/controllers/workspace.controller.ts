
import { Request, Response, NextFunction } from "express";

import {
    createWorkspaceService,
    getMyWorkspacesService,
    getWorkspaceByIdService,
    updateWorkspaceService,
    suspendWorkspaceService,
    activateWorkspaceService,
} from "../services/workspace.service";

import {
    BadRequestException,
    UnauthorizedException,
} from "../utils/app-error";

// Get the authenticated user's ID
const getUserId = (req: Request): string => {
    const userId = req.user?._id?.toString();

    if (!userId) {
        throw new UnauthorizedException("Authentication required");
    }

    return userId;
};

// Validate and get workspace ID from route parameters
const getWorkspaceId = (req: Request): string => {
    const workspaceId = req.params.workspaceId;

    if (typeof workspaceId !== "string" || !workspaceId) {
        throw new BadRequestException("Invalid workspace ID");
    }

    return workspaceId;
};

// 1. Create workspace
export const createWorkspaceController = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const userId = getUserId(req);

        const workspace = await createWorkspaceService(
            userId,
            req.body,
        );

        res.status(201).json({
            message: "Workspace created successfully",
            data: workspace,
        });
    } catch (error) {
        next(error);
    }
};

// 2. Get current user's workspaces
export const getMyWorkspacesController = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const userId = getUserId(req);

        const workspaces = await getMyWorkspacesService(userId);

        res.status(200).json({
            message: "Workspaces retrieved successfully",
            data: workspaces,
        });
    } catch (error) {
        next(error);
    }
};

// 3. Get workspace by ID
export const getWorkspaceByIdController = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const userId = getUserId(req);
        const workspaceId = getWorkspaceId(req);

        const workspace = await getWorkspaceByIdService(
            userId,
            workspaceId,
        );

        res.status(200).json({
            message: "Workspace retrieved successfully",
            data: workspace,
        });
    } catch (error) {
        next(error);
    }
};

// 4. Update workspace
export const updateWorkspaceController = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const userId = getUserId(req);
        const workspaceId = getWorkspaceId(req);

        const workspace = await updateWorkspaceService(
            userId,
            workspaceId,
            req.body,
        );

        res.status(200).json({
            message: "Workspace updated successfully",
            data: workspace,
        });
    } catch (error) {
        next(error);
    }
};

// 5. Suspend workspace
export const suspendWorkspaceController = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const userId = getUserId(req);
        const workspaceId = getWorkspaceId(req);

        const workspace = await suspendWorkspaceService(
            userId,
            workspaceId,
        );

        res.status(200).json({
            message: "Workspace suspended successfully",
            data: workspace,
        });
    } catch (error) {
        next(error);
    }
};

// 6. Activate workspace
export const activateWorkspaceController = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const userId = getUserId(req);
        const workspaceId = getWorkspaceId(req);

        const workspace = await activateWorkspaceService(
            userId,
            workspaceId,
        );

        res.status(200).json({
            message: "Workspace activated successfully",
            data: workspace,
        });
    } catch (error) {
        next(error);
    }
};
