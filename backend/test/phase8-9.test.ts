import assert from "node:assert/strict";
import type { NextFunction, Request, Response } from "express";
import { TestContext, test } from "node:test";
import { Types } from "mongoose";
import {
    getStudentOverviewController,
    getStudentProfileController,
} from "../src/controllers/student-portal.controller";
import { requireStudentAccess } from "../src/middlewares/student-access.middleware";
import AttendanceRecordModel from "../src/models/attendance-record.model";
import EnrollmentModel from "../src/models/enrollment.model";
import SessionModel from "../src/models/session.model";
import StudentAccountLinkModel from "../src/models/student-account-link.model";
import StudentModel from "../src/models/student.model";
import StudyGroupModel from "../src/models/study-group.model";
import UserModel from "../src/models/user.model";
import WorkspaceModel from "../src/models/workspace.model";
import {
    getStudentOverviewService,
    getStudentProfileService,
} from "../src/services/student-portal.service";
import { NotFoundException } from "../src/utils/app-error";

const userId = new Types.ObjectId();
const studentId = new Types.ObjectId();
const workspaceId = new Types.ObjectId();
const linkId = new Types.ObjectId();
const groupId = new Types.ObjectId();
const sessionId = new Types.ObjectId();
const otherStudentId = new Types.ObjectId();
const otherWorkspaceId = new Types.ObjectId();

const context = {
    studentAccountLinkId: linkId.toString(),
    userId: userId.toString(),
    studentId: studentId.toString(),
    workspaceId: workspaceId.toString(),
    studentName: "Student A",
    workspaceName: "Workspace A",
};

const makeQuery = <T>(value: T) => {
    const query = {
        select: () => query,
        sort: () => query,
        limit: () => query,
        then: (
            resolve: (result: T) => unknown,
            reject: (error: unknown) => unknown
        ) => Promise.resolve(value).then(resolve, reject),
    };
    return query;
};

const studentRecord = {
    _id: studentId,
    workspaceId,
    name: "Student A",
    email: "student@example.test",
    phone: "01000000000",
    schoolName: "School A",
    grade: "Grade 8",
    status: "active",
    notes: "Teacher-only note",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
};

const makeResponse = () => {
    let statusCode = 0;
    let body: unknown;
    const response = {
        status(code: number) {
            statusCode = code;
            return response;
        },
        json(value: unknown) {
            body = value;
            return response;
        },
    } as unknown as Response;
    return {
        response,
        get statusCode() {
            return statusCode;
        },
        get body() {
            return body;
        },
    };
};

const requestForContext = (
    studentContext: typeof context,
    body: unknown = {}
) =>
    ({
        studentContext,
        body,
        query: {
            studentId: otherStudentId.toString(),
            workspaceId: otherWorkspaceId.toString(),
        },
        params: {
            studentId: otherStudentId.toString(),
            workspaceId: otherWorkspaceId.toString(),
        },
    }) as unknown as Request;

const runStudentAccess = async (
    t: TestContext,
    options: {
        linkId?: string;
        link?: unknown;
        student?: unknown;
        workspace?: unknown;
        includeHeader?: boolean;
    } = {}
) => {
    t.mock.method(
        UserModel,
        "findById",
        (async () => ({ _id: userId, status: "active", capabilities: ["student"] })) as never
    );
    t.mock.method(
        StudentAccountLinkModel,
        "findOne",
        (() =>
            makeQuery(
                options.link === undefined
                    ? {
                          _id: linkId,
                          studentId,
                          workspaceId,
                          status: "active",
                      }
                    : options.link
            )) as never
    );
    t.mock.method(
        StudentModel,
        "findOne",
        (() => makeQuery(options.student === undefined ? studentRecord : options.student)) as never
    );
    t.mock.method(
        WorkspaceModel,
        "findOne",
        (() =>
            makeQuery(
                options.workspace === undefined
                    ? { _id: workspaceId, name: "Workspace A", status: "active" }
                    : options.workspace
            )) as never
    );

    const req = {
        user: { _id: userId },
        body: { studentId: otherStudentId, workspaceId: otherWorkspaceId },
        get: (name: string) =>
            name === "x-student-account-link" && options.includeHeader !== false
                ? options.linkId ?? linkId.toString()
                : undefined,
    } as unknown as Request;
    let nextError: unknown;
    const next = ((error?: unknown) => {
        nextError = error;
    }) as NextFunction;

    await requireStudentAccess(req, {} as Response, next);
    return { req, nextError };
};

