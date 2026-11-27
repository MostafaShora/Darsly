import { Request, Response } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware";
import { getWorkspaceContext } from "../middlewares/workspace-access.middleware";
import { getValidatedPart } from "../middlewares/validate-request.middleware";
import { getDashboardActivityService } from "../services/dashboard-activity.service";
import {
    getAttendanceReportService,
    getDashboardSummaryService,
    getFinanceReportService,
    getReportExportService,
} from "../services/report.service";
import {
    AttendanceReportQuery,
    DashboardActivityQuery,
    FinanceReportQuery,
    ReportRangeQuery,
    ReportExportRequest,
} from "../validators/report.validation";

const getWorkspaceId = (req: Request) =>
    getWorkspaceContext(req).workspace._id;

export const getDashboardActivityController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const activity = await getDashboardActivityService(
            getWorkspaceId(req),
            getValidatedPart<DashboardActivityQuery>(req, "query").limit
        );
        res.status(200).json({
            message: "Dashboard activity retrieved successfully",
            data: activity,
        });
    }
);

export const getDashboardSummaryController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const summary = await getDashboardSummaryService(
            getWorkspaceId(req),
            getValidatedPart<ReportRangeQuery>(req, "query")
        );
        res.status(200).json({
            message: "Dashboard summary retrieved successfully",
            data: summary,
        });
    }
);

export const getAttendanceReportController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const report = await getAttendanceReportService(
            getWorkspaceId(req),
            getValidatedPart<AttendanceReportQuery>(req, "query")
        );
        res.status(200).json({
            message: "Attendance report retrieved successfully",
            data: report,
        });
    }
);

export const getFinanceReportController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const report = await getFinanceReportService(
            getWorkspaceId(req),
            getValidatedPart<FinanceReportQuery>(req, "query")
        );
        res.status(200).json({
            message: "Finance report retrieved successfully",
            data: report,
        });
    }
);

export const getReportExportController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const report = await getReportExportService(
            getWorkspaceId(req),
            getValidatedPart<ReportExportRequest>(req, "body")
        );
        res.status(200).json({
            message: "Report export generated successfully",
            data: report,
        });
    }
);
