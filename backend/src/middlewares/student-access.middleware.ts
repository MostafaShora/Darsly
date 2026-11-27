import { Request, RequestHandler } from "express";
import { asyncHandler } from "./asyncHandler.middleware";
import {
    InternalServerException,
    NotFoundException,
    UnauthorizedException,
} from "../utils/app-error";
import {
    resolveStudentAccessContextService,
} from "../services/student-context.service";
import type { StudentAccessContext } from "../services/student-context.service";

export const STUDENT_CONTEXT_HEADER = "x-student-account-link";

export const requireStudentAccess: RequestHandler = asyncHandler(
    async (req, _res, next) => {
        const userId = req.user?._id?.toString();
        if (!userId) {
            throw new UnauthorizedException("Authentication required");
        }

        const studentAccountLinkId = req.get(STUDENT_CONTEXT_HEADER);
        if (!studentAccountLinkId) {
            throw new NotFoundException("Student access not found");
        }

        req.studentContext = await resolveStudentAccessContextService(
            userId,
            studentAccountLinkId
        );
        next();
    }
);

export const getStudentAccessContext = (
    req: Request
): StudentAccessContext => {
    if (!req.studentContext) {
        throw new InternalServerException();
    }
    return req.studentContext;
};
