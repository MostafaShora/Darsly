import { Router } from "express";
import {
    createGuardianController,
    getGuardianController,
    listGuardiansController,
    updateGuardianController,
} from "../controllers/guardian.controller";
import { validateRequest } from "../middlewares/validate-request.middleware";
import {
    createGuardianSchema,
    guardianListQuerySchema,
    guardianParamsSchema,
    updateGuardianSchema,
} from "../validators/guardian.validation";

const guardianRoutes = Router();

guardianRoutes
    .get(
        "/",
        validateRequest({ query: guardianListQuerySchema }),
        listGuardiansController
    )
    .post(
        "/",
        validateRequest({ body: createGuardianSchema }),
        createGuardianController
    )
    .get(
        "/:guardianId",
        validateRequest({ params: guardianParamsSchema }),
        getGuardianController
    )
    .patch(
        "/:guardianId",
        validateRequest({
            params: guardianParamsSchema,
            body: updateGuardianSchema,
        }),
        updateGuardianController
    );

export default guardianRoutes;
