import { Router } from "express";
import {
    getEnrollmentController,
    listEnrollmentsController,
    updateEnrollmentController,
} from "../controllers/enrollment.controller";
import { validateRequest } from "../middlewares/validate-request.middleware";
import {
    enrollmentListQuerySchema,
    enrollmentParamsSchema,
    updateEnrollmentSchema,
} from "../validators/enrollment.validation";

const enrollmentRoutes = Router();

enrollmentRoutes
    .get(
        "/",
        validateRequest({ query: enrollmentListQuerySchema }),
        listEnrollmentsController
    )
    .get(
        "/:enrollmentId",
        validateRequest({ params: enrollmentParamsSchema }),
        getEnrollmentController
    )
    .patch(
        "/:enrollmentId",
        validateRequest({
            params: enrollmentParamsSchema,
            body: updateEnrollmentSchema,
        }),
        updateEnrollmentController
    );

export default enrollmentRoutes;
