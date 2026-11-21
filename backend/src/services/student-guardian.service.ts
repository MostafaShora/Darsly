import mongoose, { Types } from "mongoose";
import GuardianModel, { GuardianDocument } from "../models/guardian.model";
import StudentGuardianModel, {
    StudentGuardianDocument,
} from "../models/student-guardian.model";
import StudentModel from "../models/student.model";
import {
    InternalServerException,
    NotFoundException,
} from "../utils/app-error";
import {
    CreateStudentGuardianInput,
    UpdateStudentGuardianInput,
} from "../validators/student.validation";

export interface StudentGuardianWithProfile {
    link: StudentGuardianDocument;
    guardian: GuardianDocument;
}

const ensureStudentExists = async (
    workspaceId: Types.ObjectId,
    studentId: string
): Promise<void> => {
    const student = await StudentModel.exists({
        _id: studentId,
        workspaceId,
    });

    if (!student) {
        throw new NotFoundException("Student not found");
    }
};

const ensureGuardianExists = async (
    workspaceId: Types.ObjectId,
    guardianId: string
): Promise<void> => {
    const guardian = await GuardianModel.exists({
        _id: guardianId,
        workspaceId,
    });

    if (!guardian) {
        throw new NotFoundException("Guardian not found");
    }
};

const getGuardian = async (
    workspaceId: Types.ObjectId,
    guardianId: Types.ObjectId
): Promise<GuardianDocument> => {
    const guardian = await GuardianModel.findOne({
        _id: guardianId,
        workspaceId,
    });

    if (!guardian) {
        throw new InternalServerException();
    }

    return guardian;
};

const replacePrimaryGuardian = async <T>(
    workspaceId: Types.ObjectId,
    studentId: string,
    update: (session: mongoose.ClientSession) => Promise<T>
): Promise<T> => {
    const session = await mongoose.startSession();

    try {
        const result = await session.withTransaction(async () => {
            await StudentGuardianModel.updateMany(
                {
                    workspaceId,
                    studentId,
                    isPrimary: true,
                },
                { $set: { isPrimary: false } },
                { session }
            );

            return update(session);
        });

        if (result === undefined) {
            throw new InternalServerException();
        }

        return result;
    } finally {
        await session.endSession();
    }
};

export const listStudentGuardiansService = async (
    workspaceId: Types.ObjectId,
    studentId: string
): Promise<StudentGuardianWithProfile[]> => {
    await ensureStudentExists(workspaceId, studentId);

    const links = await StudentGuardianModel.find({
        workspaceId,
        studentId,
    }).sort({ isPrimary: -1, createdAt: 1, _id: 1 });

    if (links.length === 0) {
        return [];
    }

    const guardians = await GuardianModel.find({
        workspaceId,
        _id: { $in: links.map((link) => link.guardianId) },
    });
    const guardiansById = new Map(
        guardians.map((guardian) => [guardian._id.toString(), guardian])
    );

    return links.map((link) => {
        const guardian = guardiansById.get(link.guardianId.toString());

        if (!guardian) {
            throw new InternalServerException();
        }

        return { link, guardian };
    });
};

export const createStudentGuardianService = async (
    workspaceId: Types.ObjectId,
    studentId: string,
    input: CreateStudentGuardianInput
): Promise<StudentGuardianWithProfile> => {
    await ensureStudentExists(workspaceId, studentId);
    await ensureGuardianExists(workspaceId, input.guardianId);

    const linkData = {
        workspaceId,
        studentId: new Types.ObjectId(studentId),
        guardianId: new Types.ObjectId(input.guardianId),
        relationship: input.relationship ?? "other",
        isPrimary: input.isPrimary ?? false,
        canReceiveNotifications: input.receivesNotifications ?? true,
    };

    let link: StudentGuardianDocument;

    if (linkData.isPrimary) {
        link = await replacePrimaryGuardian(
            workspaceId,
            studentId,
            async (session) => {
                const [created] = await StudentGuardianModel.create(
                    [linkData],
                    { session }
                );
                return created;
            }
        );
    } else {
        link = await StudentGuardianModel.create(linkData);
    }

    const guardian = await getGuardian(workspaceId, linkData.guardianId);

    return { link, guardian };
};

export const updateStudentGuardianService = async (
    workspaceId: Types.ObjectId,
    studentId: string,
    guardianId: string,
    input: UpdateStudentGuardianInput
): Promise<StudentGuardianWithProfile> => {
    await ensureStudentExists(workspaceId, studentId);
    await ensureGuardianExists(workspaceId, guardianId);

    const filter = {
        workspaceId,
        studentId,
        guardianId,
    };
    const update: {
        relationship?: UpdateStudentGuardianInput["relationship"];
        isPrimary?: boolean;
        canReceiveNotifications?: boolean;
    } = {};

    if (input.relationship !== undefined) {
        update.relationship = input.relationship;
    }

    if (input.isPrimary !== undefined) {
        update.isPrimary = input.isPrimary;
    }

    if (input.receivesNotifications !== undefined) {
        update.canReceiveNotifications = input.receivesNotifications;
    }

    let link: StudentGuardianDocument | null;

    if (input.isPrimary === true) {
        link = await replacePrimaryGuardian(
            workspaceId,
            studentId,
            async (session) => {
                const updated = await StudentGuardianModel.findOneAndUpdate(
                    filter,
                    { $set: update },
                    {
                        returnDocument: "after",
                        runValidators: true,
                        session,
                    }
                );

                if (!updated) {
                    throw new NotFoundException(
                        "Student-guardian relationship not found"
                    );
                }

                return updated;
            }
        );
    } else {
        link = await StudentGuardianModel.findOneAndUpdate(
            filter,
            { $set: update },
            {
                returnDocument: "after",
                runValidators: true,
            }
        );
    }

    if (!link) {
        throw new NotFoundException("Student-guardian relationship not found");
    }

    const guardian = await getGuardian(workspaceId, link.guardianId);
    return { link, guardian };
};

export const removeStudentGuardianService = async (
    workspaceId: Types.ObjectId,
    studentId: string,
    guardianId: string
) => {
    await ensureStudentExists(workspaceId, studentId);
    await ensureGuardianExists(workspaceId, guardianId);

    const link = await StudentGuardianModel.findOneAndDelete({
        workspaceId,
        studentId,
        guardianId,
    });

    if (!link) {
        throw new NotFoundException("Student-guardian relationship not found");
    }

    return {
        studentId: link.studentId.toString(),
        guardianId: link.guardianId.toString(),
    };
};
