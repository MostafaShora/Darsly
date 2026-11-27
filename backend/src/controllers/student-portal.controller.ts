import { Request, Response } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware";
import { getStudentAccessContext } from "../middlewares/student-access.middleware";
import { HTTPSTATUS } from "../config/http.config";
import {
    getStudentGroupsService,
    getStudentOverviewService,
    getStudentProfileService,
} from "../services/student-portal.service";

export const getStudentGroupsController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const data = await getStudentGroupsService(
            getStudentAccessContext(req)
        );

        res.status(HTTPSTATUS.OK).json({
            message: "Student groups retrieved successfully",
            data,
        });
    }
);

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
