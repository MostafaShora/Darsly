import { Router } from "express";
import { passportAuthenticateJwt } from "../config/passport.config";
import {
    listActiveStudentContextsController,
    selectStudentContextController,
} from "../controllers/student-context.controller";
import { validateRequest } from "../middlewares/validate-request.middleware";
import { selectStudentContextSchema } from "../validators/student-context.validation";

const studentContextRoutes = Router()
    .use(passportAuthenticateJwt)
    .get("/", listActiveStudentContextsController)
    .post(
        "/selection",
        validateRequest({ body: selectStudentContextSchema }),
        selectStudentContextController
    );

export default studentContextRoutes;
