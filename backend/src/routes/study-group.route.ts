import { Router } from "express";
import {
    createStudyGroupController,
    getStudyGroupController,
    listStudyGroupsController,
    updateStudyGroupController,
} from "../controllers/study-group.controller";
import {
    createEnrollmentController,
    listGroupEnrollmentsController,
} from "../controllers/enrollment.controller";
import { validateRequest } from "../middlewares/validate-request.middleware";
import {
    createEnrollmentSchema,
    groupEnrollmentListQuerySchema,
    groupEnrollmentParamsSchema,
} from "../validators/enrollment.validation";
import {
    createStudyGroupSchema,
    studyGroupListQuerySchema,
    studyGroupParamsSchema,
    updateStudyGroupSchema,
} from "../validators/study-group.validation";

const studyGroupRoutes = Router();

studyGroupRoutes
    .get(
        "/",
        validateRequest({ query: studyGroupListQuerySchema }),
        listStudyGroupsController
    )
    .post(
        "/",
        validateRequest({ body: createStudyGroupSchema }),
        createStudyGroupController
    )
    .get(
        "/:groupId/enrollments",
        validateRequest({
            params: groupEnrollmentParamsSchema,
            query: groupEnrollmentListQuerySchema,
        }),
        listGroupEnrollmentsController
    )
    .post(
        "/:groupId/enrollments",
        validateRequest({
            params: groupEnrollmentParamsSchema,
            body: createEnrollmentSchema,
        }),
        createEnrollmentController
    )
    .get(
        "/:groupId",
        validateRequest({ params: studyGroupParamsSchema }),
        getStudyGroupController
    )
    .patch(
        "/:groupId",
        validateRequest({
            params: studyGroupParamsSchema,
            body: updateStudyGroupSchema,
        }),
        updateStudyGroupController
    );

export default studyGroupRoutes;
