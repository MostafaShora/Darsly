import { Router } from "express";
import  authRoutes  from "./auth.routes";
import workspaceRoutes from "./workspace.routes";

const router = Router();
// Auth
router.use("/auth", authRoutes);
// Workspace
router.use("/workspaces", workspaceRoutes);

export default router;