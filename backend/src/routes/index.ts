import { Router } from "express";
import authRoutes from "./auth.routes";
import workspaceRoutes from "./workspace.routes";

const routes = Router()
  // Auth
  .use("/auth", authRoutes)
  // Workspace
  .use("/workspaces", workspaceRoutes);

export default routes;
