
import "dotenv/config";
import http from "http";
import dns from "dns";

import { Env } from "./config/env.config";
import connectDatabase from "./config/database.config";
import { createApp } from "./app";

// DNS Configuration
dns.setServers(["1.1.1.1", "8.8.8.8"]);

const app = createApp();
const server = http.createServer(app);

server.listen(Env.PORT, async () => {
    await connectDatabase();
    console.log(
        `Server is running on port ${Env.PORT} in ${Env.NODE_ENV} mode`
    );
});


export default app;