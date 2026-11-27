import { Request, Response } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware";
import { getStudentAccessContext } from "../middlewares/student-access.middleware";
import { HTTPSTATUS } from "../config/http.config";
import {
    getStudentOverviewService,
    getStudentProfileService,
} from "../services/student-portal.service";

export const getStudentOverviewController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const data = await getStudentOverviewService(
            getStudentAccessContext(req)
        );

        res.status(HTTPSTATUS.OK).json({
            message: "Student overview retrieved successfully",
            data,
        });
    }
);

export const getStudentProfileController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const data = await getStudentProfileService(
            getStudentAccessContext(req)
        );

        res.status(HTTPSTATUS.OK).json({
            message: "Student profile retrieved successfully",
            data,
        });
    }
);
