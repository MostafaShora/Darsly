import { Types } from "mongoose";
import UserModel from "../models/user.model";
import WorkspaceMemberModel, { type WorkspaceMemberDocument } from "../models/workspace-member.model";
import WorkspaceModel, { type WorkspaceDocument } from "../models/workspace.model";
import {
    BadRequestException,
    ForbiddenException,
    NotFoundException,
    UnauthorizedException,
} from "../utils/app-error";
import { isValidObjectId } from "../utils/object-id";

export interface WorkspaceAccessContext {
    userId: string;
    workspace: WorkspaceDocument;
    membership: WorkspaceMemberDocument;
}

export interface WorkspaceAccessOptions {
    allowSuspended?: boolean;
}

export const assertValidObjectId = (id: string, fieldName: string): void => {
    if (!isValidObjectId(id)) {
        throw new BadRequestException(`Invalid ${fieldName}`);
    }
};

export const getActiveUser = async (userId: string) => {
    assertValidObjectId(userId, "user ID");

    const user = await UserModel.findById(userId);

    if (!user) {
        throw new UnauthorizedException("User not found");
    }

    if (user.status !== "active") {
        throw new ForbiddenException("Your account is not active");
    }

    return user;
};

export const getActiveMembership = async (
    userId: string,
    workspaceId: string
) => {
    const membership = await WorkspaceMemberModel.findOne({
        userId,
        workspaceId,
        status: "active",
    });

    if (!membership) {
        throw new ForbiddenException(
            "You do not have an active membership in this workspace"
        );
    }

    return membership;
};

export const resolveWorkspaceAccess = async (
    userId: string,
    workspaceId: string,
    options: WorkspaceAccessOptions = {}
): Promise<WorkspaceAccessContext> => {
    await getActiveUser(userId);
    assertValidObjectId(workspaceId, "workspace ID");

    const membership = await getActiveMembership(userId, workspaceId);
    const workspace = await WorkspaceModel.findById(workspaceId);

    if (!workspace) {
        throw new NotFoundException("Workspace not found");
    }

    if (!options.allowSuspended && workspace.status !== "active") {
        throw new NotFoundException("Workspace not found");
    }

    return { userId, workspace, membership };
};
