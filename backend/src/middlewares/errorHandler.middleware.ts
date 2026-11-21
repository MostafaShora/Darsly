import { ErrorRequestHandler } from "express";
import mongoose from "mongoose";
import { ZodError } from "zod";
import { HTTPSTATUS } from "../config/http.config";
import {
    AppError,
    ConflictException,
    ErrorCodes,
    RequestValidationException,
} from "../utils/app-error";

const isDuplicateKeyError = (error: unknown): boolean =>
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000;

const isMalformedJsonError = (error: unknown): boolean =>
    error instanceof SyntaxError &&
    "status" in error &&
    error.status === HTTPSTATUS.BAD_REQUEST &&
    "type" in error &&
    error.type === "entity.parse.failed";

const getDiagnosticStack = (error: unknown): string[] | undefined => {
    if (!(error instanceof Error) || !error.stack) {
        return undefined;
    }

    return error.stack.split("\n").slice(1);
};

export const errorHandler: ErrorRequestHandler = (
    error,
    req,
    res,
    _next
): void => {
    if (error instanceof ZodError) {
        error = new RequestValidationException(
            error.issues.map((issue) => ({
                path: issue.path.map(String).join("."),
                message: issue.message,
            }))
        );
    } else if (isMalformedJsonError(error)) {
        error = new RequestValidationException([]);
    } else if (error instanceof mongoose.Error.ValidationError) {
        error = new RequestValidationException([]);
    } else if (isDuplicateKeyError(error)) {
        error = new ConflictException("A record with these values already exists");
    }

    if (error instanceof AppError) {
        const response: {
            message: string;
            errorCode: string;
            details?: RequestValidationException["details"];
        } = {
            message: error.message,
            errorCode: error.errorCode,
        };

        if (
            error instanceof RequestValidationException &&
            error.details.length > 0
        ) {
            response.details = error.details;
        }

        res.status(error.statusCode).json(response);
        return;
    }

    console.error("Unhandled API error", {
        method: req.method,
        path: req.path,
        name: error instanceof Error ? error.name : "UnknownError",
        stack: getDiagnosticStack(error),
    });

    res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({
        message: "Internal Server Error",
        errorCode: ErrorCodes.ERR_INTERNAL,
    });
};