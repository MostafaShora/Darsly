import { Router } from "express";
import {
    createAttendanceRecordController,
    listSessionAttendanceController,
    updateAttendanceRecordController,
} from "../controllers/attendance.controller";
import {
    createSessionController,
    getSessionController,
    listSessionsController,
    updateSessionController,
} from "../controllers/session.controller";
import { validateRequest } from "../middlewares/validate-request.middleware";
import {
    attendanceRecordParamsSchema,
    createAttendanceRecordSchema,
    sessionAttendanceListQuerySchema,
    sessionAttendanceParamsSchema,
    updateAttendanceRecordSchema,
} from "../validators/attendance.validation";
import {
    createSessionSchema,
    sessionListQuerySchema,
    sessionParamsSchema,
    updateSessionSchema,
} from "../validators/session.validation";

const sessionRoutes = Router();

sessionRoutes
    .get(
        "/",
        validateRequest({ query: sessionListQuerySchema }),
        listSessionsController
    )
    .post(
        "/",
        validateRequest({ body: createSessionSchema }),
        createSessionController
    )
    .get(
        "/:sessionId/attendance",
        validateRequest({
            params: sessionAttendanceParamsSchema,
            query: sessionAttendanceListQuerySchema,
        }),
        listSessionAttendanceController
    )
    .post(
        "/:sessionId/attendance",
        validateRequest({
            params: sessionAttendanceParamsSchema,
            body: createAttendanceRecordSchema,
        }),
        createAttendanceRecordController
    )
    .patch(
        "/:sessionId/attendance/:attendanceId",
        validateRequest({
            params: attendanceRecordParamsSchema,
            body: updateAttendanceRecordSchema,
        }),
        updateAttendanceRecordController
    )
    .get(
        "/:sessionId",
        validateRequest({ params: sessionParamsSchema }),
        getSessionController
    )
    .patch(
        "/:sessionId",
        validateRequest({
            params: sessionParamsSchema,
            body: updateSessionSchema,
        }),
        updateSessionController
    );

export default sessionRoutes;
