import { RequestHandler } from "express";
import { z } from "zod";
import { RequestValidationException } from "../utils/app-error";

type RequestPart = "body" | "query" | "params";

export type RequestValidationSchemas = Partial<
    Record<RequestPart, z.ZodType>
>;

export type ValidatedRequestParts = Partial<
    Record<RequestPart, unknown>
>;

declare global {
    namespace Express {
        interface Request {
            validated?: ValidatedRequestParts;
        }
    }
}

const formatIssues = (part: RequestPart, issues: z.core.$ZodIssue[]) =>
    issues.map((issue) => ({
        path: [part, ...issue.path.map(String)].join("."),
        message: issue.message,
    }));

export const validateRequest = (
    schemas: RequestValidationSchemas
): RequestHandler => (req, _res, next) => {
    const validated: ValidatedRequestParts = {};

    for (const part of ["params", "query", "body"] as const) {
        const schema = schemas[part];

        if (!schema) {
            continue;
        }

        const result = schema.safeParse(req[part]);

        if (!result.success) {
            next(
                new RequestValidationException(
                    formatIssues(part, result.error.issues)
                )
            );
            return;
        }

        validated[part] = result.data;
    }

    req.validated = validated;
    next();
};
