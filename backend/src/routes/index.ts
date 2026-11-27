import { Router } from "express";
import authRoutes from "./auth.route";
import workspaceRoutes from "./workspace.route";
import studentInvitationRedemptionRoutes from "./student-invitation-redemption.route";
import studentContextRoutes from "./student-context.route";

const routes = Router()
  // Auth
  .use("/auth", authRoutes)
  // Student invitation redemption
  .use("/student-invitation-redemptions", studentInvitationRedemptionRoutes)
  // Authenticated student context discovery and selection
  .use("/student-contexts", studentContextRoutes)
  // Workspace
  .use("/workspaces", workspaceRoutes);

export default routes;
