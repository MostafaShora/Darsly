import mongoose, { Types } from "mongoose";

import UserModel from "../models/user.model";
import WorkspaceModel from "../models/workspace.model";
import WorkspaceMemberModel from "../models/workspace-member.model";

import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
    UnauthorizedException,
} from "../utils/app-error";

// TYPES

export interface CreateWorkspaceInput {
    name: string;
    description?: string;
}

export interface UpdateWorkspaceInput {
    name?: string;
    description?: string;
}

// HELPERS

const ensureValidObjectId = (id: string, fieldName: string): void => {
    if (!Types.ObjectId.isValid(id)) {
        throw new BadRequestException(`Invalid ${fieldName}`);
    }
};

const getActiveUser = async (userId: string) => {
    ensureValidObjectId(userId, "user ID");

    const user = await UserModel.findById(userId);

    if (!user) {
        throw new UnauthorizedException("User not found");
    }

    if (user.status !== "active") {
        throw new ForbiddenException("Your account is not active");
    }

    return user;
};

const createSlug = (value: string): string => {
    return value
        .normalize("NFC")
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, "-")
        .replace(/^-+|-+$/g, "");
};

const createUniqueSlug = async (
    name: string,
    excludeWorkspaceId?: Types.ObjectId,
): Promise<string> => {
    const baseSlug = createSlug(name)
        .slice(0, 100)
        .replace(/-+$/g, "");

    if (!baseSlug) {
        throw new BadRequestException(
            "Workspace name must contain letters or numbers",
        );
    }

    let slug = baseSlug;
    let counter = 1;

    while (true) {
        const filter: Record<string, unknown> = { slug };

        if (excludeWorkspaceId) {
            filter._id = { $ne: excludeWorkspaceId };
        }

        const existingWorkspace = await WorkspaceModel.exists(filter);

        if (!existingWorkspace) {
            return slug;
        }

        counter += 1;

        const suffix = `-${counter}`;

        slug = `${baseSlug.slice(0, 100 - suffix.length)}${suffix}`;
    }
};

const isDuplicateKeyError = (error: unknown): boolean => {
    return (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === 11000
    );
};

const getDuplicateKeyPattern = (
    error: unknown,
): Record<string, unknown> | undefined => {
    if (
        typeof error !== "object" ||
        error === null ||
        !("keyPattern" in error)
    ) {
        return undefined;
    }

    const keyPattern = error.keyPattern;

    if (
        typeof keyPattern !== "object" ||
        keyPattern === null
    ) {
        return undefined;
    }

    return keyPattern as Record<string, unknown>;
};

const getActiveMembership = async (
    userId: string,
    workspaceId: string,
) => {
    const membership = await WorkspaceMemberModel.findOne({
        userId,
        workspaceId,
        status: "active",
    });

    if (!membership) {
        throw new ForbiddenException(
            "You do not have an active membership in this workspace",
        );
    }

    return membership;
};

const getActiveWorkspace = async (workspaceId: string) => {
    const workspace = await WorkspaceModel.findOne({
        _id: workspaceId,
        status: "active",
    });

    if (!workspace) {
        throw new NotFoundException("Workspace not found");
    }

    return workspace;
};

const requireOwner = async (
    userId: string,
    workspaceId: string,
) => {
    const membership = await getActiveMembership(userId, workspaceId);
    const workspace = await WorkspaceModel.findById(workspaceId);

    if (
        !workspace ||
        workspace.ownerId.toString() !== userId ||
        membership.role !== "owner"
    ) {
        throw new ForbiddenException(
            "Only the workspace owner can perform this action",
        );
    }

    return { workspace, membership };
};

// 1. CREATE WORKSPACE

export const createWorkspaceService = async (
    userId: string,
    data: CreateWorkspaceInput,
) => {
    await getActiveUser(userId);

    const name = data.name?.trim();
    const description = data.description?.trim() ?? "";

    if (!name || name.length < 2 || name.length > 120) {
        throw new BadRequestException(
            "Workspace name must be between 2 and 120 characters",
        );
    }

    if (description.length > 1000) {
        throw new BadRequestException(
            "Description cannot exceed 1000 characters",
        );
    }

    const ownerObjectId = new Types.ObjectId(userId);

    // UX check only. The unique ownerId index remains the final protection.
    const existingWorkspace = await WorkspaceModel.exists({
        ownerId: ownerObjectId,
    });

    if (existingWorkspace) {
        throw new ConflictException("You already have a workspace");
    }

    const session = await mongoose.startSession();

    let createdWorkspaceId: Types.ObjectId | undefined;

    try {
        await session.withTransaction(async () => {
            const slug = await createUniqueSlug(name);

            const [workspace] = await WorkspaceModel.create(
                [
                    {
                        name,
                        slug,
                        ownerId: ownerObjectId,
                        description,
                        status: "active",
                        suspensionType: null,
                        suspendedAt: null,
                        suspendedBy: null,
                        suspensionReason: null,
                    },
                ],
                { session },
            );

            await WorkspaceMemberModel.create(
                [
                    {
                        workspaceId: workspace._id,
                        userId: ownerObjectId,
                        role: "owner",
                        status: "active",
                        invitedBy: null,
                        joinedAt: new Date(),
                    },
                ],
                { session },
            );

            createdWorkspaceId = workspace._id;
        });
    } catch (error) {
        if (isDuplicateKeyError(error)) {
            const keyPattern = getDuplicateKeyPattern(error);

            if (keyPattern?.ownerId) {
                throw new ConflictException(
                    "You already have a workspace",
                );
            }

            if (keyPattern?.slug) {
                throw new ConflictException(
                    "A workspace with this slug already exists",
                );
            }

            throw new ConflictException(
                "A conflicting workspace record already exists",
            );
        }

        throw error;
    } finally {
        await session.endSession();
    }

    if (!createdWorkspaceId) {
        throw new ConflictException(
            "Workspace could not be created",
        );
    }

    return WorkspaceModel.findById(createdWorkspaceId);
};

