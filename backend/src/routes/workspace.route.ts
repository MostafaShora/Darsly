
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

const workspaceRoutes = Router();

// Require authentication for all workspace endpoints
workspaceRoutes.use(passportAuthenticateJwt);

workspaceRoutes
  .post("/", createWorkspaceController)
  .get("/mine", getMyWorkspacesController)
  .get("/:workspaceId", getWorkspaceByIdController)
  .patch("/:workspaceId", updateWorkspaceController)
  .patch("/:workspaceId/suspend", suspendWorkspaceController)
  .patch("/:workspaceId/activate", activateWorkspaceController);

export default workspaceRoutes;
