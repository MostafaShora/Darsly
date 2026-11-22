
import { Router } from "express";
import { passportAuthenticateJwt } from "../config/passport.config";

import {
  createWorkspaceController,
  getMyWorkspacesController,
  getWorkspaceByIdController,
  updateWorkspaceController,
  suspendWorkspaceController,
  activateWorkspaceController,
} from "../controllers/workspace.controller";
import enrollmentRoutes from "./enrollment.route";
import guardianRoutes from "./guardian.route";
import studyGroupRoutes from "./study-group.route";
import subjectRoutes from "./subject.route";
import studentRoutes from "./student.route";
import { requireWorkspaceAccess } from "../middlewares/workspace-access.middleware";

const workspaceRoutes = Router();

// Require authentication for all workspace endpoints
workspaceRoutes.use(passportAuthenticateJwt);

workspaceRoutes
  .use("/:workspaceId/students", requireWorkspaceAccess(), studentRoutes)
  .use("/:workspaceId/guardians", requireWorkspaceAccess(), guardianRoutes)
  .use("/:workspaceId/subjects", requireWorkspaceAccess(), subjectRoutes)
  .use("/:workspaceId/groups", requireWorkspaceAccess(), studyGroupRoutes)
  .use("/:workspaceId/enrollments", requireWorkspaceAccess(), enrollmentRoutes);

workspaceRoutes
  .post("/", createWorkspaceController)
  .get("/mine", getMyWorkspacesController)
  .get("/:workspaceId", getWorkspaceByIdController)
  .patch("/:workspaceId", updateWorkspaceController)
  .patch("/:workspaceId/suspend", suspendWorkspaceController)
  .patch("/:workspaceId/activate", activateWorkspaceController);

export default workspaceRoutes;
