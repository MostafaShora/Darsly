import assert from "node:assert/strict";
import type { NextFunction, Request, Response } from "express";
import { TestContext, test } from "node:test";
import { Types } from "mongoose";
import { getStudentGroupsController } from "../src/controllers/student-portal.controller";
import { requireStudentAccess } from "../src/middlewares/student-access.middleware";
import EnrollmentModel from "../src/models/enrollment.model";
import StudentAccountLinkModel from "../src/models/student-account-link.model";
import StudentModel from "../src/models/student.model";
import StudyGroupModel from "../src/models/study-group.model";
import SubjectModel from "../src/models/subject.model";
import UserModel from "../src/models/user.model";
import WorkspaceModel from "../src/models/workspace.model";
import { getStudentGroupsService } from "../src/services/student-portal.service";
import { NotFoundException } from "../src/utils/app-error";

const userId = new Types.ObjectId();
const studentId = new Types.ObjectId();
const workspaceId = new Types.ObjectId();
const linkId = new Types.ObjectId();
const groupId = new Types.ObjectId();
const subjectId = new Types.ObjectId();
const foreignStudentId = new Types.ObjectId();
const foreignWorkspaceId = new Types.ObjectId();

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
        then: (
            resolve: (result: T) => unknown,
            reject: (error: unknown) => unknown
        ) => Promise.resolve(value).then(resolve, reject),
    };
    return query;
};

const enrollment = {
    _id: new Types.ObjectId(),
    studentId,
    workspaceId,
    groupId,
    enrolledAt: new Date("2026-10-01T00:00:00.000Z"),
    status: "active",
    notes: "Private enrollment note",
};

const group = {
    _id: groupId,
    workspaceId,
    subjectId,
    name: "Algebra Group",
    description: "Internal group description",
    monthlyFee: Types.Decimal128.fromString("250"),
    capacity: 12,
    status: "active",
};

