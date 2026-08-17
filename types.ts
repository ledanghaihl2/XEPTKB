export interface InputRow {
  id: number;
  teacher: string;
  subject: string;
  className: string;
  sessionsPerWeek: number;
}

export interface ClassSession {
  day: number; // 0-4 (Mon-Fri)
  period: number; // 1-5
  subject: string;
  teacher: string;
}

export type TimetableGrid = {
  [className: string]: (ClassSession | null)[][]; // [Day][Period - 1]
};

export interface ScheduleResult {
  timetable: TimetableGrid;
  unassigned: InputRow[];
  success: boolean;
}

export enum ReportType {
  TEACHER = 'TEACHER',
  CLASS = 'CLASS',
  SUBJECT = 'SUBJECT'
}

export type ConstraintType = 'TEACHER_BUSY' | 'FIXED_SESSION';

export interface Constraint {
  id: string;
  type: ConstraintType;
  // For Teacher Busy
  teacher?: string;
  // For Fixed Session
  className?: string;
  subject?: string;
  
  day: number; // 0-based index
  period: number; // 0-based index
}

export interface TimetableVersion {
  id: string;
  name: string;
  createdAt: string;
  data: InputRow[];
  constraints: Constraint[];
  schedule: TimetableGrid;
  unassigned?: InputRow[];
}
