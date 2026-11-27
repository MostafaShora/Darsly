import jwt from "jsonwebtoken";
import { Response, CookieOptions } from "express";
import { Env } from "../config/env.config";

type Time = `${number}${"s" | "m" | "h" | "d" | "w" | "y"}`;

type CookieInput = {
    res: Response;
    userId: string;
};

const isProduction = Env.NODE_ENV === "production";

const authCookieOptions: CookieOptions = {
    path: "/",
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
};

export const setJwtAuthCookie = ({ res, userId }: CookieInput) => {
    const expiresIn = (Env.JWT_EXPIRES_IN || "7d") as Time;

    const token = jwt.sign(
        { userId },
        Env.JWT_SECRET,
        {
            audience: ["user"],
            expiresIn,
        }
    );

    return res.cookie("accessToken", token, {
        ...authCookieOptions,
        maxAge: 7 * 24 * 60 * 60 * 1000,
    });
};

export const clearJwtAuthCookie = (res: Response) =>
    res.clearCookie("accessToken", authCookieOptions);
