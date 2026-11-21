import { Request, Response } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware";
import { getWorkspaceContext } from "../middlewares/workspace-access.middleware";
import { getValidatedPart } from "../middlewares/validate-request.middleware";
import { toStudentDto } from "../dtos/student.dto";
import { toStudentGuardianDto as toGuardianLinkDto } from "../dtos/guardian.dto";
import {
    createStudentGuardianService,
    listStudentGuardiansService,
    removeStudentGuardianService,
    updateStudentGuardianService,
} from "../services/student-guardian.service";
import {
    createStudentService,
    getStudentByIdService,
    listStudentsService,
    updateStudentService,
} from "../services/student.service";
import {
    CreateStudentGuardianInput,
    CreateStudentInput,
    StudentListQuery,
    UpdateStudentGuardianInput,
    UpdateStudentInput,
} from "../validators/student.validation";

const getWorkspaceId = (req: Request) =>
    getWorkspaceContext(req).workspace._id;

export const listStudentsController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const result = await listStudentsService(
            getWorkspaceId(req),
            getValidatedPart<StudentListQuery>(req, "query")
        );

        res.status(200).json({
            message: "Students retrieved successfully",
            data: {
                items: result.items.map(toStudentDto),
                pagination: result.pagination,
            },
        });
    }
);

export const createStudentController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const student = await createStudentService(
            getWorkspaceId(req),
            getValidatedPart<CreateStudentInput>(req, "body")
        );

        res.status(201).json({
            message: "Student created successfully",
            data: toStudentDto(student),
        });
    }
);

export const getStudentController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const { studentId } = getValidatedPart<{ studentId: string }>(
            req,
            "params"
        );
        const student = await getStudentByIdService(
            getWorkspaceId(req),
            studentId
        );

        res.status(200).json({
            message: "Student retrieved successfully",
            data: toStudentDto(student),
        });
    }
);

export const updateStudentController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const { studentId } = getValidatedPart<{ studentId: string }>(
            req,
            "params"
        );
        const student = await updateStudentService(
            getWorkspaceId(req),
            studentId,
            getValidatedPart<UpdateStudentInput>(req, "body")
        );

        res.status(200).json({
            message: "Student updated successfully",
            data: toStudentDto(student),
        });
    }
);

export const listStudentGuardiansController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const { studentId } = getValidatedPart<{ studentId: string }>(
            req,
            "params"
        );
        const relationships = await listStudentGuardiansService(
            getWorkspaceId(req),
            studentId
        );

        res.status(200).json({
            message: "Student guardians retrieved successfully",
            data: relationships.map(({ link, guardian }) =>
                toGuardianLinkDto(link, guardian)
            ),
        });
    }
);

export const createStudentGuardianController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const { studentId } = getValidatedPart<{ studentId: string }>(
            req,
            "params"
        );
        const relationship = await createStudentGuardianService(
            getWorkspaceId(req),
            studentId,
            getValidatedPart<CreateStudentGuardianInput>(req, "body")
        );

        res.status(201).json({
            message: "Guardian linked to student successfully",
            data: toGuardianLinkDto(
                relationship.link,
                relationship.guardian
            ),
        });
    }
);

export const updateStudentGuardianController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const { studentId, guardianId } = getValidatedPart<{
            studentId: string;
            guardianId: string;
        }>(req, "params");
        const relationship = await updateStudentGuardianService(
            getWorkspaceId(req),
            studentId,
            guardianId,
            getValidatedPart<UpdateStudentGuardianInput>(req, "body")
        );

        res.status(200).json({
            message: "Student-guardian relationship updated successfully",
            data: toGuardianLinkDto(
                relationship.link,
                relationship.guardian
            ),
        });
    }
);

export const removeStudentGuardianController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
        const { studentId, guardianId } = getValidatedPart<{
            studentId: string;
            guardianId: string;
        }>(req, "params");
        const result = await removeStudentGuardianService(
            getWorkspaceId(req),
            studentId,
            guardianId
        );

        res.status(200).json({
            message: "Guardian unlinked from student successfully",
            data: result,
        });
    }
);