const subject = {
    _id: subjectId,
    workspaceId,
    name: "Mathematics",
    description: "Internal subject description",
    status: "active",
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

const runStudentAccess = async (
    t: TestContext,
    options: {
        link?: unknown;
        student?: unknown;
        workspace?: unknown;
        linkHeader?: string | null;
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
        (() =>
            makeQuery(
                options.student === undefined
                    ? { _id: studentId, workspaceId, name: "Student A" }
                    : options.student
            )) as never
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
        body: { studentId: foreignStudentId, workspaceId: foreignWorkspaceId },
        get: (name: string) =>
            name === "x-student-account-link"
                ? options.linkHeader === undefined
                    ? linkId.toString()
                    : options.linkHeader
                : undefined,
    } as unknown as Request;
    let nextError: unknown;
    await requireStudentAccess(req, {} as Response, ((error?: unknown) => {
        nextError = error;
    }) as NextFunction);
    return { req, nextError };
};

test("Student can retrieve their active groups with safe display data", async (t: TestContext) => {
    const filters: Record<string, Record<string, unknown>> = {};
    t.mock.method(
        EnrollmentModel,
        "find",
        ((filter: Record<string, unknown>) => {
            filters.enrollment = filter;
            return makeQuery([enrollment]);
        }) as never
    );
    t.mock.method(
        StudyGroupModel,
        "find",
        ((filter: Record<string, unknown>) => {
            filters.group = filter;
            return makeQuery([group]);
        }) as never
    );
    t.mock.method(
        SubjectModel,
        "find",
        ((filter: Record<string, unknown>) => {
            filters.subject = filter;
            return makeQuery([subject]);
        }) as never
    );

    const result = await getStudentGroupsService(context);

    assert.equal(filters.enrollment.workspaceId, workspaceId.toString());
    assert.equal(filters.enrollment.studentId, studentId.toString());
    assert.equal(filters.enrollment.status, "active");
    assert.ok(
        (filters.enrollment.enrolledAt as { $lte: Date }).$lte instanceof Date
    );
    assert.deepEqual(filters.group, {
        _id: { $in: [groupId] },
        workspaceId: workspaceId.toString(),
        status: "active",
    });
    assert.deepEqual(filters.subject, {
        _id: { $in: [subjectId] },
        workspaceId: workspaceId.toString(),
    });
    assert.deepEqual(result, [
        {
            name: "Algebra Group",
            subjectName: "Mathematics",
            enrolledAt: "2026-10-01T00:00:00.000Z",
            status: "active",
        },
    ]);
    assert.deepEqual(Object.keys(result[0]).sort(), [
        "enrolledAt",
        "name",
        "status",
        "subjectName",
    ]);
    assert.equal(JSON.stringify(result).includes("Private"), false);
    assert.equal(JSON.stringify(result).includes(groupId.toString()), false);
});

test("Student A cannot retrieve Student B or another Workspace's groups through client IDs", async (t: TestContext) => {
    let enrollmentFilter: Record<string, unknown> | undefined;
    t.mock.method(
        EnrollmentModel,
        "find",
        ((filter: Record<string, unknown>) => {
            enrollmentFilter = filter;
            return makeQuery([enrollment]);
        }) as never
    );
    t.mock.method(StudyGroupModel, "find", (() => makeQuery([group])) as never);
    t.mock.method(SubjectModel, "find", (() => makeQuery([subject])) as never);
    const req = {
        studentContext: context,
        body: {
            studentId: foreignStudentId.toString(),
            workspaceId: foreignWorkspaceId.toString(),
            userId: new Types.ObjectId().toString(),
        },
        query: {
            studentId: foreignStudentId.toString(),
            workspaceId: foreignWorkspaceId.toString(),
            userId: new Types.ObjectId().toString(),
        },
        params: {
            studentId: foreignStudentId.toString(),
            workspaceId: foreignWorkspaceId.toString(),
        },
    } as unknown as Request;
    const res = makeResponse();
    let nextError: unknown;

    await getStudentGroupsController(req, res.response, ((error?: unknown) => {
        nextError = error;
    }) as NextFunction);

    assert.equal(nextError, undefined);
    assert.equal(res.statusCode, 200);
    assert.equal(enrollmentFilter?.workspaceId, workspaceId.toString());
    assert.equal(enrollmentFilter?.studentId, studentId.toString());
    assert.equal(enrollmentFilter?.status, "active");
    assert.ok(
        (enrollmentFilter?.enrolledAt as { $lte: Date }).$lte instanceof Date
    );
    assert.deepEqual(res.body, {
        message: "Student groups retrieved successfully",
        data: [
            {
                name: "Algebra Group",
                subjectName: "Mathematics",
                enrolledAt: "2026-10-01T00:00:00.000Z",
                status: "active",
            },
        ],
    });
});

test("inactive enrollments are excluded before group lookup", async (t: TestContext) => {
    let capturedFilter: Record<string, unknown> | undefined;
    const groupLookup = t.mock.method(
        StudyGroupModel,
        "find",
        (() => makeQuery([group])) as never
    );
    t.mock.method(
        EnrollmentModel,
        "find",
        ((filter: Record<string, unknown>) => {
            capturedFilter = filter;
            return makeQuery([]);
        }) as never
    );

    assert.deepEqual(await getStudentGroupsService(context), []);
    assert.equal(capturedFilter?.status, "active");
    assert.deepEqual(capturedFilter?.studentId, studentId.toString());
    assert.deepEqual(capturedFilter?.workspaceId, workspaceId.toString());
    assert.equal(groupLookup.mock.callCount(), 0);
});

test("inactive groups are excluded by the Workspace-scoped group lookup", async (t: TestContext) => {
    let groupFilter: Record<string, unknown> | undefined;
    t.mock.method(
        EnrollmentModel,
        "find",
        (() => makeQuery([enrollment])) as never
    );
    t.mock.method(
        StudyGroupModel,
        "find",
        ((filter: Record<string, unknown>) => {
            groupFilter = filter;
            return makeQuery([]);
        }) as never
    );
    const subjectLookup = t.mock.method(
        SubjectModel,
        "find",
        (() => makeQuery([subject])) as never
    );

    assert.deepEqual(await getStudentGroupsService(context), []);
    assert.equal(groupFilter?.status, "active");
    assert.deepEqual(groupFilter?.workspaceId, workspaceId.toString());
    assert.equal(subjectLookup.mock.callCount(), 0);

});

test("empty enrollment results return the expected empty data array", async (t: TestContext) => {
    t.mock.method(EnrollmentModel, "find", (() => makeQuery([])) as never);
    const res = makeResponse();
    let nextError: unknown;
    const req = { studentContext: context } as unknown as Request;

    await getStudentGroupsController(req, res.response, ((error?: unknown) => {
        nextError = error;
    }) as NextFunction);

    assert.equal(nextError, undefined);
    assert.deepEqual(res.body, {
        message: "Student groups retrieved successfully",
        data: [],
    });
});

test("inactive Student is denied by Student Context middleware", async (t: TestContext) => {
    const result = await runStudentAccess(t, { student: null });
    assert.equal(result.nextError instanceof NotFoundException, true);
    assert.equal(
        (result.nextError as Error).message,
        "Student access not found"
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

test("foreign or inactive StudentAccountLink is rejected by ownership-scoped lookup", async (t: TestContext) => {
    let linkFilter: Record<string, unknown> | undefined;
    t.mock.method(
        UserModel,
        "findById",
        (async () => ({ _id: userId, status: "active", capabilities: ["student"] })) as never
    );
    t.mock.method(
        StudentAccountLinkModel,
        "findOne",
        ((filter: Record<string, unknown>) => {
            linkFilter = filter;
            return makeQuery(null);
        }) as never
    );
    const req = {
        user: { _id: userId },
        get: () => linkId.toString(),
    } as unknown as Request;
    let nextError: unknown;

    await requireStudentAccess(req, {} as Response, ((error?: unknown) => {
        nextError = error;
    }) as NextFunction);

    assert.equal(nextError instanceof NotFoundException, true);
    assert.deepEqual(linkFilter, {
        _id: linkId.toString(),
        userId: userId.toString(),
        status: "active",
    });
});

test("missing Student Context is rejected without querying Student data", async (t: TestContext) => {
    const result = await runStudentAccess(t, { linkHeader: null });
    assert.equal(result.nextError instanceof NotFoundException, true);
    assert.equal(
        (result.nextError as Error).message,
        "Student access not found"
    );
});

test("no teacher display name is returned when groups have no teacher assignment field", async (t: TestContext) => {
    t.mock.method(EnrollmentModel, "find", (() => makeQuery([enrollment])) as never);
    t.mock.method(StudyGroupModel, "find", (() => makeQuery([group])) as never);
    t.mock.method(SubjectModel, "find", (() => makeQuery([subject])) as never);

    const result = await getStudentGroupsService(context);

    assert.equal("teacherName" in result[0], false);
    assert.equal("workspaceId" in result[0], false);
    assert.equal("groupId" in result[0], false);
});
