
import { Request, Response } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware";
import { loginSchema, registerSchema } from "../validators/auth.validation";
import { loginService, registerService } from "../services/auth.service";
import { clearJwtAuthCookie, setJwtAuthCookie } from "../utils/cookie";
import { HTTPSTATUS } from "../config/http.config";


type SafeUserInput = {
    _id: {
        toString(): string;
    };
    name: string;
    email: string;
    status: "active" | "pending" | "suspended";
    lastLoginAt?: Date | null;
};

const toSafeUser = (user: SafeUserInput) => ({
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    status: user.status,
    lastLoginAt: user.lastLoginAt ?? null,
});


export const registerController = asyncHandler(
    async (req: Request, res: Response) => {
        const body = registerSchema.parse(req.body);

        const user = await registerService(body);
        const userId = user._id.toString();
        const safeUser = toSafeUser(user);

        return setJwtAuthCookie({ res, userId })
            .status(HTTPSTATUS.CREATED)
            .json({
                message: "User created and logged in successfully",
                user: safeUser,
            });
    }
);

export const loginController = asyncHandler(
    async (req: Request, res: Response) => {
        const body = loginSchema.parse(req.body);

        const user = await loginService(body);
        const userId = user._id.toString();
        const safeUser = toSafeUser(user);

        return setJwtAuthCookie({ res, userId })
            .status(HTTPSTATUS.OK)
            .json({
                message: "User logged in successfully",
                user: safeUser,
            });
    }
);

export const logoutController = asyncHandler(
    async (_req: Request, res: Response) => {
        return clearJwtAuthCookie(res)
            .status(HTTPSTATUS.OK)
            .json({
                message: "User logged out successfully",
            });
    }
);

export const authStatusController = asyncHandler(
    async (req: Request, res: Response) => {
        const user = req.user;

        if (!user) {
            return res.status(HTTPSTATUS.UNAUTHORIZED).json({
                message: "Authentication required",
            });
        }

        return res.status(HTTPSTATUS.OK).json({
            message: "Authenticated user",
            user: toSafeUser(user),
        });
    }
);