// 2. GET MY WORKSPACES

export const getMyWorkspacesService = async (userId: string) => {
    await getActiveUser(userId);

    const memberships = await WorkspaceMemberModel.find({
        userId,
        status: "active",
    }).select("workspaceId");

    const workspaceIds = memberships.map(
        (membership) => membership.workspaceId,
    );

    // Include suspended workspaces so members can see their status.
    // The owner can reactivate an owner-suspended workspace separately.
    return WorkspaceModel.find({
        _id: { $in: workspaceIds },
    }).sort({ createdAt: -1 });
};

// 3. GET WORKSPACE BY ID

export const getWorkspaceByIdService = async (
    userId: string,
    workspaceId: string,
) => {
    await getActiveUser(userId);
    ensureValidObjectId(workspaceId, "workspace ID");

    await getActiveMembership(userId, workspaceId);

    // Return suspended workspaces too, so their status is visible.
    const workspace = await WorkspaceModel.findById(workspaceId);

    if (!workspace) {
        throw new NotFoundException("Workspace not found");
    }

    return workspace;
};

// 4. UPDATE WORKSPACE

export const updateWorkspaceService = async (
    userId: string,
    workspaceId: string,
    data: UpdateWorkspaceInput,
) => {
    await getActiveUser(userId);
    ensureValidObjectId(workspaceId, "workspace ID");

    const workspace = await getActiveWorkspace(workspaceId);
    const membership = await getActiveMembership(userId, workspaceId);

    if (
        membership.role !== "owner" ||
        workspace.ownerId.toString() !== userId
    ) {
        throw new ForbiddenException(
            "Only the workspace owner can update this workspace",
        );
    }

    const updates: {
        name?: string;
        description?: string;
        slug?: string;
    } = {};

    if (data.name !== undefined) {
        const name = data.name.trim();

        if (name.length < 2 || name.length > 120) {
            throw new BadRequestException(
                "Workspace name must be between 2 and 120 characters",
            );
        }

        updates.name = name;

        if (name !== workspace.name) {
            updates.slug = await createUniqueSlug(
                name,
                workspace._id,
            );
        }
    }

    if (data.description !== undefined) {
        const description = data.description.trim();

        if (description.length > 1000) {
            throw new BadRequestException(
                "Description cannot exceed 1000 characters",
            );
        }

        updates.description = description;
    }

    if (Object.keys(updates).length === 0) {
        throw new BadRequestException(
            "Provide at least one field to update",
        );
    }

    try {
        const updatedWorkspace = await WorkspaceModel.findOneAndUpdate(
            {
                _id: workspaceId,
                status: "active",
            },
            { $set: updates },
            {
                returnDocument: "after",
                runValidators: true,
            },
        );

        if (!updatedWorkspace) {
            throw new NotFoundException("Workspace not found");
        }

        return updatedWorkspace;
    } catch (error) {
        if (isDuplicateKeyError(error)) {
            const keyPattern = getDuplicateKeyPattern(error);

            if (keyPattern?.slug) {
                throw new ConflictException(
                    "A workspace with this slug already exists",
                );
            }

            throw new ConflictException(
                "The update conflicts with an existing database record",
            );
        }

        throw error;
    }
};

// 5. SUSPEND WORKSPACE

export const suspendWorkspaceService = async (
    userId: string,
    workspaceId: string,
) => {
    await getActiveUser(userId);
    ensureValidObjectId(workspaceId, "workspace ID");

    const { workspace } = await requireOwner(userId, workspaceId);

    if (workspace.status === "suspended") {
        throw new ConflictException(
            "Workspace is already suspended",
        );
    }

    workspace.status = "suspended";
    workspace.suspensionType = "owner";
    workspace.suspendedAt = new Date();
    workspace.suspendedBy = new Types.ObjectId(userId);
    workspace.suspensionReason = null;

    await workspace.save();

    return workspace;
};

// 6. ACTIVATE WORKSPACE

export const activateWorkspaceService = async (
    userId: string,
    workspaceId: string,
) => {
    await getActiveUser(userId);
    ensureValidObjectId(workspaceId, "workspace ID");

    const { workspace } = await requireOwner(userId, workspaceId);

    if (workspace.status === "active") {
        throw new ConflictException(
            "Workspace is already active",
        );
    }

    if (workspace.suspensionType === "admin") {
        throw new ForbiddenException(
            "Only platform administration can activate an administratively suspended workspace",
        );
    }

    if (workspace.suspensionType !== "owner") {
        throw new ConflictException(
            "Workspace suspension data is inconsistent",
        );
    }

    if (!workspace.suspendedAt || !workspace.suspendedBy) {
        throw new ConflictException(
            "Workspace suspension data is incomplete",
        );
    }

    workspace.status = "active";
    workspace.suspensionType = null;
    workspace.suspendedAt = null;
    workspace.suspendedBy = null;
    workspace.suspensionReason = null;

    await workspace.save();

    return workspace;
};
