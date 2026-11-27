import AttendanceRecordModel, {
    AttendanceRecordDocument,
} from "../models/attendance-record.model";
import EnrollmentModel from "../models/enrollment.model";
import SessionModel, { SessionDocument } from "../models/session.model";
import StudentModel from "../models/student.model";
import StudyGroupModel from "../models/study-group.model";
import SubjectModel from "../models/subject.model";
import type { StudentAccessContext } from "./student-context.service";
import {
    StudentOverviewDto,
    StudentProfileDto,
    StudentPortalGroupDto,
    StudentPortalScheduleDto,
    StudentPortalScheduleSessionDto,
    toStudentProfileDto,
    toStudentRecentAttendanceDto,
} from "../dtos/student-portal.dto";
import { NotFoundException } from "../utils/app-error";
import { serializeDate } from "../utils/serialization";

const STUDENT_ACCESS_NOT_FOUND = "Student access not found";
const RECENT_ATTENDANCE_LIMIT = 5;
const MAX_STUDENT_SCHEDULE_SESSIONS = 100;

const getActiveStudent = async (
    context: StudentAccessContext,
    fields: string
) => {
    const student = await StudentModel.findOne({
        _id: context.studentId,
        workspaceId: context.workspaceId,
        status: "active",
    }).select(fields);

    if (!student) {
        throw new NotFoundException(STUDENT_ACCESS_NOT_FOUND);
    }

    return student;
};

export const getStudentProfileService = async (
    context: StudentAccessContext
): Promise<StudentProfileDto> => {
    const student = await getActiveStudent(
        context,
        "_id name email phone schoolName grade"
    );
    return toStudentProfileDto(student);
};

const getCurrentStudentGroups = async (
    context: StudentAccessContext,
    now: Date
) => {
    const workspaceId = context.workspaceId;
    const studentId = context.studentId;
    const enrollments = await EnrollmentModel.find({
        workspaceId,
        studentId,
        status: "active",
        enrolledAt: { $lte: now },
    })
        .select("groupId enrolledAt")
        .sort({ enrolledAt: -1, _id: 1 });

    if (enrollments.length === 0) {
        return { enrollments, groups: [] };
    }

    const groups = await StudyGroupModel.find({
        _id: { $in: enrollments.map((enrollment) => enrollment.groupId) },
        workspaceId,
        status: "active",
    })
        .select("_id name subjectId")
        .sort({ name: 1, _id: 1 });

    return { enrollments, groups };
};

export const getStudentGroupsService = async (
    context: StudentAccessContext
): Promise<StudentPortalGroupDto[]> => {
    const { enrollments, groups } = await getCurrentStudentGroups(
        context,
        new Date()
    );

    if (groups.length === 0) {
        return [];
    }

    const workspaceId = context.workspaceId;
    const subjects = await SubjectModel.find({
        _id: { $in: groups.map((group) => group.subjectId) },
        workspaceId,
    }).select("_id name");
    const subjectNameById = new Map(
        subjects.map((subject) => [subject._id.toString(), subject.name])
    );
    const enrollmentByGroupId = new Map(
        enrollments.map((enrollment) => [
            enrollment.groupId.toString(),
            enrollment,
        ])
    );

    return groups.flatMap((group) => {
        const enrollment = enrollmentByGroupId.get(group._id.toString());
        if (!enrollment) {
            return [];
        }

        return [
            {
                name: group.name,
                subjectName:
                    subjectNameById.get(group.subjectId.toString()) ?? null,
                enrolledAt: serializeDate(enrollment.enrolledAt),
                status: "active" as const,
            },
        ];
    });
};

