import UserModel, {
    UserCapability,
    UserDocument,
} from "../models/user.model";
import WorkspaceMemberModel from "../models/workspace-member.model";
import WorkspaceModel from "../models/workspace.model";
import { ForbiddenException, NotFoundException } from "../utils/app-error";

export interface AccountCapabilities {
    teacher: boolean;
    student: boolean;
    owner: boolean;
}

export const hasUserCapability = (
    user: Pick<UserDocument, "capabilities">,
    capability: UserCapability
): boolean => {
    if (user.capabilities === undefined) {
        return capability === "teacher";
    }

    return user.capabilities.includes(capability);
};

export const getAccountCapabilitiesService = async (
    user: Pick<UserDocument, "_id" | "capabilities">
): Promise<AccountCapabilities> => {
    const teacher = hasUserCapability(user, "teacher");
    const student = hasUserCapability(user, "student");

    if (!teacher) {
        return { teacher, student, owner: false };
    }

    const ownerWorkspace = await WorkspaceModel.findOne({
        ownerId: user._id,
        status: "active",
    }).select("_id");
    const ownerMembership = ownerWorkspace
        ? await WorkspaceMemberModel.exists({
              workspaceId: ownerWorkspace._id,
              userId: user._id,
              role: "owner",
              status: "active",
          })
        : null;

    return { teacher, student, owner: Boolean(ownerMembership) };
};

export const requireUserCapability = (
    user: Pick<UserDocument, "capabilities">,
    capability: UserCapability
): void => {
    if (!hasUserCapability(user, capability)) {
        throw new ForbiddenException(
            "This account is not permitted to perform this action"
        );
    }
};

export const grantUserCapabilityService = async (
    userId: string,
    capability: UserCapability
): Promise<UserDocument> => {
    const legacyCapabilities: UserCapability[] =
        capability === "student" ? ["teacher", "student"] : ["teacher"];

    const legacyUser = await UserModel.findOneAndUpdate(
        {
            _id: userId,
            capabilities: { $exists: false },
        },
        { $set: { capabilities: legacyCapabilities } },
        { returnDocument: "after" }
    );

    if (legacyUser) {
        return legacyUser;
    }

    const updatedUser = await UserModel.findByIdAndUpdate(
        userId,
        { $addToSet: { capabilities: capability } },
        { returnDocument: "after" }
    );

    if (!updatedUser) {
        throw new NotFoundException("User not found");
    }

    return updatedUser;
};
