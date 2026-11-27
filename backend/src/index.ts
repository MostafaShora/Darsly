import "dotenv/config";
import path from "path";
import http from "http";
import dns from "dns";
import express, { Request, Response } from "express";
import cookieParser from "cookie-parser";
import passport from "passport";

import { Env } from "./config/env.config";
import { HTTPSTATUS } from "./config/http.config";
import connectDatabase from "./config/database.config";
import { errorHandler } from "./middlewares/errorHandler.middleware";
import routes from "./routes";
import { asyncHandler } from "./middlewares/asyncHandler.middleware";

// DNS Configuration
dns.setServers(["1.1.1.1", "8.8.8.8"]);

const app = express();

app.use(express.json({ limit: "10MB" }));
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));

app.use(passport.initialize());

app.use(
    asyncHandler(async (_req, _res, next) => {
        await connectDatabase();
        next();
    })
);

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

if (Env.NODE_ENV === "production" && !process.env.VERCEL) {
    const clientPath = path.resolve(__dirname, "../../client/dist");

    app.use(express.static(clientPath));

    app.get(/^(?!\/api).*/, (_req: Request, res: Response) => {
        res.sendFile(path.join(clientPath, "index.html"));
    });
}

app.use(errorHandler);

if (!process.env.VERCEL) {
    const server = http.createServer(app);
    server.listen(Env.PORT, async () => {
        await connectDatabase();
        console.log(
            `Server is running on port ${Env.PORT} in ${Env.NODE_ENV} mode`
        );
    });
}

export default app;