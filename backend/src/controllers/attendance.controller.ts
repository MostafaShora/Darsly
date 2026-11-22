import { Request, Response } from "express";
import { toAttendanceRecordDto } from "../dtos/attendance.dto";
import { asyncHandler } from "../middlewares/asyncHandler.middleware";
import { getWorkspaceContext } from "../middlewares/workspace-access.middleware";
import { getValidatedPart } from "../middlewares/validate-request.middleware";
import {
    createAttendanceRecordService,
    listSessionAttendanceService,
    listStudentAttendanceService,
    updateAttendanceRecordService,
} from "../services/attendance.service";
import {
    CreateAttendanceRecordInput,
    SessionAttendanceListQuery,
    StudentAttendanceListQuery,
    UpdateAttendanceRecordInput,
} from "../validators/attendance.validation";

const getWorkspaceId = (req: Request) =>
    getWorkspaceContext(req).workspace._id;

export const listSessionAttendanceController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const { sessionId } = getValidatedPart<{ sessionId: string }>(
            req,
            "params"
        );
        const result = await listSessionAttendanceService(
            getWorkspaceId(req),
            sessionId,
            getValidatedPart<SessionAttendanceListQuery>(req, "query")
        );

        res.status(200).json({
            message: "Session attendance retrieved successfully",
            data: {
                items: result.items.map(toAttendanceRecordDto),
                pagination: result.pagination,
            },
        });
    }
);

export const createAttendanceRecordController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const { sessionId } = getValidatedPart<{ sessionId: string }>(
            req,
            "params"
        );
        const record = await createAttendanceRecordService(
            getWorkspaceId(req),
            sessionId,
            getValidatedPart<CreateAttendanceRecordInput>(req, "body")
        );

        res.status(201).json({
            message: "Attendance recorded successfully",
            data: toAttendanceRecordDto(record),
        });
    }
);

export const updateAttendanceRecordController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const { sessionId, attendanceId } = getValidatedPart<{
            sessionId: string;
            attendanceId: string;
        }>(req, "params");
        const record = await updateAttendanceRecordService(
            getWorkspaceId(req),
            sessionId,
            attendanceId,
            getValidatedPart<UpdateAttendanceRecordInput>(req, "body")
        );

        res.status(200).json({
            message: "Attendance updated successfully",
            data: toAttendanceRecordDto(record),
        });
    }
);

export const listStudentAttendanceController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const { studentId } = getValidatedPart<{ studentId: string }>(
            req,
            "params"
        );
        const result = await listStudentAttendanceService(
            getWorkspaceId(req),
            studentId,
            getValidatedPart<StudentAttendanceListQuery>(req, "query")
        );

        res.status(200).json({
            message: "Student attendance retrieved successfully",
            data: {
                items: result.items.map(toAttendanceRecordDto),
                pagination: result.pagination,
            },
        });
    }
);
