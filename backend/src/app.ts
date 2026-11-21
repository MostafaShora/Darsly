import path from "path";
import cors from "cors";
import express, { Request, Response } from "express";
import cookieParser from "cookie-parser";
import passport from "passport";

import { Env } from "./config/env.config";
import { HTTPSTATUS } from "./config/http.config";
import { errorHandler } from "./middlewares/errorHandler.middleware";
import routes from "./routes";
import { asyncHandler } from "./middlewares/asyncHandler.middleware";

export const createApp = () => {
    const app = express();

    app.use(express.json({ limit: "10MB" }));
    app.use(cookieParser());
    app.use(express.urlencoded({ extended: true }));
    app.use(
        cors({
            origin: Env.FRONTEND_ORIGIN,
            credentials: true,
        })
    );

    app.use(passport.initialize());

    app.get(
        "/health",
        asyncHandler(async (_req: Request, res: Response) => {
            res.status(HTTPSTATUS.OK).json({
                message: "Server is healthy",
                status: "OK",
            });
        })
    );

    app.use("/api", routes);

    if (Env.NODE_ENV === "production") {
        const clientPath = path.resolve(__dirname, "../../client/dist");

        app.use(express.static(clientPath));

        app.get(/^(?!\/api).*/, (_req: Request, res: Response) => {
            res.sendFile(path.join(clientPath, "index.html"));
        });
    }

    app.use(errorHandler);

    return app;
};
