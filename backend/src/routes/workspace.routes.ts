import { Router } from "express";

import {
  createWorkspaceController,
  getMyWorkspacesController,
  getWorkspaceByIdController,
  updateWorkspaceController,
  suspendWorkspaceController,
  activateWorkspaceController,
} from "../controllers/workspace.controller";
import { get } from "mongoose";

const workspaceRoutes = Router()
  // Create a new workspace
  .post("/", createWorkspaceController)

  // Get all workspaces belonging to the current user
  .get("/mine", getMyWorkspacesController)

  // Get a specific workspace
  .get("/:workspaceId", getWorkspaceByIdController)

  // Update a workspace
  .patch("/:workspaceId", updateWorkspaceController)

  // Suspend a workspace
  .patch("/:workspaceId/suspend", suspendWorkspaceController)

  // Activate a workspace
  .patch("/:workspaceId/activate", activateWorkspaceController);

export default workspaceRoutes;
