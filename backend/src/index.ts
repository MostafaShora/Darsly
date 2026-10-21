
import path from "path";
import "dotenv/config";
import cors from "cors";
import http from "http";
import dns from "dns";
import express, { Request, Response } from "express";

import { Env } from "./config/env.config";
import { HTTPSTATUS } from "./config/http.config";
import connectDatabase from "./config/database.config";

// DNS Configuration
dns.setServers(["1.1.1.1", "8.8.8.8"]);

// Express App & HTTP Server
const app = express();
const server = http.createServer(app);

// Middlewares
app.use(express.json({ limit: "10MB" }));
app.use(express.urlencoded({ extended: true }));

app.use(
    cors({
        origin: Env.FRONTEND_ORIGIN,
        credentials: true,
    })
);

// Health Check
app.get("/", (_req: Request, res: Response) => {
    res.status(HTTPSTATUS.OK).json({
        message: "Server is healthy",
        status: "OK",
    });
});

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



server.listen(Env.PORT, async () => {
    await connectDatabase();
    console.log(
        `Server is running on port ${Env.PORT} in ${Env.NODE_ENV} mode`
    );
});


export default app;