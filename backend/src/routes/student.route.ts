import { Router } from "express";
import {
  createStudentController,
  createStudentGuardianController,
  getStudentController,
  listStudentGuardiansController,
  listStudentsController,
  removeStudentGuardianController,
  updateStudentController,
  updateStudentGuardianController,
} from "../controllers/student.controller";
import { validateRequest } from "../middlewares/validate-request.middleware";
import {
  createStudentGuardianSchema,
  createStudentSchema,
  studentGuardianParamsSchema,
  studentListQuerySchema,
  studentParamsSchema,
  updateStudentGuardianSchema,
  updateStudentSchema,
} from "../validators/student.validation";

const studentRoutes = Router();

studentRoutes
  .get(
    "/",
    validateRequest({ query: studentListQuerySchema }),
    listStudentsController,
  )
  .post(
    "/",
    validateRequest({ body: createStudentSchema }),
    createStudentController,
  )
  .get(
    "/:studentId/guardians",
    validateRequest({ params: studentParamsSchema }),
    listStudentGuardiansController,
  )
  .post(
    "/:studentId/guardians",
    validateRequest({
      params: studentParamsSchema,
      body: createStudentGuardianSchema,
    }),
    createStudentGuardianController,
  )
  .patch(
    "/:studentId/guardians/:guardianId",
    validateRequest({
      params: studentGuardianParamsSchema,
      body: updateStudentGuardianSchema,
    }),
    updateStudentGuardianController,
  )
  .delete(
    "/:studentId/guardians/:guardianId",
    validateRequest({ params: studentGuardianParamsSchema }),
    removeStudentGuardianController,
  )
  .get(
    "/:studentId",
    validateRequest({ params: studentParamsSchema }),
    getStudentController,
  )
  .patch(
    "/:studentId",
    validateRequest({
      params: studentParamsSchema,
      body: updateStudentSchema,
    }),
    updateStudentController,
  );

export default studentRoutes;