export const getStudentScheduleService = async (
    context: StudentAccessContext
): Promise<StudentPortalScheduleDto> => {
    const now = new Date();
    const { enrollments, groups } = await getCurrentStudentGroups(context, now);
    if (groups.length === 0) {
        return { upcoming: [], past: [] };
    }

    const workspaceId = context.workspaceId;
    const groupIds = groups.map((group) => group._id);
    const groupById = new Map(
        groups.map((group) => [
            group._id.toString(),
            { name: group.name, subjectId: group.subjectId },
        ])
    );
    const pastSessionScopes = enrollments.map((enrollment) => ({
        groupId: enrollment.groupId,
        startsAt: { $gte: enrollment.enrolledAt, $lte: now },
    }));
    const [subjects, upcomingSessions, pastSessions] = await Promise.all([
        SubjectModel.find({
            _id: { $in: groups.map((group) => group.subjectId) },
            workspaceId,
        }).select("_id name"),
        SessionModel.find({
            workspaceId,
            groupId: { $in: groupIds },
            status: "scheduled",
            startsAt: { $gt: now },
        })
            .select("_id groupId title startsAt endsAt status")
            .sort({ startsAt: 1, _id: 1 })
            .limit(MAX_STUDENT_SCHEDULE_SESSIONS),
        SessionModel.find({
            workspaceId,
            $or: pastSessionScopes,
            status: { $in: ["scheduled", "completed"] },
        })
            .select("_id groupId title startsAt endsAt status")
            .sort({ startsAt: -1, _id: -1 })
            .limit(MAX_STUDENT_SCHEDULE_SESSIONS),
    ]);
    const subjectNameById = new Map(
        subjects.map((subject) => [subject._id.toString(), subject.name])
    );
    const toDto = (
        session: SessionDocument
    ): StudentPortalScheduleSessionDto | null => {
        const group = groupById.get(session.groupId.toString());
        if (!group || session.status === "cancelled") {
            return null;
        }

        return {
            title: session.title.trim() || null,
            startsAt: serializeDate(session.startsAt),
            endsAt: serializeDate(session.endsAt),
            status: session.status,
            groupName: group.name,
            subjectName: subjectNameById.get(group.subjectId.toString()) ?? null,
        };
    };

    const upcoming = upcomingSessions.flatMap((session) => {
        if (
            session.status !== "scheduled" ||
            session.startsAt.getTime() <= now.getTime()
        ) {
            return [];
        }
        const dto = toDto(session);
        return dto ? [dto] : [];
    });
    const past = pastSessions.flatMap((session) => {
        if (
            session.startsAt.getTime() > now.getTime() ||
            session.status === "cancelled"
        ) {
            return [];
        }
        const dto = toDto(session);
        return dto ? [dto] : [];
    });

    return { upcoming, past };
};

export const getStudentOverviewService = async (
    context: StudentAccessContext
): Promise<StudentOverviewDto> => {
    const student = await getActiveStudent(context, "_id name");
    const now = new Date();
    const workspaceId = context.workspaceId;
    const studentId = context.studentId;

    const enrollments = await EnrollmentModel.find({
        workspaceId,
        studentId,
        status: "active",
        enrolledAt: { $lte: now },
    }).select("groupId");
    const enrolledGroupIds = enrollments.map((enrollment) => enrollment.groupId);
    const groups = await StudyGroupModel.find({
        _id: { $in: enrolledGroupIds },
        workspaceId,
        status: "active",
    }).select("_id name");
    const groupNameById = new Map(
        groups.map((group) => [group._id.toString(), group.name])
    );
    const activeGroupIds = groups.map((group) => group._id);
    const sessionFilter = {
        workspaceId,
        groupId: { $in: activeGroupIds },
        status: "scheduled" as const,
        startsAt: { $gte: now },
    };
    const attendanceFilter = { workspaceId, studentId };
    const attendanceStatuses: AttendanceRecordDocument["status"][] = [
        "present",
        "absent",
        "late",
        "excused",
    ];

    const [
        upcomingSessionCount,
        upcomingSessions,
        attendanceCounts,
        recentAttendance,
    ] = await Promise.all([
        SessionModel.countDocuments(sessionFilter),
        SessionModel.find(sessionFilter)
            .select("_id title groupId startsAt")
            .sort({ startsAt: 1, _id: 1 })
            .limit(RECENT_ATTENDANCE_LIMIT),
        Promise.all(
            attendanceStatuses.map((status) =>
                AttendanceRecordModel.countDocuments({
                    ...attendanceFilter,
                    status,
                })
            )
        ),
        AttendanceRecordModel.find(attendanceFilter)
            .select("status recordedAt")
            .sort({ recordedAt: -1, _id: -1 })
            .limit(RECENT_ATTENDANCE_LIMIT),
    ]);

    const [present, absent, late, excused] = attendanceCounts;

    return {
        studentName: student.name,
        activeGroupCount: groups.length,
        upcomingSessionCount,
        upcomingSessions: upcomingSessions.map((session) => ({
            title: session.title,
            groupName: groupNameById.get(session.groupId.toString()) ?? "",
            startsAt: serializeDate(session.startsAt),
        })),
        attendanceSummary: {
            total: present + absent + late + excused,
            present,
            absent,
            late,
            excused,
        },
        recentAttendance: recentAttendance.map(toStudentRecentAttendanceDto),
    };
};
