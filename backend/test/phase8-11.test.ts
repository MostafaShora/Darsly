import assert from "node:assert/strict";
import type { NextFunction, Request, Response } from "express";
import { TestContext, test } from "node:test";
import { Types } from "mongoose";
import { getStudentScheduleController } from "../src/controllers/student-portal.controller";
import { requireStudentAccess } from "../src/middlewares/student-access.middleware";
import EnrollmentModel from "../src/models/enrollment.model";
import SessionModel from "../src/models/session.model";
import StudentAccountLinkModel from "../src/models/student-account-link.model";
import StudyGroupModel from "../src/models/study-group.model";
import SubjectModel from "../src/models/subject.model";
import UserModel from "../src/models/user.model";
import { getStudentScheduleService } from "../src/services/student-portal.service";
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

const makeQuery = <T>(value: T, onSort?: (sort: unknown) => void) => {
    const query = {
        select: () => query,
        sort: (sort: unknown) => {
            onSort?.(sort);
            return query;
        },
        limit: () => query,
        then: (
            resolve: (result: T) => unknown,
            reject: (error: unknown) => unknown
        ) => Promise.resolve(value).then(resolve, reject),
    };
    return query;
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

test("Student schedule includes only eligible sessions and returns a safe ordered DTO", async (t: TestContext) => {
    const now = Date.now();
    const enrolledAt = new Date(now - 5 * 24 * 60 * 60 * 1000);
    const session = (
        title: string,
        offsetDays: number,
        status: "scheduled" | "completed" | "cancelled",
        notes: string
    ) => ({
        title,
        startsAt: new Date(now + offsetDays * 24 * 60 * 60 * 1000),
        endsAt: new Date(now + offsetDays * 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
        status,
        groupId,
        notes,
        workspaceId,
    });

    const sessionFilters: Record<string, unknown>[] = [];
    const sortOptions: unknown[] = [];
    let capturedEnrollmentFilter: Record<string, unknown> | undefined;
    t.mock.method(
        EnrollmentModel,
        "find",
        ((filter: Record<string, unknown>) => {
            capturedEnrollmentFilter = filter;
            return makeQuery([{ groupId, enrolledAt, endedAt: null, notes: "private" }]);
        }) as never
    );
    t.mock.method(
        StudyGroupModel,
        "find",
        ((filter: Record<string, unknown>) => {
            assert.deepEqual(filter, {
                _id: { $in: [groupId] },
                workspaceId: context.workspaceId,
                status: "active",
            });
            return makeQuery([
                {
                    _id: groupId,
                    workspaceId,
                    name: "Algebra",
                    subjectId,
                    description: "private group details",
                    monthlyFee: "100",
                },
            ]);
        }) as never
    );
    t.mock.method(SubjectModel, "find", (() =>
        makeQuery([{ _id: subjectId, name: "Mathematics" }])) as never);
    t.mock.method(
        SessionModel,
        "find",
        ((filter: Record<string, unknown>) => {
            sessionFilters.push(filter);
            return makeQuery(
                filter.status === "scheduled"
                    ? [
                          session("Sooner", 1, "scheduled", "teacher notes"),
                          session("Later", 3, "scheduled", "private"),
                          session("Cancelled upcoming", 2, "cancelled", "private"),
                          session("Completed future", 4, "completed", "private"),
                      ]
                    : [
                          session("Just passed", -1, "scheduled", "private"),
                          session("Completed earlier", -3, "completed", "private"),
                          session("Cancelled past", -2, "cancelled", "private"),
                      ],
                (sort) => sortOptions.push(sort)
            );
        }) as never
    );

    const req = {
        studentContext: context,
        body: { studentId: foreignStudentId, workspaceId: foreignWorkspaceId },
        query: { studentId: foreignStudentId, workspaceId: foreignWorkspaceId },
        params: { studentId: foreignStudentId, workspaceId: foreignWorkspaceId },
    } as unknown as Request;
    const res = makeResponse();
    let nextError: unknown;
    await getStudentScheduleController(req, res.response, ((error?: unknown) => {
        nextError = error;
    }) as NextFunction);

    assert.equal(nextError, undefined);
    assert.equal(res.statusCode, 200);
    assert.equal(capturedEnrollmentFilter?.workspaceId, context.workspaceId);
    assert.equal(capturedEnrollmentFilter?.studentId, context.studentId);
    assert.equal(capturedEnrollmentFilter?.status, "active");
    assert.ok(
        (capturedEnrollmentFilter?.enrolledAt as { $lte: Date }).$lte instanceof Date
    );
    assert.equal(sessionFilters[0].workspaceId, context.workspaceId);
    assert.deepEqual(sessionFilters[0].groupId, { $in: [groupId] });
    assert.equal(sessionFilters[0].status, "scheduled");
    assert.ok(
        (sessionFilters[0].startsAt as { $gt: Date }).$gt instanceof Date
    );
    assert.equal(sessionFilters[1].workspaceId, context.workspaceId);
    assert.deepEqual(sessionFilters[1].$or, [
        {
            groupId,
            startsAt: {
                $gte: enrolledAt,
                $lte: (sessionFilters[1].$or as Array<{ startsAt: { $lte: Date } }>)[0]
                    .startsAt.$lte,
            },
        },
    ]);
    assert.deepEqual(sessionFilters[1].status, { $in: ["scheduled", "completed"] });
    assert.ok(
        (sessionFilters[1].$or as Array<{ startsAt: { $lte: Date } }>)[0]
            .startsAt.$lte instanceof Date
    );
    assert.deepEqual(sortOptions, [
        { startsAt: 1, _id: 1 },
        { startsAt: -1, _id: -1 },
    ]);

    const data = (res.body as { data: { upcoming: unknown[]; past: unknown[] } }).data;
    assert.deepEqual(
        data.upcoming.map((item) => (item as { title: string }).title),
        ["Sooner", "Later"]
    );
    assert.deepEqual(
        data.past.map((item) => (item as { title: string }).title),
        ["Just passed", "Completed earlier"]
    );
    for (const item of [...data.upcoming, ...data.past]) {
        const sessionDto = item as Record<string, unknown>;
        assert.deepEqual(Object.keys(sessionDto).sort(), [
            "endsAt",
            "groupName",
            "startsAt",
            "status",
            "subjectName",
            "title",
        ]);
        assert.equal(typeof sessionDto.startsAt, "string");
        assert.equal(typeof sessionDto.endsAt, "string");
        assert.equal(
            new Date(sessionDto.startsAt as string).toISOString(),
            sessionDto.startsAt
        );
    }
    assert.equal(JSON.stringify(data).includes("private"), false);
    assert.equal(JSON.stringify(data).includes("teacher notes"), false);
    assert.equal(JSON.stringify(data).includes("workspaceId"), false);
    assert.equal(JSON.stringify(data).includes(groupId.toString()), false);
    assert.equal(
        (res.body as { message: string }).message,
        "Student schedule retrieved successfully"
    );
});

test("empty active enrollments return an empty upcoming and past schedule", async (t: TestContext) => {
    t.mock.method(EnrollmentModel, "find", (() => makeQuery([])) as never);
    const groupLookup = t.mock.method(
        StudyGroupModel,
        "find",
        (() => makeQuery([])) as never
    );

    assert.deepEqual(await getStudentScheduleService(context), {
        upcoming: [],
        past: [],
    });
    assert.equal(groupLookup.mock.callCount(), 0);
});

test("missing Student Context is rejected before resolving schedule access", async (t: TestContext) => {
    t.mock.method(
        UserModel,
        "findById",
        (async () => ({ _id: userId, status: "active", capabilities: ["student"] })) as never
    );
    t.mock.method(
        StudentAccountLinkModel,
        "findOne",
        (() => makeQuery(null)) as never
    );
    const req = {
        user: { _id: userId },
        get: () => undefined,
    } as unknown as Request;
    let nextError: unknown;

    await requireStudentAccess(req, {} as Response, ((error?: unknown) => {
        nextError = error;
    }) as NextFunction);

    assert.equal(nextError instanceof NotFoundException, true);
    assert.equal((nextError as Error).message, "Student access not found");
});
