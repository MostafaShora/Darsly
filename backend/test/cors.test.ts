import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import { test } from "node:test";

import {
    allowedFrontendOrigins,
    corsMiddleware,
} from "../src/config/cors.config";

test("CORS allows the configured frontends with credentials and rejects other origins", async () => {
    const app = express();
    app.use(corsMiddleware);
    app.get("/api/auth/status", (_req, res) =>
        res.status(401).json({ message: "Authentication required" })
    );

    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");

    try {
        const baseUrl = `http://127.0.0.1:${address.port}`;

        for (const origin of allowedFrontendOrigins) {
            const response = await fetch(`${baseUrl}/api/auth/status`, {
                headers: { origin },
            });

            assert.equal(response.status, 401);
            assert.equal(
                response.headers.get("access-control-allow-origin"),
                origin
            );
            assert.equal(
                response.headers.get("access-control-allow-credentials"),
                "true"
            );
        }

        const preflight = await fetch(`${baseUrl}/api/auth/status`, {
            method: "OPTIONS",
            headers: {
                origin: allowedFrontendOrigins[0],
                "access-control-request-method": "GET",
                "access-control-request-headers": "content-type",
            },
        });

        assert.equal(preflight.status, 204);
        assert.equal(
            preflight.headers.get("access-control-allow-origin"),
            allowedFrontendOrigins[0]
        );
        assert.equal(
            preflight.headers.get("access-control-allow-credentials"),
            "true"
        );
        assert.match(
            preflight.headers.get("access-control-allow-methods") ?? "",
            /\bGET\b/
        );

        const rejected = await fetch(`${baseUrl}/api/auth/status`, {
            headers: { origin: "https://unapproved.example" },
        });
        assert.equal(rejected.status, 401);
        assert.equal(
            rejected.headers.get("access-control-allow-origin"),
            null
        );
    } finally {
        await new Promise<void>((resolve, reject) => {
            server.close((error) =>
                error ? reject(error) : resolve()
            );
        });
    }
});
