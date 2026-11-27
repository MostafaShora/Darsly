import { Request, Response } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware";
import {
    listActiveStudentContextsService,
    resolveStudentAccessContextService,
    toStudentContextDto,
} from "../services/student-context.service";
import { HTTPSTATUS } from "../config/http.config";
import {
    UnauthorizedException,
} from "../utils/app-error";
import { getValidatedPart } from "../middlewares/validate-request.middleware";
import type { SelectStudentContextInput } from "../validators/student-context.validation";

const getAuthenticatedUserId = (req: Request): string => {
    const userId = req.user?._id?.toString();
    if (!userId) {
        throw new UnauthorizedException("Authentication required");
    }
    return userId;
};

export const listActiveStudentContextsController = asyncHandler(
    async (req: Request, res: Response) => {
        const contexts = await listActiveStudentContextsService(
            getAuthenticatedUserId(req)
        );

        return res.status(HTTPSTATUS.OK).json({
            message: "Student contexts retrieved successfully",
            data: contexts,
        });
    }
);

export const selectStudentContextController = asyncHandler(
    async (req: Request, res: Response) => {
        const body = getValidatedPart<SelectStudentContextInput>(req, "body");
        const context = await resolveStudentAccessContextService(
            getAuthenticatedUserId(req),
            body.studentAccountLinkId
        );

        return res.status(HTTPSTATUS.OK).json({
            message: "Student context validated successfully",
            data: toStudentContextDto(context),
        });
    }
);
