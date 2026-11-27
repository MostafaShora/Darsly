import UserModel, {
    UserCapability,
    UserDocument,
} from "../models/user.model";
import { ForbiddenException, NotFoundException } from "../utils/app-error";

export const hasUserCapability = (
    user: Pick<UserDocument, "capabilities">,
    capability: UserCapability
): boolean => {
    if (user.capabilities === undefined) {
        return capability === "teacher";
    }

    return user.capabilities.includes(capability);
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