test("Student Overview uses only the trusted Student and Workspace and returns available metrics", async (t: TestContext) => {
    const filters: Record<string, Record<string, unknown>> = {};
    t.mock.method(
        StudentModel,
        "findOne",
        ((filter: Record<string, unknown>) => {
            filters.student = filter;
            return makeQuery(studentRecord);
        }) as never
    );
    t.mock.method(
        EnrollmentModel,
        "find",
        ((filter: Record<string, unknown>) => {
            filters.enrollment = filter;
            return makeQuery([{ groupId }]);
        }) as never
    );
    t.mock.method(
        StudyGroupModel,
        "find",
        ((filter: Record<string, unknown>) => {
            filters.group = filter;
            return makeQuery([{ _id: groupId, name: "Group A" }]);
        }) as never
    );
    t.mock.method(
        SessionModel,
        "countDocuments",
        ((filter: Record<string, unknown>) => {
            filters.sessionCount = filter;
            return Promise.resolve(2);
        }) as never
    );
    t.mock.method(
        SessionModel,
        "find",
        ((filter: Record<string, unknown>) => {
            filters.sessions = filter;
            return makeQuery([
                {
                    _id: sessionId,
                    title: "Math lesson",
                    groupId,
                    startsAt: new Date("2026-12-01T10:00:00.000Z"),
                },
            ]);
        }) as never
    );
    t.mock.method(
        AttendanceRecordModel,
        "countDocuments",
        ((filter: Record<string, unknown>) =>
            Promise.resolve(
                { present: 2, absent: 1, late: 1, excused: 0 }[
                    filter.status as "present" | "absent" | "late" | "excused"
                ]
            )) as never
    );
    t.mock.method(
        AttendanceRecordModel,
        "find",
        ((filter: Record<string, unknown>) => {
            filters.attendance = filter;
            return makeQuery([
                {
                    status: "present",
                    recordedAt: new Date("2026-11-25T10:00:00.000Z"),
                },
            ]);
        }) as never
    );

    const result = await getStudentOverviewService(context);

    assert.deepEqual(filters.student, {
        _id: studentId.toString(),
        workspaceId: workspaceId.toString(),
        status: "active",
    });
    assert.deepEqual(filters.enrollment, {
        workspaceId: workspaceId.toString(),
        studentId: studentId.toString(),
        status: "active",
        enrolledAt: { $lte: (filters.enrollment.enrolledAt as { $lte: Date }).$lte },
    });
    assert.deepEqual(filters.group, {
        _id: { $in: [groupId] },
        workspaceId: workspaceId.toString(),
        status: "active",
    });
    assert.deepEqual(filters.attendance, {
        workspaceId: workspaceId.toString(),
        studentId: studentId.toString(),
    });
    assert.deepEqual(result, {
        studentName: "Student A",
        activeGroupCount: 1,
        upcomingSessionCount: 2,
        upcomingSessions: [
            {
                title: "Math lesson",
                groupName: "Group A",
                startsAt: "2026-12-01T10:00:00.000Z",
            },
        ],
        attendanceSummary: {
            total: 4,
            present: 2,
            absent: 1,
            late: 1,
            excused: 0,
        },
        recentAttendance: [
            {
                status: "present",
                recordedAt: "2026-11-25T10:00:00.000Z",
            },
        ],
    });
    assert.equal(JSON.stringify(result).includes("Teacher-only note"), false);
});

test("Student Profile response is an explicit allowlist with teacher-only and internal fields excluded", async (t: TestContext) => {
    let capturedFilter: Record<string, unknown> | undefined;
    let selectedFields = "";
    t.mock.method(
        StudentModel,
        "findOne",
        ((filter: Record<string, unknown>) => {
            capturedFilter = filter;
            const query = makeQuery(studentRecord);
            const select = query.select;
            query.select = (fields?: string) => {
                selectedFields = fields ?? "";
                return select();
            };
            return query;
        }) as never
    );

    const profile = await getStudentProfileService(context);

    assert.deepEqual(capturedFilter, {
        _id: studentId.toString(),
        workspaceId: workspaceId.toString(),
        status: "active",
    });
    assert.equal(selectedFields, "_id name email phone schoolName grade");
    assert.deepEqual(profile, {
        name: "Student A",
        email: "student@example.test",
        phone: "01000000000",
        schoolName: "School A",
        grade: "Grade 8",
    });
    assert.deepEqual(Object.keys(profile).sort(), [
        "email",
        "grade",
        "name",
        "phone",
        "schoolName",
    ]);
    assert.equal(JSON.stringify(profile).includes("Teacher-only note"), false);
    assert.equal(JSON.stringify(profile).includes(studentId.toString()), false);
});

