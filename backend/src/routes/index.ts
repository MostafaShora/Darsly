import { Router } from "express";
import authRoutes from "./auth.route";
import workspaceRoutes from "./workspace.route";

const routes = Router()
  // Auth
  .use("/auth", authRoutes)
  // Workspace
  .use("/workspaces", workspaceRoutes);

export default routes;
