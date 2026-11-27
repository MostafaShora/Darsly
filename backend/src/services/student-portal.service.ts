import AttendanceRecordModel, {
    AttendanceRecordDocument,
} from "../models/attendance-record.model";
import EnrollmentModel from "../models/enrollment.model";
import SessionModel from "../models/session.model";
import StudentModel from "../models/student.model";
import StudyGroupModel from "../models/study-group.model";
import SubjectModel from "../models/subject.model";
import type { StudentAccessContext } from "./student-context.service";
import {
    StudentOverviewDto,
    StudentProfileDto,
    StudentPortalGroupDto,
    toStudentProfileDto,
    toStudentRecentAttendanceDto,
} from "../dtos/student-portal.dto";
import { NotFoundException } from "../utils/app-error";
import { serializeDate } from "../utils/serialization";

const STUDENT_ACCESS_NOT_FOUND = "Student access not found";
const RECENT_ATTENDANCE_LIMIT = 5;

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

export const getStudentGroupsService = async (
    context: StudentAccessContext
): Promise<StudentPortalGroupDto[]> => {
    const now = new Date();
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
        return [];
    }

    const groups = await StudyGroupModel.find({
        _id: { $in: enrollments.map((enrollment) => enrollment.groupId) },
        workspaceId,
        status: "active",
    })
        .select("_id name subjectId")
        .sort({ name: 1, _id: 1 });

    if (groups.length === 0) {
        return [];
    }

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
