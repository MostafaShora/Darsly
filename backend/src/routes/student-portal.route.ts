import { Router } from "express";
import { passportAuthenticateJwt } from "../config/passport.config";
import {
    getStudentOverviewController,
    getStudentProfileController,
} from "../controllers/student-portal.controller";
import { requireStudentAccess } from "../middlewares/student-access.middleware";

const studentPortalRoutes = Router()
    .use(passportAuthenticateJwt, requireStudentAccess)
    .get("/overview", getStudentOverviewController)
    .get("/profile", getStudentProfileController);

export default studentPortalRoutes;
