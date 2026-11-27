import { HTTPSTATUS, HttpStatusCodeType } from "../config/http.config";

export const ErrorCodes = {
    ERR_INTERNAL: "ERR_INTERNAL",
    ERR_BAD_REQUEST: "ERR_BAD_REQUEST",
    ERR_UNAUTHORIZED: "ERR_UNAUTHORIZED",
    ERR_FORBIDDEN: "ERR_FORBIDDEN",
    ERR_NOT_FOUND: "ERR_NOT_FOUND",
    ERR_CONFLICT: "ERR_CONFLICT",
    ERR_TOO_MANY_REQUESTS: "ERR_TOO_MANY_REQUESTS",
} as const;

export type ErrorCodeType = keyof typeof ErrorCodes;

export interface ErrorDetail {
    path: string;
    message: string;
}

export class AppError extends Error {
    constructor(
        message: string,
        public statusCode: HttpStatusCodeType = HTTPSTATUS.INTERNAL_SERVER_ERROR,
        public errorCode: ErrorCodeType = ErrorCodes.ERR_INTERNAL
    ) {
        super(message);
        Error.captureStackTrace(this, this.constructor);
    }
}

export class RequestValidationException extends AppError {
    constructor(public details: ErrorDetail[]) {
        super(
            "Invalid request data",
            HTTPSTATUS.BAD_REQUEST,
            ErrorCodes.ERR_BAD_REQUEST
        );
    }
}

export class InternalServerException extends AppError {
    constructor(message: string = "Internal Server Error") {
        super(message, HTTPSTATUS.INTERNAL_SERVER_ERROR, ErrorCodes.ERR_INTERNAL);
    }
}
export class ServiceUnavailableException extends AppError {
    constructor(message: string = "Service temporarily unavailable") {
        super(message, HTTPSTATUS.SERVICE_UNAVAILABLE, ErrorCodes.ERR_INTERNAL);
    }
}
export class NotFoundException extends AppError {
    constructor(message: string = "Resource Not Found") {
        super(message, HTTPSTATUS.NOT_FOUND, ErrorCodes.ERR_NOT_FOUND);
    }
}
export class BadRequestException extends AppError {
    constructor(message: string = "Bad Request") {
        super(message, HTTPSTATUS.BAD_REQUEST, ErrorCodes.ERR_BAD_REQUEST);
    }
}

export class ConflictException extends AppError {
    constructor(message: string = "Resource already exists") {
        super(
            message,
            HTTPSTATUS.CONFLICT,
            ErrorCodes.ERR_CONFLICT
        );
    }
}

export class TooManyRequestsException extends AppError {
    constructor(message: string = "Too many requests") {
        super(
            message,
            HTTPSTATUS.TOO_MANY_REQUESTS,
            ErrorCodes.ERR_TOO_MANY_REQUESTS
        );
    }
}

export class ForbiddenException extends AppError {
    constructor(message: string = "Forbidden") {
        super(
            message,
            HTTPSTATUS.FORBIDDEN,
            ErrorCodes.ERR_FORBIDDEN
        );
    }
}

export class UnauthorizedException extends AppError {
    constructor(message: string = "Unauthorized") {
        super(message, HTTPSTATUS.UNAUTHORIZED, ErrorCodes.ERR_UNAUTHORIZED);
    }
}