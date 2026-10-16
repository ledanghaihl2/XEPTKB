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

export interface BottleneckStats {
  crossDaySwapsCount: number;
  crossDayConflictDensity: number; // Tỷ lệ % (0-100)
  totalAssignedSlots: number;
  highPressureTeachers: Array<{
    teacher: string;
    totalSessions: number;
    morningLoad: number;
    crossDayInvolvements: number;
    assignedClasses: string[];
    pressureScore: number;
  }>;
  suggestsAiIntervention: boolean;
}

export interface OptimizationMetrics {
  teacherGaps: number;
  initialGaps?: number;
  studentGaps: number;
  teacherCollisions?: number; // Số tiết trùng giáo viên (Mục tiêu bắt buộc = 0)
  optimizationTimeMs: number;
  bottleneckStats?: BottleneckStats;
}

export interface ScheduleResult {
  timetable: TimetableGrid;
  unassigned: InputRow[];
  success: boolean;
  metrics?: OptimizationMetrics;
}

export interface GenerateScheduleOptions {
  allowCrossDaySwapping?: boolean;
}

export enum ReportType {
  TEACHER = 'TEACHER',
  CLASS = 'CLASS',
  SUBJECT = 'SUBJECT'
}

export type ShiftType = 'ALL' | 'MORNING' | 'AFTERNOON';

export type ConstraintType = 'TEACHER_BUSY' | 'FIXED_SESSION' | 'CLASS_SHIFT' | 'TEACHER_SHIFT' | 'SCHOOL_SHIFT';

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
  morningPeriodCap?: number; // Số tiết tối đa mỗi buổi sáng (mặc định 5, có thể là 4 hoặc 5)
  afternoonPeriodCap?: number; // Số tiết tối đa mỗi buổi chiều (mặc định 3, có thể là 2, 3 hoặc 4)
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
  detectedTeachers?: string[];
  message?: string;
}

