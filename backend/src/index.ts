
import path from "path";
import "dotenv/config";
import cors from "cors";
import http from "http";
import dns from "dns";
import express, { Request, Response } from "express";

import { Env } from "./config/env.config";
import cookieParser from "cookie-parser";
import { HTTPSTATUS } from "./config/http.config";
import connectDatabase from "./config/database.config";
import { errorHandler } from "./middlewares/errorHandler.middleware";
import routes from "./routes";
import { asyncHandler } from "./middlewares/asyncHandler.middleware";
import passport from "passport";

// DNS Configuration
dns.setServers(["1.1.1.1", "8.8.8.8"]);

// Express App & HTTP Server
const app = express();
const server = http.createServer(app);

// Middlewares
app.use(express.json({ limit: "10MB" }));
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(
    cors({
        origin: Env.FRONTEND_ORIGIN,
        credentials: true,
    })
)

app.use(passport.initialize());

// Health Check
app.get("/health",
    asyncHandler(async (req: Request, res: Response) => {
        res.status(HTTPSTATUS.OK).json({
            message: "Server is healthy",
            status: "OK",
        });
    })
);

app.use("/api", routes);

// Serve Frontend in Production
if (Env.NODE_ENV === "production") {
    const clientPath = path.resolve(
        __dirname,
        "../../client/dist"
    );

    app.use(express.static(clientPath));

    app.get(/^(?!\/api).*/, (_req: Request, res: Response) => {
        res.sendFile(path.join(clientPath, "index.html"));
    });
}

app.use(errorHandler);

server.listen(Env.PORT, async () => {
    await connectDatabase();
    console.log(
        `Server is running on port ${Env.PORT} in ${Env.NODE_ENV} mode`
    );
});


export default app;