test("client-supplied Student and Workspace IDs cannot override req.studentContext", async (t: TestContext) => {
    let capturedFilter: Record<string, unknown> | undefined;
    t.mock.method(
        StudentModel,
        "findOne",
        ((filter: Record<string, unknown>) => {
            capturedFilter = filter;
            return makeQuery(studentRecord);
        }) as never
    );
    const req = requestForContext(context, {
        studentId: otherStudentId.toString(),
        workspaceId: otherWorkspaceId.toString(),
    });
    const res = makeResponse();
    let nextError: unknown;

    await getStudentProfileController(req, res.response, ((error?: unknown) => {
        nextError = error;
    }) as NextFunction);

    assert.equal(nextError, undefined);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(capturedFilter, {
        _id: studentId.toString(),
        workspaceId: workspaceId.toString(),
        status: "active",
    });
    assert.deepEqual(
        (res.body as { data: unknown }).data,
        {
            name: "Student A",
            email: "student@example.test",
            phone: "01000000000",
            schoolName: "School A",
            grade: "Grade 8",
        }
    );
});

test("Student A cannot retrieve Student B Overview through client-supplied identifiers", async (t: TestContext) => {
    let studentFilter: Record<string, unknown> | undefined;
    t.mock.method(
        StudentModel,
        "findOne",
        ((filter: Record<string, unknown>) => {
            studentFilter = filter;
            return makeQuery(studentRecord);
        }) as never
    );
    t.mock.method(EnrollmentModel, "find", (() => makeQuery([])) as never);
    t.mock.method(StudyGroupModel, "find", (() => makeQuery([])) as never);
    t.mock.method(SessionModel, "countDocuments", (() => Promise.resolve(0)) as never);
    t.mock.method(SessionModel, "find", (() => makeQuery([])) as never);
    t.mock.method(AttendanceRecordModel, "countDocuments", (() => Promise.resolve(0)) as never);
    t.mock.method(AttendanceRecordModel, "find", (() => makeQuery([])) as never);

    const req = requestForContext(context, {
        studentId: otherStudentId.toString(),
        workspaceId: otherWorkspaceId.toString(),
    });
    const res = makeResponse();
    let nextError: unknown;
    await getStudentOverviewController(req, res.response, ((error?: unknown) => {
        nextError = error;
    }) as NextFunction);

    assert.equal(nextError, undefined);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(studentFilter, {
        _id: studentId.toString(),
        workspaceId: workspaceId.toString(),
        status: "active",
    });
});

test("inactive Student is denied with a generic student-access error", async (t: TestContext) => {
    t.mock.method(StudentModel, "findOne", (() => makeQuery(null)) as never);
    await assert.rejects(
        getStudentProfileService(context),
        (error: unknown) =>
            error instanceof NotFoundException &&
            error.message === "Student access not found"
    );
});

test("inactive Workspace is denied by Student Context middleware", async (t: TestContext) => {
    const result = await runStudentAccess(t, { workspace: null });
    assert.equal(result.nextError instanceof NotFoundException, true);
    assert.equal(
        (result.nextError as Error).message,
        "Student access not found"
    );
});

test("inactive, foreign, or missing StudentAccountLink context is denied", async (t: TestContext) => {
    const result = await runStudentAccess(t, {
        link: null,
        linkId: new Types.ObjectId().toString(),
    });
    assert.equal(result.nextError instanceof NotFoundException, true);
    assert.equal(
        (result.nextError as Error).message,
        "Student access not found"
    );

    const missingContext = await runStudentAccess(t, { includeHeader: false });
    assert.equal(missingContext.nextError instanceof NotFoundException, true);
});

test("invalid Student Context is rejected before resolving Student data", async (t: TestContext) => {
    const studentLookup = t.mock.method(
        StudentModel,
        "findOne",
        (() => makeQuery(studentRecord)) as never
    );
    const result = await runStudentAccess(t, {
        linkId: "not-an-object-id",
    });

    assert.equal(result.nextError instanceof NotFoundException, true);
    assert.equal(studentLookup.mock.callCount(), 0);
});
