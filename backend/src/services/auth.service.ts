
import bcrypt from "bcrypt";
import UserModel from "../models/user.model";
import {
    LoginSchemaType,
    RegisterSchemaType,
} from "../validators/auth.validation";
import {
    ConflictException,
    UnauthorizedException,
} from "../utils/app-error";

export const registerService = async (body: RegisterSchemaType) => {
    const { name, email, password } = body;

    const existingUser = await UserModel.findOne({ email });

    if (existingUser) {
        throw new ConflictException("Email is already registered");
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const newUser = await UserModel.create({
        name,
        email,
        passwordHash,
    });

    return newUser;
};

export const loginService = async (body: LoginSchemaType) => {
    const { email, password } = body;

    const user = await UserModel.findOne({ email })
        .select("+passwordHash");

    if (!user) {
        throw new UnauthorizedException("Invalid email or password");
    }

    const isPasswordValid = await bcrypt.compare(
        password,
        user.passwordHash,
    );

    if (!isPasswordValid) {
        throw new UnauthorizedException("Invalid email or password");
    }

    if (user.status !== "active") {
        throw new UnauthorizedException("Account is not active");
    }

    user.lastLoginAt = new Date();
    await user.save();

    return user;
};
