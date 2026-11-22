import { Router } from "express";
import {
    createSubjectController,
    getSubjectController,
    listSubjectsController,
    updateSubjectController,
} from "../controllers/subject.controller";
import { validateRequest } from "../middlewares/validate-request.middleware";
import {
    createSubjectSchema,
    subjectListQuerySchema,
    subjectParamsSchema,
    updateSubjectSchema,
} from "../validators/subject.validation";

const subjectRoutes = Router();

subjectRoutes
    .get(
        "/",
        validateRequest({ query: subjectListQuerySchema }),
        listSubjectsController
    )
    .post(
        "/",
        validateRequest({ body: createSubjectSchema }),
        createSubjectController
    )
    .get(
        "/:subjectId",
        validateRequest({ params: subjectParamsSchema }),
        getSubjectController
    )
    .patch(
        "/:subjectId",
        validateRequest({
            params: subjectParamsSchema,
            body: updateSubjectSchema,
        }),
        updateSubjectController
    );

export default subjectRoutes;
