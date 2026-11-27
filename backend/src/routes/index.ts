import { Router } from "express";
import authRoutes from "./auth.route";
import workspaceRoutes from "./workspace.route";
import studentInvitationRedemptionRoutes from "./student-invitation-redemption.route";

const routes = Router()
  // Auth
  .use("/auth", authRoutes)
  // Student invitation redemption
  .use("/student-invitation-redemptions", studentInvitationRedemptionRoutes)
  // Workspace
  .use("/workspaces", workspaceRoutes);

export default routes;
