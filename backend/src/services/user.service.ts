
import UserModel from "../models/user.model";

export const findByIdUserService = async (userId: string) => {
    const user = await UserModel.findById(userId);
    return user;
};

export const getUsersService = async (userId: string) => {
    const users = await UserModel.find({
        _id: { $ne: userId }
    }).select("-passwordHash");

    return users;
};
