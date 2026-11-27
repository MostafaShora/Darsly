export type StudentAttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

export interface StudentOverview {
  studentName: string;
  activeGroupCount: number;
  upcomingSessionCount: number;
  upcomingSessions: StudentUpcomingSession[];
  attendanceSummary: StudentAttendanceSummary;
  recentAttendance: StudentRecentAttendance[];
}

export interface StudentUpcomingSession {
  title: string;
  groupName: string;
  startsAt: string;
}

export interface StudentAttendanceSummary {
  total: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
}

export interface StudentRecentAttendance {
  status: StudentAttendanceStatus;
  recordedAt: string;
}

export interface StudentProfile {
  name: string;
  email: string | null;
  phone: string | null;
  schoolName: string | null;
  grade: string | null;
}

export interface StudentPortalGroup {
  name: string;
  subjectName: string | null;
  enrolledAt: string;
  status: 'active';
}

export interface StudentPortalScheduleSession {
  title: string | null;
  startsAt: string;
  endsAt: string;
  status: 'scheduled' | 'completed';
  groupName: string;
  subjectName: string | null;
}

export interface StudentPortalSchedule {
  upcoming: StudentPortalScheduleSession[];
  past: StudentPortalScheduleSession[];
}
