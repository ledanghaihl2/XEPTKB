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
  metrics?: {
    teacherGaps: number;
    initialGaps?: number;
    studentGaps: number;
    optimizationTimeMs: number;
  };
}

export enum ReportType {
  TEACHER = 'TEACHER',
  CLASS = 'CLASS',
  SUBJECT = 'SUBJECT'
}

export type ShiftType = 'ALL' | 'MORNING' | 'AFTERNOON';

export type ConstraintType = 'TEACHER_BUSY' | 'FIXED_SESSION' | 'CLASS_SHIFT' | 'TEACHER_SHIFT';

export interface Constraint {
  id: string;
  type: ConstraintType;
  // For Teacher Busy / Teacher Shift
  teacher?: string;
  // For Fixed Session / Class Shift
  className?: string;
  subject?: string;
  
  day?: number; // 0-based index
  period?: number; // 0-based index
  shift?: ShiftType; // 'ALL' | 'MORNING' | 'AFTERNOON'
  morningDays?: number[]; // Các thứ học/dạy buổi sáng: 0 (T2) -> 4 (T6)
  afternoonDays?: number[]; // Các thứ học/dạy buổi chiều: 0 (T2) -> 4 (T6)
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

export interface ExcelImportResult {
  mode: 'TIMETABLE_GRID' | 'ASSIGNMENT_LIST';
  schedule?: TimetableGrid;
  data: InputRow[];
  unassigned?: InputRow[];
  conflicts?: string[];
  detectedClasses?: string[];
  message?: string;
}

