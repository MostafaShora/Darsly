import { Router } from "express";
import { passportAuthenticateJwt } from "../config/passport.config";
import {
    getStudentGroupsController,
    getStudentOverviewController,
    getStudentProfileController,
} from "../controllers/student-portal.controller";
import { requireStudentAccess } from "../middlewares/student-access.middleware";

const studentPortalRoutes = Router()
    .use(passportAuthenticateJwt, requireStudentAccess)
    .get("/groups", getStudentGroupsController)
    .get("/overview", getStudentOverviewController)
    .get("/profile", getStudentProfileController);

export default studentPortalRoutes;
