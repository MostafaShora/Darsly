
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
import sessionRoutes from "./session.route";
import studyGroupRoutes from "./study-group.route";
import subjectRoutes from "./subject.route";
import studentRoutes from "./student.route";
import { requireWorkspaceAccess } from "../middlewares/workspace-access.middleware";
import invoiceRoutes from "./invoice.route";
import paymentRoutes from "./payment.route";
import {
  getAttendanceReportController,
  getDashboardSummaryController,
  getFinanceReportController,
} from "../controllers/report.controller";
import { validateRequest } from "../middlewares/validate-request.middleware";
import {
  attendanceReportQuerySchema,
  financeReportQuerySchema,
  reportRangeQuerySchema,
} from "../validators/report.validation";

const workspaceRoutes = Router();

// Require authentication for all workspace endpoints
workspaceRoutes.use(passportAuthenticateJwt);

workspaceRoutes
  .use("/:workspaceId/students", requireWorkspaceAccess(), studentRoutes)
  .use("/:workspaceId/guardians", requireWorkspaceAccess(), guardianRoutes)
  .use("/:workspaceId/sessions", requireWorkspaceAccess(), sessionRoutes)
  .use("/:workspaceId/invoices", requireWorkspaceAccess(), invoiceRoutes)
  .use("/:workspaceId/payments", requireWorkspaceAccess(), paymentRoutes)
  .use("/:workspaceId/subjects", requireWorkspaceAccess(), subjectRoutes)
  .use("/:workspaceId/groups", requireWorkspaceAccess(), studyGroupRoutes)
  .use("/:workspaceId/enrollments", requireWorkspaceAccess(), enrollmentRoutes);

workspaceRoutes
  .get(
    "/:workspaceId/dashboard/summary",
    requireWorkspaceAccess(),
    validateRequest({ query: reportRangeQuerySchema }),
    getDashboardSummaryController,
  )
  .get(
    "/:workspaceId/reports/attendance",
    requireWorkspaceAccess(),
    validateRequest({ query: attendanceReportQuerySchema }),
    getAttendanceReportController,
  )
  .get(
    "/:workspaceId/reports/finance",
    requireWorkspaceAccess(),
    validateRequest({ query: financeReportQuerySchema }),
    getFinanceReportController,
  );

workspaceRoutes
  .post("/", createWorkspaceController)
  .get("/mine", getMyWorkspacesController)
  .get("/:workspaceId", getWorkspaceByIdController)
  .patch("/:workspaceId", updateWorkspaceController)
  .patch("/:workspaceId/suspend", suspendWorkspaceController)
  .patch("/:workspaceId/activate", activateWorkspaceController);

export default workspaceRoutes;
