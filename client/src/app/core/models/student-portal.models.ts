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
