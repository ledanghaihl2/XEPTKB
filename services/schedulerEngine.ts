import { InputRow, TimetableGrid, ScheduleResult, Constraint, ShiftType, ClassSession, GenerateScheduleOptions, BottleneckStats, OptimizationMetrics } from '../types';
import { DAYS, PERIODS, CLASSES, isValidSlot, isPeriodInShift } from '../constants';

// Nhóm các môn học trọng tâm (ưu tiên học vào các tiết sáng đầu buổi)
const CORE_SUBJECTS = new Set([
  'Toán', 'Ngữ văn', 'T Anh', 'Tiếng Anh',
  'KHTN-LÍ', 'KHTN-HÓA', 'KHTN-SINH', 'KHTN-sinh', 'KHTN'
]);

/**
 * Đánh giá chất lượng của bảng Thời khóa biểu:
 * - Số tiết trống của giáo viên (Teacher Gaps): khoảng cách chờ giữa các tiết dạy
 * - Số tiết lủng của học sinh (Student Gaps): lỗ hổng ở giữa buổi học
 */
export function evaluateScheduleQuality(grid: TimetableGrid, allTeachers: string[], classes?: string[]) {
  let teacherGaps = 0;
  let studentGaps = 0;
  const targetClasses = classes && classes.length > 0
    ? classes
    : (Object.keys(grid).length > 0 ? Object.keys(grid) : CLASSES);

  // 1. Tính số tiết trống của giáo viên
  allTeachers.forEach(teacher => {
    for (let d = 0; d < DAYS.length; d++) {
      // Buổi sáng: Tiết 0..4
      const mSlots: number[] = [];
      for (let p = 0; p < 5; p++) {
        let teaches = false;
        for (const cls of targetClasses) {
          if (grid[cls]?.[d]?.[p]?.teacher === teacher) {
            teaches = true;
            break;
          }
        }
        if (teaches) mSlots.push(p);
      }
      if (mSlots.length > 1) {
        const span = mSlots[mSlots.length - 1] - mSlots[0] + 1;
        teacherGaps += span - mSlots.length;
      }

      // Buổi chiều: Tiết 5..7
      const aSlots: number[] = [];
      for (let p = 5; p < 8; p++) {
        let teaches = false;
        for (const cls of targetClasses) {
          if (grid[cls]?.[d]?.[p]?.teacher === teacher) {
            teaches = true;
            break;
          }
        }
        if (teaches) aSlots.push(p);
      }
      if (aSlots.length > 1) {
        const span = aSlots[aSlots.length - 1] - aSlots[0] + 1;
        teacherGaps += span - aSlots.length;
      }
    }
  });

  // 2. Tính số tiết lủng & trống đầu ca của học sinh (Quy chuẩn Sư phạm)
  targetClasses.forEach(cls => {
    for (let d = 0; d < DAYS.length; d++) {
      const mSlots: number[] = [];
      for (let p = 0; p < 5; p++) {
        if (grid[cls]?.[d]?.[p]) mSlots.push(p);
      }
      if (mSlots.length > 0) {
        if (mSlots[0] > 0) {
          studentGaps += mSlots[0]; // Trống Tiết 1 sáng (phải bắt đầu từ 0)
        }
        const span = mSlots[mSlots.length - 1] - mSlots[0] + 1;
        studentGaps += span - mSlots.length; // Lủng giữa ca sáng
      }

      const aSlots: number[] = [];
      for (let p = 5; p < 8; p++) {
        if (grid[cls]?.[d]?.[p]) aSlots.push(p);
      }
      if (aSlots.length > 0) {
        if (aSlots[0] > 5) {
          studentGaps += aSlots[0] - 5; // Trống Tiết 1 chiều (phải bắt đầu từ 5)
        }
        const span = aSlots[aSlots.length - 1] - aSlots[0] + 1;
        studentGaps += span - aSlots.length; // Lủng giữa ca chiều
      }
    }
  });

  return { teacherGaps, studentGaps };
}

/**
 * Hàm phạt đa mục tiêu (Multi-objective Penalty Function):
 * Điểm phạt càng thấp thì Thời khóa biểu càng đẹp và tối ưu sư phạm.
 */
function calculatePenalty(grid: TimetableGrid, unplacedCount = 0, classes?: string[]): number {
  let penalty = unplacedCount * 100000;
  const targetClasses = classes && classes.length > 0
    ? classes
    : (Object.keys(grid).length > 0 ? Object.keys(grid) : CLASSES);

  const teacherSchedule: Record<string, Record<number, number[]>> = {};
  const allTeachers = new Set<string>();

  // 1. Kiểm tra phân bổ môn học từng lớp theo ngày
  targetClasses.forEach(cls => {
    for (let d = 0; d < DAYS.length; d++) {
      const daySubjects: Record<string, number[]> = {};

      for (let p = 0; p < PERIODS.length; p++) {
        const s = grid[cls]?.[d]?.[p];
        if (!s) continue;

        if (!daySubjects[s.subject]) daySubjects[s.subject] = [];
        daySubjects[s.subject].push(p);

        // Phạt nếu môn học nặng bị đẩy xuống buổi chiều
        if (p >= 5 && CORE_SUBJECTS.has(s.subject)) penalty += 20;

        // Phạt nếu môn GDTC bị xếp vào Tiết 1 sáng sớm
        if (p === 0 && s.subject === 'GDTC') penalty += 35;
      }

      // Đánh giá tiết đôi (Toán/Văn): Nếu học 2 tiết trong ngày mà liền nhau thì tốt, cách xa thì phạt
      Object.entries(daySubjects).forEach(([subj, periods]) => {
        if (periods.length === 2) {
          if (Math.abs(periods[1] - periods[0]) > 1) {
            penalty += 40; // 2 tiết cùng môn nhưng bị cách quãng
          }
        } else if (periods.length > 2) {
          penalty += (periods.length - 2) * 120; // Quá 2 tiết cùng môn trong 1 ngày
        }
      });

      // Phạt cực nặng nếu học sinh bị trống Tiết 1 sáng/chiều hoặc bị lủng tiết giữa buổi
      const mSlots: number[] = [];
      const aSlots: number[] = [];
      for (let p = 0; p < PERIODS.length; p++) {
        if (grid[cls]?.[d]?.[p]) {
          if (p < 5) mSlots.push(p);
          else aSlots.push(p);
        }
      }
      if (mSlots.length > 0) {
        if (mSlots[0] !== 0) {
          penalty += 5000 * mSlots[0]; // Phạt cực nặng nếu trống Tiết 1 sáng (bắt buộc bắt đầu từ slot 0)
        }
        const spanM = mSlots[mSlots.length - 1] - mSlots[0] + 1;
        if (spanM > mSlots.length) {
          penalty += (spanM - mSlots.length) * 5000; // Phạt cực nặng nếu lủng giữa ca sáng
        }
      }
      if (aSlots.length > 0) {
        if (aSlots[0] !== 5) {
          penalty += 5000 * (aSlots[0] - 5); // Phạt cực nặng nếu trống Tiết 1 chiều (bắt buộc bắt đầu từ slot 5)
        }
        const spanA = aSlots[aSlots.length - 1] - aSlots[0] + 1;
        if (spanA > aSlots.length) {
          penalty += (spanA - aSlots.length) * 5000; // Phạt cực nặng nếu lủng giữa ca chiều
        }
      }
    }
  });

  // 2. Thu thập lịch dạy giáo viên
  targetClasses.forEach(cls => {
    for (let d = 0; d < DAYS.length; d++) {
      for (let p = 0; p < PERIODS.length; p++) {
        const s = grid[cls]?.[d]?.[p];
        if (s && s.teacher && s.teacher !== 'Chưa phân công') {
          allTeachers.add(s.teacher);
          if (!teacherSchedule[s.teacher]) teacherSchedule[s.teacher] = {};
          if (!teacherSchedule[s.teacher][d]) teacherSchedule[s.teacher][d] = [];
          teacherSchedule[s.teacher][d].push(p);
        }
      }
    }
  });

  // 3. Phạt tiết trống & quá tải của giáo viên
  allTeachers.forEach(teacher => {
    const dailyCounts: number[] = [];

    for (let d = 0; d < DAYS.length; d++) {
      const slots = teacherSchedule[teacher]?.[d] || [];
      dailyCounts.push(slots.length);

      // Tiết trống buổi sáng
      const mSlots = slots.filter(p => p < 5).sort((a, b) => a - b);
      if (mSlots.length > 1) {
        const gap = (mSlots[mSlots.length - 1] - mSlots[0] + 1) - mSlots.length;
        penalty += gap * 60; // Phạt nặng tiết trống
      }
      if (mSlots.length > 4) {
        penalty += (mSlots.length - 4) * 80; // Phạt quá tải dạy liên tục > 4 tiết/buổi
      }

      // Tiết trống buổi chiều
      const aSlots = slots.filter(p => p >= 5).sort((a, b) => a - b);
      if (aSlots.length > 1) {
        const gap = (aSlots[aSlots.length - 1] - aSlots[0] + 1) - aSlots.length;
        penalty += gap * 60;
      }
    }

    // Phạt lệch lịch (ngày dạy quá nhiều, ngày không dạy tiết nào)
    const avg = dailyCounts.reduce((a, b) => a + b, 0) / DAYS.length;
    let variance = 0;
    dailyCounts.forEach(c => variance += (c - avg) ** 2);
    penalty += Math.sqrt(variance / DAYS.length) * 20;
  });

  return penalty;
}

/**
 * Kiểm tra xem lớp học có bị thủng lỗ tiết giữa buổi hoặc không bắt đầu từ tiết 1 không:
 * - Sáng (0..4): Nếu có học sáng, bắt buộc phải bắt đầu từ Tiết 1 sáng (p = 0) và học liên tục (0, 1, ..., N-1).
 * - Chiều (5..7): Nếu có học chiều, bắt buộc phải bắt đầu từ Tiết 1 chiều (p = 5) và học liên tục (5, 6, ..., 5+M-1).
 */
function checkClassHasGaps(grid: TimetableGrid, className: string, day: number): boolean {
  const mSlots: number[] = [];
  const aSlots: number[] = [];
  for (let p = 0; p < PERIODS.length; p++) {
    if (grid[className]?.[day]?.[p]) {
      if (p < 5) mSlots.push(p);
      else aSlots.push(p);
    }
  }

  // Buổi sáng: nếu có tiết thì bắt buộc phải bắt đầu từ tiết 0 và liên tục không có lỗ hổng
  if (mSlots.length > 0) {
    if (mSlots[0] !== 0) return true;
    if (mSlots[mSlots.length - 1] !== mSlots.length - 1) return true;
  }

  // Buổi chiều: nếu có tiết thì bắt buộc phải bắt đầu từ tiết 5 và liên tục không có lỗ hổng
  if (aSlots.length > 0) {
    if (aSlots[0] !== 5) return true;
    if (aSlots[aSlots.length - 1] !== 5 + aSlots.length - 1) return true;
  }

  return false;
}

/**
 * Kiểm tra xem giáo viên có bận ở slot (d, p) không (dạy ở lớp khác hoặc theo ràng buộc TEACHER_BUSY)
 */
function isTeacherBusyAt(
  grid: TimetableGrid,
  teacher: string,
  d: number,
  p: number,
  teacherBusySet: Set<string>,
  excludeClass: string | null = null,
  targetClasses?: string[]
): boolean {
  if (teacherBusySet.has(`${teacher}_${d}_${p}`)) return true;
  const classesToScan = targetClasses && targetClasses.length > 0
    ? targetClasses
    : (Object.keys(grid).length > 0 ? Object.keys(grid) : CLASSES);
  for (const cls of classesToScan) {
    if (cls === excludeClass) continue;
    if (grid[cls]?.[d]?.[p]?.teacher === teacher) return true;
  }
  return false;
}

export interface ClassShiftRule {
  morningDays?: number[];
  afternoonDays?: number[];
  morningPeriodCap?: number;
  afternoonPeriodCap?: number;
  shift?: ShiftType;
}

/**
 * Kiểm tra ô (d, p) có hợp lệ với lịch học ca/thứ của lớp không
 */
export function isSlotAllowedForClass(
  cls: string,
  d: number,
  p: number,
  classRuleMap?: Map<string, ClassShiftRule>
): boolean {
  if (!isValidSlot(d, p)) return false;
  if (!classRuleMap || !classRuleMap.has(cls)) return true;

  const rule = classRuleMap.get(cls)!;
  const isMorning = p < 5;

  // Nếu có cấu hình chi tiết theo từng thứ (morningDays / afternoonDays)
  if (rule.morningDays !== undefined || rule.afternoonDays !== undefined) {
    if (isMorning) {
      if (!rule.morningDays || !rule.morningDays.includes(d)) return false;
      const morningCap = rule.morningPeriodCap ?? 5;
      if (p >= morningCap) return false;
    } else {
      if (!rule.afternoonDays || !rule.afternoonDays.includes(d)) return false;
      const afternoonCap = rule.afternoonPeriodCap ?? 3;
      if ((p - 5) >= afternoonCap) return false;
    }
    return true;
  }

  // Tương thích ngược với ràng buộc ca học kiểu cũ (shift toàn tuần)
  if (rule.shift) {
    return isPeriodInShift(p, rule.shift);
  }

  return true;
}

/**
 * Xây dựng tập hợp các ô (teacher_d_p) bị bận của giáo viên từ danh sách ràng buộc
 */
export function buildTeacherBusySet(constraints: Constraint[]): Set<string> {
  const teacherBusySet = new Set<string>();
  constraints.forEach(c => {
    if (c.type === 'TEACHER_BUSY' && c.teacher) {
      if (c.day !== undefined && c.period !== undefined) {
        teacherBusySet.add(`${c.teacher}_${c.day}_${c.period}`);
      } else if (c.day !== undefined && c.shift) {
        for (let p = 0; p < PERIODS.length; p++) {
          if (isPeriodInShift(p, c.shift)) {
            teacherBusySet.add(`${c.teacher}_${c.day}_${p}`);
          }
        }
      }
    }
    if (c.type === 'TEACHER_SHIFT' && c.teacher) {
      if (c.morningDays !== undefined || c.afternoonDays !== undefined) {
        for (let d = 0; d < DAYS.length; d++) {
          for (let p = 0; p < PERIODS.length; p++) {
            const isMorning = p < 5;
            if (isMorning) {
              if (!c.morningDays || !c.morningDays.includes(d)) {
                teacherBusySet.add(`${c.teacher}_${d}_${p}`);
              }
            } else {
              if (!c.afternoonDays || !c.afternoonDays.includes(d)) {
                teacherBusySet.add(`${c.teacher}_${d}_${p}`);
              }
            }
          }
        }
      } else if (c.shift) {
        for (let d = 0; d < DAYS.length; d++) {
          for (let p = 0; p < PERIODS.length; p++) {
            if (!isPeriodInShift(p, c.shift)) {
              teacherBusySet.add(`${c.teacher}_${d}_${p}`);
            }
          }
        }
      }
    }
  });
  return teacherBusySet;
}

/**
 * Xây dựng bản đồ quy tắc ca/thứ học cho từng lớp từ danh sách ràng buộc
 */
export function buildClassRuleMap(constraints: Constraint[], classes?: string[]): Map<string, ClassShiftRule> {
  const classRuleMap = new Map<string, ClassShiftRule>();

  // 1. Áp dụng ràng buộc ca học TOÀN TRƯỜNG trước (nếu có SCHOOL_SHIFT hoặc CLASS_SHIFT cho ALL)
  const schoolShift = constraints.find(c => 
    c.type === 'SCHOOL_SHIFT' || 
    (c.type === 'CLASS_SHIFT' && (!c.className || c.className === 'ALL' || c.className === 'TOAN_TRUONG'))
  );
  if (schoolShift) {
    const targetClasses = classes && classes.length > 0 ? classes : CLASSES;
    targetClasses.forEach(cls => {
      classRuleMap.set(cls, {
        morningDays: schoolShift.morningDays,
        afternoonDays: schoolShift.afternoonDays,
        morningPeriodCap: schoolShift.morningPeriodCap,
        afternoonPeriodCap: schoolShift.afternoonPeriodCap,
        shift: schoolShift.shift
      });
    });
  }

  // 1.5. Đọc định mức theo khối từ localStorage (nếu có) để dự phòng cho từng lớp
  let gradeCapsMap: Record<string, { morningCap: number; afternoonCap: number }> = {};
  try {
    const savedGradeCaps = typeof localStorage !== 'undefined' ? localStorage.getItem('tkb_grade_period_caps') : null;
    if (savedGradeCaps) {
      gradeCapsMap = JSON.parse(savedGradeCaps);
    }
  } catch (e) {
    // ignore
  }

  if (Object.keys(gradeCapsMap).length > 0) {
    const targetClasses = classes && classes.length > 0 ? classes : CLASSES;
    targetClasses.forEach(cls => {
      const match = cls.match(/^(\d+)/);
      const gr = match ? match[1] : '';
      if (gr && gradeCapsMap[gr]) {
        const existing = classRuleMap.get(cls);
        if (existing) {
          existing.morningPeriodCap = gradeCapsMap[gr].morningCap;
          existing.afternoonPeriodCap = gradeCapsMap[gr].afternoonCap;
        } else {
          classRuleMap.set(cls, {
            morningPeriodCap: gradeCapsMap[gr].morningCap,
            afternoonPeriodCap: gradeCapsMap[gr].afternoonCap
          });
        }
      }
    });
  }

  // 2. Ràng buộc cụ thể của từng lớp (sẽ ghi đè ràng buộc toàn trường nếu có lớp cá biệt)
  constraints.forEach(c => {
    if (c.type === 'CLASS_SHIFT' && c.className && c.className !== 'ALL' && c.className !== 'TOAN_TRUONG') {
      const existing = classRuleMap.get(c.className);
      classRuleMap.set(c.className, {
        morningDays: c.morningDays,
        afternoonDays: c.afternoonDays,
        morningPeriodCap: c.morningPeriodCap ?? existing?.morningPeriodCap,
        afternoonPeriodCap: c.afternoonPeriodCap ?? existing?.afternoonPeriodCap,
        shift: c.shift
      });
    }
  });

  return classRuleMap;
}

function getPermutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const current = arr[i];
    const remaining = arr.slice(0, i).concat(arr.slice(i + 1));
    const remainingPerms = getPermutations(remaining);
    for (const perm of remainingPerms) {
      result.push([current, ...perm]);
    }
  }
  return result;
}

function findValidPermutation(
  grid: TimetableGrid,
  cls: string,
  d: number,
  sessions: ClassSession[],
  targetPeriods: number[],
  teacherBusySet: Set<string>,
  fixedSlots: Set<string>,
  classRuleMap?: Map<string, ClassShiftRule>
): ClassSession[] | null {
  const perms = getPermutations(sessions);

  for (const perm of perms) {
    let valid = true;
    for (let i = 0; i < perm.length; i++) {
      const s = perm[i];
      const targetP = targetPeriods[i];

      // 1. Ô hợp lệ của trường
      if (!isValidSlot(d, targetP)) { valid = false; break; }

      // 2. Ràng buộc ca học của lớp
      if (!isSlotAllowedForClass(cls, d, targetP, classRuleMap)) { valid = false; break; }

      // 3. Ô cố định của môn khác
      if (fixedSlots.has(`${cls}_${d}_${targetP}`)) {
        const currentSlotItem = grid[cls]?.[d]?.[targetP];
        if (!currentSlotItem || currentSlotItem.subject !== s.subject) {
          valid = false;
          break;
        }
      }

      // 4. GDTC không học tiết 4 sáng hoặc tiết 3 chiều
      if (s.subject === 'GDTC' && (targetP === 4 || targetP === 7)) { valid = false; break; }

      // 5. Giáo viên có bận ở lớp khác không (loại trừ cls vì các tiết của cls đang được dồn lại cùng nhau)
      if (isTeacherBusyAt(grid, s.teacher, d, targetP, teacherBusySet, cls)) {
        valid = false;
        break;
      }
    }
    if (valid) return perm;
  }

  return null;
}

/**
 * Đo lường số tiết trống của 1 giáo viên trong toàn bộ thời khóa biểu
 */
function calculateTeacherGaps(grid: TimetableGrid, teacher: string, targetClasses: string[]): number {
  let teacherGaps = 0;
  for (let d = 0; d < DAYS.length; d++) {
    const mSlots: number[] = [];
    for (let p = 0; p < 5; p++) {
      let teaches = false;
      for (const cls of targetClasses) {
        if (grid[cls]?.[d]?.[p]?.teacher === teacher) {
          teaches = true;
          break;
        }
      }
      if (teaches) mSlots.push(p);
    }
    if (mSlots.length > 1) {
      const span = mSlots[mSlots.length - 1] - mSlots[0] + 1;
      teacherGaps += span - mSlots.length;
    }

    const aSlots: number[] = [];
    for (let p = 5; p < 8; p++) {
      let teaches = false;
      for (const cls of targetClasses) {
        if (grid[cls]?.[d]?.[p]?.teacher === teacher) {
          teaches = true;
          break;
        }
      }
      if (teaches) aSlots.push(p);
    }
    if (aSlots.length > 1) {
      const span = aSlots[aSlots.length - 1] - aSlots[0] + 1;
      teacherGaps += span - aSlots.length;
    }
  }
  return teacherGaps;
}

interface PairingChainStep {
  className: string;
  targetPeriod: number;
  swapPeriod: number;
  teacherFrom: string;
  teacherTo: string;
  sessionAtTarget: ClassSession;
  sessionAtSwap: ClassSession;
}

/**
 * Thuật toán tìm chuỗi ghép cặp giáo viên luân chuyển đa lớp (Teacher Pairing Chain Search):
 * Sử dụng Backtracking DFS để tìm chuỗi dời lịch gồm 2 đến 4 giáo viên đồng thời nhằm giải phóng slot targetPeriod.
 */
function findTeacherPairingChain(
  grid: TimetableGrid,
  targetClasses: string[],
  teacherBusySet: Set<string>,
  fixedSlots: Set<string>,
  d: number,
  targetPeriod: number,
  initiatorClass: string,
  sourcePeriod: number,
  maxDepth = 4
): PairingChainStep[] | null {
  const session0 = grid[initiatorClass]?.[d]?.[sourcePeriod];
  if (!session0) return null;
  const T0 = session0.teacher;

  // Nếu T0 bị bận cứng trong teacherBusySet tại targetPeriod thì không thể dời về đây
  if (teacherBusySet.has(`${T0}_${d}_${targetPeriod}`)) return null;

  // Tạm thời gỡ session0 ra khỏi initiatorClass tại sourcePeriod để DFS thấy T0 rảnh tại sourcePeriod
  const savedInitiatorSession = grid[initiatorClass][d][sourcePeriod];
  grid[initiatorClass][d][sourcePeriod] = null;

  function searchChain(
    currentTeacher: string,
    currentDepth: number,
    visitedClasses: Set<string>,
    chainSteps: PairingChainStep[]
  ): PairingChainStep[] | null {
    if (currentDepth > maxDepth) return null;

    // Tìm lớp đang dùng currentTeacher tại targetPeriod (ngoại trừ các lớp đã tham gia chuỗi)
    let blockingClass: string | null = null;
    for (const cls of targetClasses) {
      if (visitedClasses.has(cls)) continue;
      if (grid[cls]?.[d]?.[targetPeriod]?.teacher === currentTeacher) {
        blockingClass = cls;
        break;
      }
    }

    // Nếu không có lớp nào chặn currentTeacher tại targetPeriod: tìm thấy điểm kết thúc chuỗi thành công!
    if (!blockingClass) {
      return chainSteps;
    }

    if (fixedSlots.has(`${blockingClass}_${d}_${targetPeriod}`)) return null;

    const isMorning = targetPeriod < 5;
    const startP = isMorning ? 0 : 5;
    const endP = isMorning ? 5 : 8;

    for (let p_k = startP; p_k < endP; p_k++) {
      if (p_k === targetPeriod) continue;
      if (fixedSlots.has(`${blockingClass}_${d}_${p_k}`)) continue;

      const sessionAtPk = grid[blockingClass]?.[d]?.[p_k];
      if (!sessionAtPk) continue; // Phải có tiết hiện hữu để hoán đổi

      const nextTeacher = sessionAtPk.teacher;
      if (nextTeacher === currentTeacher) continue;

      // Kiểm tra currentTeacher có rảnh ở p_k không
      const tFreeAtPk = !isTeacherBusyAt(grid, currentTeacher, d, p_k, teacherBusySet, blockingClass, targetClasses);
      if (!tFreeAtPk) continue;

      // Kiểm tra nextTeacher có bị bận cứng ở targetPeriod không
      if (teacherBusySet.has(`${nextTeacher}_${d}_${targetPeriod}`)) continue;

      const step: PairingChainStep = {
        className: blockingClass,
        targetPeriod,
        swapPeriod: p_k,
        teacherFrom: currentTeacher,
        teacherTo: nextTeacher,
        sessionAtTarget: grid[blockingClass][d][targetPeriod]!,
        sessionAtSwap: sessionAtPk
      };

      // TENTATIVE SWAP trong DFS để các bước sau nhìn thấy trạng thái thực tế
      grid[blockingClass][d][targetPeriod] = step.sessionAtSwap;
      grid[blockingClass][d][p_k] = step.sessionAtTarget;

      const nextVisited = new Set(visitedClasses);
      nextVisited.add(blockingClass);

      const result = searchChain(
        nextTeacher,
        currentDepth + 1,
        nextVisited,
        [...chainSteps, step]
      );

      // BACKTRACK / REVERT
      grid[blockingClass][d][targetPeriod] = step.sessionAtTarget;
      grid[blockingClass][d][p_k] = step.sessionAtSwap;

      if (result) return result;
    }

    return null;
  }

  const initialVisited = new Set([initiatorClass]);
  const finalChain = searchChain(T0, 1, initialVisited, []);

  // Khôi phục lại session0 cho initiatorClass
  grid[initiatorClass][d][sourcePeriod] = savedInitiatorSession;

  return finalChain;
}

/**
 * Mạng lưới hoán đổi ghép cặp giáo viên thông minh (Teacher Pairing Swapping Network):
 * Khi trường có quy mô lớn (> 40 lớp), nếu có lớp khó dồn về Tiết 1, hệ thống sử dụng mạng lưới
 * hoán đổi đa lớp (Multi-class cycle chain) để luân chuyển lịch của 2-4 giáo viên đồng thời nhằm
 * giải phóng ô Tiết 1 nhanh nhất mà không tăng số tiết trống của bất kỳ thầy cô nào (Pareto Optimal).
 */
function applyTeacherPairingSwappingNetwork(
  grid: TimetableGrid,
  targetClasses: string[],
  teacherBusySet: Set<string>,
  fixedSlots: Set<string>,
  maxPasses = 5
): number {
  let totalChainsApplied = 0;

  for (let pass = 0; pass < maxPasses; pass++) {
    let passProgress = false;

    for (const cls of targetClasses) {
      for (let d = 0; d < DAYS.length; d++) {
        // --- 1. XỬ LÝ CA SÁNG (Tiết 0..4, mục tiêu: Tiết 1 = slot 0) ---
        const morningSlots: number[] = [];
        for (let p = 0; p < 5; p++) {
          if (grid[cls]?.[d]?.[p]) morningSlots.push(p);
        }

        if (morningSlots.length > 0 && morningSlots[0] > 0) {
          const targetP = 0;
          for (let i = morningSlots.length - 1; i >= 0; i--) {
            const srcP = morningSlots[i];
            if (fixedSlots.has(`${cls}_${d}_${srcP}`)) continue;

            const chain = findTeacherPairingChain(
              grid,
              targetClasses,
              teacherBusySet,
              fixedSlots,
              d,
              targetP,
              cls,
              srcP,
              4
            );

            if (chain && chain.length > 0) {
              const involvedTeachers = new Set<string>();
              for (let p = 0; p < 5; p++) {
                const s = grid[cls]?.[d]?.[p];
                if (s) involvedTeachers.add(s.teacher);
              }
              chain.forEach(step => {
                involvedTeachers.add(step.teacherFrom);
                involvedTeachers.add(step.teacherTo);
              });

              const gapsBefore: Record<string, number> = {};
              involvedTeachers.forEach(t => {
                gapsBefore[t] = calculateTeacherGaps(grid, t, targetClasses);
              });

              const backup: Record<string, (ClassSession | null)[]> = {};
              backup[cls] = [...grid[cls][d]];
              for (const step of chain) {
                backup[step.className] = [...grid[step.className][d]];
              }

              // Áp dụng thử nghiệm
              for (const step of chain) {
                grid[step.className][d][step.targetPeriod] = {
                  ...step.sessionAtSwap,
                  day: d,
                  period: step.targetPeriod
                };
                grid[step.className][d][step.swapPeriod] = {
                  ...step.sessionAtTarget,
                  day: d,
                  period: step.swapPeriod
                };
              }

              const movingSession = grid[cls][d][srcP]!;
              grid[cls][d][srcP] = null;
              grid[cls][d][targetP] = { ...movingSession, day: d, period: targetP };

              // Dồn trượt liên tục các tiết sáng còn lại của cls từ slot 0
              const remainingMorning: ClassSession[] = [];
              for (let p = 0; p < 5; p++) {
                const sess = grid[cls][d][p];
                if (sess) remainingMorning.push(sess);
              }
              for (let p = 0; p < 5; p++) grid[cls][d][p] = null;
              remainingMorning.forEach((sess, idx) => {
                grid[cls][d][idx] = { ...sess, day: d, period: idx };
              });

              // Kiểm tra toàn diện & điều kiện Pareto
              let paretoValid = true;

              // Không trùng lịch giáo viên
              for (const t of involvedTeachers) {
                for (let p = 0; p < 5; p++) {
                  let count = 0;
                  for (const c of targetClasses) {
                    if (grid[c]?.[d]?.[p]?.teacher === t) count++;
                  }
                  if (count > 1 || teacherBusySet.has(`${t}_${d}_${p}`)) {
                    paretoValid = false;
                    break;
                  }
                }
                if (!paretoValid) break;
              }

              // Không vi phạm fixedSlots
              if (paretoValid) {
                for (let p = 0; p < 5; p++) {
                  if (fixedSlots.has(`${cls}_${d}_${p}`)) {
                    const currentSess = grid[cls][d][p];
                    const origSess = backup[cls][p];
                    if (!currentSess || !origSess || currentSess.subject !== origSess.subject) {
                      paretoValid = false;
                      break;
                    }
                  }
                }
              }

              // Không tăng số tiết trống của bất kỳ thầy cô nào
              if (paretoValid) {
                for (const t of involvedTeachers) {
                  const gapsAfter = calculateTeacherGaps(grid, t, targetClasses);
                  if (gapsAfter > gapsBefore[t]) {
                    paretoValid = false;
                    break;
                  }
                }
              }

              // Không để lại tiết lủng học sinh
              if (paretoValid) {
                if (checkClassHasGaps(grid, cls, d)) paretoValid = false;
                for (const step of chain) {
                  if (checkClassHasGaps(grid, step.className, d)) {
                    paretoValid = false;
                    break;
                  }
                }
              }

              // GDTC không nằm ở tiết 4
              if (paretoValid) {
                if (grid[cls][d][4]?.subject === 'GDTC') paretoValid = false;
                for (const step of chain) {
                  if (grid[step.className][d][4]?.subject === 'GDTC') {
                    paretoValid = false;
                    break;
                  }
                }
              }

              if (paretoValid) {
                totalChainsApplied++;
                passProgress = true;
                break;
              } else {
                for (const cName of Object.keys(backup)) {
                  grid[cName][d] = backup[cName];
                }
              }
            }
          }
        }

        // --- 2. XỬ LÝ CA CHIỀU (Tiết 5..7, mục tiêu: Tiết 1 = slot 5) ---
        const afternoonSlots: number[] = [];
        for (let p = 5; p < 8; p++) {
          if (grid[cls]?.[d]?.[p]) afternoonSlots.push(p);
        }

        if (afternoonSlots.length > 0 && afternoonSlots[0] > 5) {
          const targetP = 5;
          for (let i = afternoonSlots.length - 1; i >= 0; i--) {
            const srcP = afternoonSlots[i];
            if (fixedSlots.has(`${cls}_${d}_${srcP}`)) continue;

            const chain = findTeacherPairingChain(
              grid,
              targetClasses,
              teacherBusySet,
              fixedSlots,
              d,
              targetP,
              cls,
              srcP,
              4
            );

            if (chain && chain.length > 0) {
              const involvedTeachers = new Set<string>();
              for (let p = 5; p < 8; p++) {
                const s = grid[cls]?.[d]?.[p];
                if (s) involvedTeachers.add(s.teacher);
              }
              chain.forEach(step => {
                involvedTeachers.add(step.teacherFrom);
                involvedTeachers.add(step.teacherTo);
              });

              const gapsBefore: Record<string, number> = {};
              involvedTeachers.forEach(t => {
                gapsBefore[t] = calculateTeacherGaps(grid, t, targetClasses);
              });

              const backup: Record<string, (ClassSession | null)[]> = {};
              backup[cls] = [...grid[cls][d]];
              for (const step of chain) {
                backup[step.className] = [...grid[step.className][d]];
              }

              for (const step of chain) {
                grid[step.className][d][step.targetPeriod] = {
                  ...step.sessionAtSwap,
                  day: d,
                  period: step.targetPeriod
                };
                grid[step.className][d][step.swapPeriod] = {
                  ...step.sessionAtTarget,
                  day: d,
                  period: step.swapPeriod
                };
              }

              const movingSession = grid[cls][d][srcP]!;
              grid[cls][d][srcP] = null;
              grid[cls][d][targetP] = { ...movingSession, day: d, period: targetP };

              const remainingAfternoon: ClassSession[] = [];
              for (let p = 5; p < 8; p++) {
                const sess = grid[cls][d][p];
                if (sess) remainingAfternoon.push(sess);
              }
              for (let p = 5; p < 8; p++) grid[cls][d][p] = null;
              remainingAfternoon.forEach((sess, idx) => {
                grid[cls][d][5 + idx] = { ...sess, day: d, period: 5 + idx };
              });

              let paretoValid = true;

              for (const t of involvedTeachers) {
                for (let p = 5; p < 8; p++) {
                  let count = 0;
                  for (const c of targetClasses) {
                    if (grid[c]?.[d]?.[p]?.teacher === t) count++;
                  }
                  if (count > 1 || teacherBusySet.has(`${t}_${d}_${p}`)) {
                    paretoValid = false;
                    break;
                  }
                }
                if (!paretoValid) break;
              }

              if (paretoValid) {
                for (let p = 5; p < 8; p++) {
                  if (fixedSlots.has(`${cls}_${d}_${p}`)) {
                    const currentSess = grid[cls][d][p];
                    const origSess = backup[cls][p];
                    if (!currentSess || !origSess || currentSess.subject !== origSess.subject) {
                      paretoValid = false;
                      break;
                    }
                  }
                }
              }

              if (paretoValid) {
                for (const t of involvedTeachers) {
                  const gapsAfter = calculateTeacherGaps(grid, t, targetClasses);
                  if (gapsAfter > gapsBefore[t]) {
                    paretoValid = false;
                    break;
                  }
                }
              }

              if (paretoValid) {
                if (checkClassHasGaps(grid, cls, d)) paretoValid = false;
                for (const step of chain) {
                  if (checkClassHasGaps(grid, step.className, d)) {
                    paretoValid = false;
                    break;
                  }
                }
              }

              if (paretoValid) {
                if (grid[cls][d][7]?.subject === 'GDTC') paretoValid = false;
                for (const step of chain) {
                  if (grid[step.className][d][7]?.subject === 'GDTC') {
                    paretoValid = false;
                    break;
                  }
                }
              }

              if (paretoValid) {
                totalChainsApplied++;
                passProgress = true;
                break;
              } else {
                for (const cName of Object.keys(backup)) {
                  grid[cName][d] = backup[cName];
                }
              }
            }
          }
        }
      }
    }

    if (!passProgress) break;
  }

  return totalChainsApplied;
}

/**
 * Mạng lưới hoán đổi liên ngày (Cross-day Teacher Swapping Network):
 * Kích hoạt khi các bước dồn tiết và hoán đổi nội bộ trong ngày bị bế tắc do giáo viên bận kín lịch.
 * Luân chuyển tiết giữa ngày d1 và ngày d2 khác trong tuần theo 2 kênh:
 * - Kênh 1: Hoán đổi liên ngày của Lớp Chặn (Blocking Class Cross-day Swap)
 * - Kênh 2: Hoán đổi liên ngày nội bộ lớp khởi tạo (Initiator Class Cross-day Swap)
 * Đảm bảo: Cùng ca học, không vượt số tiết môn/ngày, không tăng tiết trống giáo viên (Pareto), không lủng tiết học sinh.
 */
function applyCrossDaySwappingNetwork(
  grid: TimetableGrid,
  targetClasses: string[],
  teacherBusySet: Set<string>,
  fixedSlots: Set<string>,
  classRuleMap?: Map<string, ClassShiftRule>,
  involvedTeachersTracker?: Map<string, number>
): number {
  let totalCrossDayApplied = 0;

  for (const cls of targetClasses) {
    for (let d1 = 0; d1 < DAYS.length; d1++) {
      // --- 1. XỬ LÝ CA SÁNG (Tiết 0..4, mục tiêu: Tiết 1 = slot 0) ---
      const morningSlots: number[] = [];
      for (let p = 0; p < 5; p++) {
        if (grid[cls]?.[d1]?.[p]) morningSlots.push(p);
      }

      if (morningSlots.length > 0 && morningSlots[0] > 0) {
        const targetP = 0;
        let solved = false;

        for (let i = morningSlots.length - 1; i >= 0 && !solved; i--) {
          const srcP = morningSlots[i];
          if (fixedSlots.has(`${cls}_${d1}_${srcP}`)) continue;

          const session0 = grid[cls][d1][srcP];
          if (!session0) continue;
          const T0 = session0.teacher;

          if (teacherBusySet.has(`${T0}_${d1}_${targetP}`)) continue;

          // Tìm lớp blockingClass đang dùng T0 tại (d1, targetP)
          let blockingClass: string | null = null;
          for (const other of targetClasses) {
            if (other === cls) continue;
            if (grid[other]?.[d1]?.[targetP]?.teacher === T0) {
              blockingClass = other;
              break;
            }
          }

          // === KÊNH 1: Hoán đổi liên ngày của Lớp Chặn blockingClass ===
          if (blockingClass && !fixedSlots.has(`${blockingClass}_${d1}_${targetP}`)) {
            const sessionBlock = grid[blockingClass][d1][targetP]!;

            for (let d2 = 0; d2 < DAYS.length && !solved; d2++) {
              if (d2 === d1) continue;

              for (let p2 = 0; p2 < 5 && !solved; p2++) {
                if (fixedSlots.has(`${blockingClass}_${d2}_${p2}`)) continue;
                const sessionD2 = grid[blockingClass]?.[d2]?.[p2];
                if (!sessionD2) continue;

                const T2 = sessionD2.teacher;
                if (T2 === T0) continue;

                // Ràng buộc ca học của lớp blockingClass
                if (!isSlotAllowedForClass(blockingClass, d1, targetP, classRuleMap)) continue;
                if (!isSlotAllowedForClass(blockingClass, d2, p2, classRuleMap)) continue;

                // Kiểm tra T2 rảnh ở (d1, targetP)
                if (isTeacherBusyAt(grid, T2, d1, targetP, teacherBusySet, blockingClass, targetClasses)) continue;

                // Kiểm tra T0 rảnh ở (d2, p2)
                if (isTeacherBusyAt(grid, T0, d2, p2, teacherBusySet, blockingClass, targetClasses)) continue;

                // Kiểm tra số tiết môn trong ngày của blockingClass
                let countD1 = 0;
                for (let p = 0; p < PERIODS.length; p++) {
                  if (p === targetP) continue;
                  if (grid[blockingClass][d1][p]?.subject === sessionD2.subject) countD1++;
                }
                const maxD1 = (sessionD2.subject === 'Toán' || sessionD2.subject === 'Ngữ văn') ? 2 : 1;
                if (countD1 >= maxD1) continue;

                let countD2 = 0;
                for (let p = 0; p < PERIODS.length; p++) {
                  if (p === p2) continue;
                  if (grid[blockingClass][d2][p]?.subject === sessionBlock.subject) countD2++;
                }
                const maxD2 = (sessionBlock.subject === 'Toán' || sessionBlock.subject === 'Ngữ văn') ? 2 : 1;
                if (countD2 >= maxD2) continue;

                if (sessionD2.subject === 'GDTC' && targetP === 4) continue;
                if (sessionBlock.subject === 'GDTC' && p2 === 4) continue;

                const backup: Record<string, (ClassSession | null)[]> = {
                  [`${cls}_${d1}`]: [...grid[cls][d1]],
                  [`${blockingClass}_${d1}`]: [...grid[blockingClass][d1]],
                  [`${blockingClass}_${d2}`]: [...grid[blockingClass][d2]]
                };

                const involvedTeachers = new Set<string>([T0, T2]);
                for (let p = 0; p < 5; p++) {
                  const s = grid[cls]?.[d1]?.[p];
                  if (s) involvedTeachers.add(s.teacher);
                }

                const gapsBefore: Record<string, number> = {};
                involvedTeachers.forEach(t => {
                  gapsBefore[t] = calculateTeacherGaps(grid, t, targetClasses);
                });

                // Thực hiện thử nghiệm
                grid[blockingClass][d1][targetP] = { ...sessionD2, day: d1, period: targetP };
                grid[blockingClass][d2][p2] = { ...sessionBlock, day: d2, period: p2 };

                const movingSess = grid[cls][d1][srcP]!;
                grid[cls][d1][srcP] = null;
                grid[cls][d1][targetP] = { ...movingSess, day: d1, period: targetP };

                const remMorning: ClassSession[] = [];
                for (let p = 0; p < 5; p++) {
                  const sess = grid[cls][d1][p];
                  if (sess) remMorning.push(sess);
                }
                for (let p = 0; p < 5; p++) grid[cls][d1][p] = null;
                remMorning.forEach((sess, idx) => {
                  grid[cls][d1][idx] = { ...sess, day: d1, period: idx };
                });

                let paretoValid = true;

                // Kiểm tra trùng lịch giáo viên
                for (const t of involvedTeachers) {
                  for (let p = 0; p < 5; p++) {
                    let c1 = 0;
                    for (const c of targetClasses) {
                      if (grid[c]?.[d1]?.[p]?.teacher === t) c1++;
                    }
                    if (c1 > 1 || (c1 > 0 && teacherBusySet.has(`${t}_${d1}_${p}`))) {
                      paretoValid = false;
                      break;
                    }

                    let c2 = 0;
                    for (const c of targetClasses) {
                      if (grid[c]?.[d2]?.[p]?.teacher === t) c2++;
                    }
                    if (c2 > 1 || (c2 > 0 && teacherBusySet.has(`${t}_${d2}_${p}`))) {
                      paretoValid = false;
                      break;
                    }
                  }
                  if (!paretoValid) break;

                  const gapsAfter = calculateTeacherGaps(grid, t, targetClasses);
                  if (gapsAfter > gapsBefore[t]) {
                    paretoValid = false;
                    break;
                  }
                }

                if (paretoValid) {
                  if (checkClassHasGaps(grid, cls, d1)) paretoValid = false;
                  if (checkClassHasGaps(grid, blockingClass, d1)) paretoValid = false;
                  if (checkClassHasGaps(grid, blockingClass, d2)) paretoValid = false;
                }

                if (paretoValid) {
                  totalCrossDayApplied++;
                  if (involvedTeachersTracker) {
                    involvedTeachers.forEach(t => {
                      involvedTeachersTracker.set(t, (involvedTeachersTracker.get(t) || 0) + 1);
                    });
                  }
                  solved = true;
                  break;
                } else {
                  grid[cls][d1] = backup[`${cls}_${d1}`];
                  grid[blockingClass][d1] = backup[`${blockingClass}_${d1}`];
                  grid[blockingClass][d2] = backup[`${blockingClass}_${d2}`];
                }
              }
            }
          }

          // === KÊNH 2: Hoán đổi liên ngày nội bộ lớp cls ===
          if (!solved) {
            for (let d2 = 0; d2 < DAYS.length && !solved; d2++) {
              if (d2 === d1) continue;

              for (let p2 = 0; p2 < 5 && !solved; p2++) {
                if (fixedSlots.has(`${cls}_${d2}_${p2}`)) continue;
                const sessionD2 = grid[cls]?.[d2]?.[p2];
                if (!sessionD2) continue;

                const T2 = sessionD2.teacher;

                if (!isSlotAllowedForClass(cls, d1, targetP, classRuleMap)) continue;
                if (!isSlotAllowedForClass(cls, d2, p2, classRuleMap)) continue;

                // T2 phải rảnh ở (d1, targetP)
                if (isTeacherBusyAt(grid, T2, d1, targetP, teacherBusySet, cls, targetClasses)) continue;

                // T0 phải rảnh ở (d2, p2)
                if (isTeacherBusyAt(grid, T0, d2, p2, teacherBusySet, cls, targetClasses)) continue;

                let countD1 = 0;
                for (let p = 0; p < PERIODS.length; p++) {
                  if (p === srcP) continue;
                  if (grid[cls][d1][p]?.subject === sessionD2.subject) countD1++;
                }
                const maxD1 = (sessionD2.subject === 'Toán' || sessionD2.subject === 'Ngữ văn') ? 2 : 1;
                if (countD1 >= maxD1) continue;

                let countD2 = 0;
                for (let p = 0; p < PERIODS.length; p++) {
                  if (p === p2) continue;
                  if (grid[cls][d2][p]?.subject === session0.subject) countD2++;
                }
                const maxD2 = (session0.subject === 'Toán' || session0.subject === 'Ngữ văn') ? 2 : 1;
                if (countD2 >= maxD2) continue;

                if (sessionD2.subject === 'GDTC' && targetP === 4) continue;
                if (session0.subject === 'GDTC' && p2 === 4) continue;

                const backup: Record<string, (ClassSession | null)[]> = {
                  [`${cls}_${d1}`]: [...grid[cls][d1]],
                  [`${cls}_${d2}`]: [...grid[cls][d2]]
                };

                const involvedTeachers = new Set<string>([T0, T2]);
                for (let p = 0; p < 5; p++) {
                  const s1 = grid[cls]?.[d1]?.[p];
                  if (s1) involvedTeachers.add(s1.teacher);
                  const s2 = grid[cls]?.[d2]?.[p];
                  if (s2) involvedTeachers.add(s2.teacher);
                }

                const gapsBefore: Record<string, number> = {};
                involvedTeachers.forEach(t => {
                  gapsBefore[t] = calculateTeacherGaps(grid, t, targetClasses);
                });

                grid[cls][d1][srcP] = null;
                grid[cls][d1][targetP] = { ...sessionD2, day: d1, period: targetP };
                grid[cls][d2][p2] = { ...session0, day: d2, period: p2 };

                const remMorningD1: ClassSession[] = [];
                for (let p = 0; p < 5; p++) {
                  const sess = grid[cls][d1][p];
                  if (sess) remMorningD1.push(sess);
                }
                for (let p = 0; p < 5; p++) grid[cls][d1][p] = null;
                remMorningD1.forEach((sess, idx) => {
                  grid[cls][d1][idx] = { ...sess, day: d1, period: idx };
                });

                const remMorningD2: ClassSession[] = [];
                for (let p = 0; p < 5; p++) {
                  const sess = grid[cls][d2][p];
                  if (sess) remMorningD2.push(sess);
                }
                for (let p = 0; p < 5; p++) grid[cls][d2][p] = null;
                remMorningD2.forEach((sess, idx) => {
                  grid[cls][d2][idx] = { ...sess, day: d2, period: idx };
                });

                let paretoValid = true;

                for (const t of involvedTeachers) {
                  for (let p = 0; p < 5; p++) {
                    let c1 = 0;
                    for (const c of targetClasses) {
                      if (grid[c]?.[d1]?.[p]?.teacher === t) c1++;
                    }
                    if (c1 > 1 || (c1 > 0 && teacherBusySet.has(`${t}_${d1}_${p}`))) {
                      paretoValid = false;
                      break;
                    }

                    let c2 = 0;
                    for (const c of targetClasses) {
                      if (grid[c]?.[d2]?.[p]?.teacher === t) c2++;
                    }
                    if (c2 > 1 || (c2 > 0 && teacherBusySet.has(`${t}_${d2}_${p}`))) {
                      paretoValid = false;
                      break;
                    }
                  }
                  if (!paretoValid) break;

                  const gapsAfter = calculateTeacherGaps(grid, t, targetClasses);
                  if (gapsAfter > gapsBefore[t]) {
                    paretoValid = false;
                    break;
                  }
                }

                if (paretoValid) {
                  if (checkClassHasGaps(grid, cls, d1) || checkClassHasGaps(grid, cls, d2)) {
                    paretoValid = false;
                  }
                }

                if (paretoValid) {
                  totalCrossDayApplied++;
                  if (involvedTeachersTracker) {
                    involvedTeachers.forEach(t => {
                      involvedTeachersTracker.set(t, (involvedTeachersTracker.get(t) || 0) + 1);
                    });
                  }
                  solved = true;
                  break;
                } else {
                  grid[cls][d1] = backup[`${cls}_${d1}`];
                  grid[cls][d2] = backup[`${cls}_${d2}`];
                }
              }
            }
          }
        }
      }

      // --- 2. XỬ LÝ CA CHIỀU (Tiết 5..7, mục tiêu: Tiết 1 = slot 5) ---
      const afternoonSlots: number[] = [];
      for (let p = 5; p < 8; p++) {
        if (grid[cls]?.[d1]?.[p]) afternoonSlots.push(p);
      }

      if (afternoonSlots.length > 0 && afternoonSlots[0] > 5) {
        const targetP = 5;
        let solved = false;

        for (let i = afternoonSlots.length - 1; i >= 0 && !solved; i--) {
          const srcP = afternoonSlots[i];
          if (fixedSlots.has(`${cls}_${d1}_${srcP}`)) continue;

          const session0 = grid[cls][d1][srcP];
          if (!session0) continue;
          const T0 = session0.teacher;

          if (teacherBusySet.has(`${T0}_${d1}_${targetP}`)) continue;

          let blockingClass: string | null = null;
          for (const other of targetClasses) {
            if (other === cls) continue;
            if (grid[other]?.[d1]?.[targetP]?.teacher === T0) {
              blockingClass = other;
              break;
            }
          }

          if (blockingClass && !fixedSlots.has(`${blockingClass}_${d1}_${targetP}`)) {
            const sessionBlock = grid[blockingClass][d1][targetP]!;

            for (let d2 = 0; d2 < DAYS.length && !solved; d2++) {
              if (d2 === d1) continue;

              for (let p2 = 5; p2 < 8 && !solved; p2++) {
                if (fixedSlots.has(`${blockingClass}_${d2}_${p2}`)) continue;
                const sessionD2 = grid[blockingClass]?.[d2]?.[p2];
                if (!sessionD2) continue;

                const T2 = sessionD2.teacher;
                if (T2 === T0) continue;

                if (!isSlotAllowedForClass(blockingClass, d1, targetP, classRuleMap)) continue;
                if (!isSlotAllowedForClass(blockingClass, d2, p2, classRuleMap)) continue;

                if (isTeacherBusyAt(grid, T2, d1, targetP, teacherBusySet, blockingClass, targetClasses)) continue;
                if (isTeacherBusyAt(grid, T0, d2, p2, teacherBusySet, blockingClass, targetClasses)) continue;

                let countD1 = 0;
                for (let p = 0; p < PERIODS.length; p++) {
                  if (p === targetP) continue;
                  if (grid[blockingClass][d1][p]?.subject === sessionD2.subject) countD1++;
                }
                const maxD1 = (sessionD2.subject === 'Toán' || sessionD2.subject === 'Ngữ văn') ? 2 : 1;
                if (countD1 >= maxD1) continue;

                let countD2 = 0;
                for (let p = 0; p < PERIODS.length; p++) {
                  if (p === p2) continue;
                  if (grid[blockingClass][d2][p]?.subject === sessionBlock.subject) countD2++;
                }
                const maxD2 = (sessionBlock.subject === 'Toán' || sessionBlock.subject === 'Ngữ văn') ? 2 : 1;
                if (countD2 >= maxD2) continue;

                if (sessionD2.subject === 'GDTC' && targetP === 7) continue;
                if (sessionBlock.subject === 'GDTC' && p2 === 7) continue;

                const backup: Record<string, (ClassSession | null)[]> = {
                  [`${cls}_${d1}`]: [...grid[cls][d1]],
                  [`${blockingClass}_${d1}`]: [...grid[blockingClass][d1]],
                  [`${blockingClass}_${d2}`]: [...grid[blockingClass][d2]]
                };

                const involvedTeachers = new Set<string>([T0, T2]);
                for (let p = 5; p < 8; p++) {
                  const s = grid[cls]?.[d1]?.[p];
                  if (s) involvedTeachers.add(s.teacher);
                }

                const gapsBefore: Record<string, number> = {};
                involvedTeachers.forEach(t => {
                  gapsBefore[t] = calculateTeacherGaps(grid, t, targetClasses);
                });

                grid[blockingClass][d1][targetP] = { ...sessionD2, day: d1, period: targetP };
                grid[blockingClass][d2][p2] = { ...sessionBlock, day: d2, period: p2 };

                const movingSess = grid[cls][d1][srcP]!;
                grid[cls][d1][srcP] = null;
                grid[cls][d1][targetP] = { ...movingSess, day: d1, period: targetP };

                const remAfternoon: ClassSession[] = [];
                for (let p = 5; p < 8; p++) {
                  const sess = grid[cls][d1][p];
                  if (sess) remAfternoon.push(sess);
                }
                for (let p = 5; p < 8; p++) grid[cls][d1][p] = null;
                remAfternoon.forEach((sess, idx) => {
                  grid[cls][d1][5 + idx] = { ...sess, day: d1, period: 5 + idx };
                });

                let paretoValid = true;

                for (const t of involvedTeachers) {
                  for (let p = 5; p < 8; p++) {
                    let c1 = 0;
                    for (const c of targetClasses) {
                      if (grid[c]?.[d1]?.[p]?.teacher === t) c1++;
                    }
                    if (c1 > 1 || (c1 > 0 && teacherBusySet.has(`${t}_${d1}_${p}`))) {
                      paretoValid = false;
                      break;
                    }

                    let c2 = 0;
                    for (const c of targetClasses) {
                      if (grid[c]?.[d2]?.[p]?.teacher === t) c2++;
                    }
                    if (c2 > 1 || (c2 > 0 && teacherBusySet.has(`${t}_${d2}_${p}`))) {
                      paretoValid = false;
                      break;
                    }
                  }
                  if (!paretoValid) break;

                  const gapsAfter = calculateTeacherGaps(grid, t, targetClasses);
                  if (gapsAfter > gapsBefore[t]) {
                    paretoValid = false;
                    break;
                  }
                }

                if (paretoValid) {
                  if (checkClassHasGaps(grid, cls, d1)) paretoValid = false;
                  if (checkClassHasGaps(grid, blockingClass, d1)) paretoValid = false;
                  if (checkClassHasGaps(grid, blockingClass, d2)) paretoValid = false;
                }

                if (paretoValid) {
                  totalCrossDayApplied++;
                  if (involvedTeachersTracker) {
                    involvedTeachers.forEach(t => {
                      involvedTeachersTracker.set(t, (involvedTeachersTracker.get(t) || 0) + 1);
                    });
                  }
                  solved = true;
                  break;
                } else {
                  grid[cls][d1] = backup[`${cls}_${d1}`];
                  grid[blockingClass][d1] = backup[`${blockingClass}_${d1}`];
                  grid[blockingClass][d2] = backup[`${blockingClass}_${d2}`];
                }
              }
            }
          }

          if (!solved) {
            for (let d2 = 0; d2 < DAYS.length && !solved; d2++) {
              if (d2 === d1) continue;

              for (let p2 = 5; p2 < 8 && !solved; p2++) {
                if (fixedSlots.has(`${cls}_${d2}_${p2}`)) continue;
                const sessionD2 = grid[cls]?.[d2]?.[p2];
                if (!sessionD2) continue;

                const T2 = sessionD2.teacher;

                if (!isSlotAllowedForClass(cls, d1, targetP, classRuleMap)) continue;
                if (!isSlotAllowedForClass(cls, d2, p2, classRuleMap)) continue;

                if (isTeacherBusyAt(grid, T2, d1, targetP, teacherBusySet, cls, targetClasses)) continue;
                if (isTeacherBusyAt(grid, T0, d2, p2, teacherBusySet, cls, targetClasses)) continue;

                let countD1 = 0;
                for (let p = 0; p < PERIODS.length; p++) {
                  if (p === srcP) continue;
                  if (grid[cls][d1][p]?.subject === sessionD2.subject) countD1++;
                }
                const maxD1 = (sessionD2.subject === 'Toán' || sessionD2.subject === 'Ngữ văn') ? 2 : 1;
                if (countD1 >= maxD1) continue;

                let countD2 = 0;
                for (let p = 0; p < PERIODS.length; p++) {
                  if (p === p2) continue;
                  if (grid[cls][d2][p]?.subject === session0.subject) countD2++;
                }
                const maxD2 = (session0.subject === 'Toán' || session0.subject === 'Ngữ văn') ? 2 : 1;
                if (countD2 >= maxD2) continue;

                if (sessionD2.subject === 'GDTC' && targetP === 7) continue;
                if (session0.subject === 'GDTC' && p2 === 7) continue;

                const backup: Record<string, (ClassSession | null)[]> = {
                  [`${cls}_${d1}`]: [...grid[cls][d1]],
                  [`${cls}_${d2}`]: [...grid[cls][d2]]
                };

                const involvedTeachers = new Set<string>([T0, T2]);
                for (let p = 5; p < 8; p++) {
                  const s1 = grid[cls]?.[d1]?.[p];
                  if (s1) involvedTeachers.add(s1.teacher);
                  const s2 = grid[cls]?.[d2]?.[p];
                  if (s2) involvedTeachers.add(s2.teacher);
                }

                const gapsBefore: Record<string, number> = {};
                involvedTeachers.forEach(t => {
                  gapsBefore[t] = calculateTeacherGaps(grid, t, targetClasses);
                });

                grid[cls][d1][srcP] = null;
                grid[cls][d1][targetP] = { ...sessionD2, day: d1, period: targetP };
                grid[cls][d2][p2] = { ...session0, day: d2, period: p2 };

                const remAfternoonD1: ClassSession[] = [];
                for (let p = 5; p < 8; p++) {
                  const sess = grid[cls][d1][p];
                  if (sess) remAfternoonD1.push(sess);
                }
                for (let p = 5; p < 8; p++) grid[cls][d1][p] = null;
                remAfternoonD1.forEach((sess, idx) => {
                  grid[cls][d1][5 + idx] = { ...sess, day: d1, period: 5 + idx };
                });

                const remAfternoonD2: ClassSession[] = [];
                for (let p = 5; p < 8; p++) {
                  const sess = grid[cls][d2][p];
                  if (sess) remAfternoonD2.push(sess);
                }
                for (let p = 5; p < 8; p++) grid[cls][d2][p] = null;
                remAfternoonD2.forEach((sess, idx) => {
                  grid[cls][d2][5 + idx] = { ...sess, day: d2, period: 5 + idx };
                });

                let paretoValid = true;

                for (const t of involvedTeachers) {
                  for (let p = 5; p < 8; p++) {
                    let c1 = 0;
                    for (const c of targetClasses) {
                      if (grid[c]?.[d1]?.[p]?.teacher === t) c1++;
                    }
                    if (c1 > 1 || (c1 > 0 && teacherBusySet.has(`${t}_${d1}_${p}`))) {
                      paretoValid = false;
                      break;
                    }

                    let c2 = 0;
                    for (const c of targetClasses) {
                      if (grid[c]?.[d2]?.[p]?.teacher === t) c2++;
                    }
                    if (c2 > 1 || (c2 > 0 && teacherBusySet.has(`${t}_${d2}_${p}`))) {
                      paretoValid = false;
                      break;
                    }
                  }
                  if (!paretoValid) break;

                  const gapsAfter = calculateTeacherGaps(grid, t, targetClasses);
                  if (gapsAfter > gapsBefore[t]) {
                    paretoValid = false;
                    break;
                  }
                }

                if (paretoValid) {
                  if (checkClassHasGaps(grid, cls, d1) || checkClassHasGaps(grid, cls, d2)) {
                    paretoValid = false;
                  }
                }

                if (paretoValid) {
                  totalCrossDayApplied++;
                  if (involvedTeachersTracker) {
                    involvedTeachers.forEach(t => {
                      involvedTeachersTracker.set(t, (involvedTeachersTracker.get(t) || 0) + 1);
                    });
                  }
                  solved = true;
                  break;
                } else {
                  grid[cls][d1] = backup[`${cls}_${d1}`];
                  grid[cls][d2] = backup[`${cls}_${d2}`];
                }
              }
            }
          }
        }
      }
    }
  }

  return totalCrossDayApplied;
}

/**
 * Bộ dồn tiết và vá lỗ hổng (Gap Compaction & Healer Engine):
 * Đảm bảo mọi ca học của lớp luôn bắt đầu từ Tiết 1 (slot 0 sáng hoặc slot 5 chiều)
 * và không có bất kỳ tiết lủng nào ở giữa.
 * Kết hợp hoán vị đơn lớp, Mạng lưới ghép cặp trong ngày, và Tùy chọn hoán đổi liên ngày khi kẹt cứng.
 */
function compactAndHealClassGaps(
  grid: TimetableGrid,
  teacherBusySet: Set<string>,
  fixedSlots: Set<string>,
  classRuleMap?: Map<string, ClassShiftRule>,
  targetClasses?: string[],
  allowCrossDaySwapping = false,
  crossDayTracker?: Map<string, number>
): number {
  const classesToRun = targetClasses && targetClasses.length > 0
    ? targetClasses
    : (Object.keys(grid).length > 0 ? Object.keys(grid) : CLASSES);

  // VÒNG 1: Dồn tiết nội bộ đơn lớp bằng hoán vị tối ưu
  for (const cls of classesToRun) {
    for (let d = 0; d < DAYS.length; d++) {
      // 1. Dồn ca sáng (0..4) về các ô 0, 1, ..., N-1
      const morningSlots: number[] = [];
      for (let p = 0; p < 5; p++) {
        if (grid[cls]?.[d]?.[p]) morningSlots.push(p);
      }
      if (morningSlots.length > 0 && morningSlots.length < 5) {
        const isAlreadyCompacted = morningSlots[0] === 0 && morningSlots[morningSlots.length - 1] === morningSlots.length - 1;
        if (!isAlreadyCompacted) {
          const sessions = morningSlots.map(p => grid[cls][d][p]!);
          const targetPeriods = Array.from({ length: sessions.length }, (_, i) => i);
          const permResult = findValidPermutation(
            grid, cls, d, sessions, targetPeriods, teacherBusySet, fixedSlots, classRuleMap
          );
          if (permResult) {
            morningSlots.forEach(p => { grid[cls][d][p] = null; });
            permResult.forEach((sess, idx) => {
              const targetP = targetPeriods[idx];
              grid[cls][d][targetP] = { ...sess, day: d, period: targetP };
            });
          }
        }
      }

      // 2. Dồn ca chiều (5..7) về các ô 5, 6, ..., 5+M-1
      const afternoonSlots: number[] = [];
      for (let p = 5; p < 8; p++) {
        if (grid[cls]?.[d]?.[p]) afternoonSlots.push(p);
      }
      if (afternoonSlots.length > 0 && afternoonSlots.length < 3) {
        const isAlreadyCompacted = afternoonSlots[0] === 5 && afternoonSlots[afternoonSlots.length - 1] === 5 + afternoonSlots.length - 1;
        if (!isAlreadyCompacted) {
          const sessions = afternoonSlots.map(p => grid[cls][d][p]!);
          const targetPeriods = Array.from({ length: sessions.length }, (_, i) => 5 + i);
          const permResult = findValidPermutation(
            grid, cls, d, sessions, targetPeriods, teacherBusySet, fixedSlots, classRuleMap
          );
          if (permResult) {
            afternoonSlots.forEach(p => { grid[cls][d][p] = null; });
            permResult.forEach((sess, idx) => {
              const targetP = targetPeriods[idx];
              grid[cls][d][targetP] = { ...sess, day: d, period: targetP };
            });
          }
        }
      }
    }
  }

  // VÒNG 2: Mạng lưới hoán đổi ghép cặp giáo viên thông minh đa lớp trong ngày (Intra-day Teacher Pairing Swapping Network)
  applyTeacherPairingSwappingNetwork(grid, classesToRun, teacherBusySet, fixedSlots, 5);

  // VÒNG 3: Hoán đổi liên ngày khi kẹt cứng (Cross-day Teacher Swapping Network)
  let totalCrossDaySwaps = 0;
  if (allowCrossDaySwapping) {
    totalCrossDaySwaps = applyCrossDaySwappingNetwork(grid, classesToRun, teacherBusySet, fixedSlots, classRuleMap, crossDayTracker);
  }

  // VÒNG 4: Dồn bổ sung cho các lớp nếu các vị trí mới đã được giải phóng
  for (const cls of classesToRun) {
    for (let d = 0; d < DAYS.length; d++) {
      const morningSlots: number[] = [];
      for (let p = 0; p < 5; p++) {
        if (grid[cls]?.[d]?.[p]) morningSlots.push(p);
      }
      if (morningSlots.length > 0 && morningSlots.length < 5) {
        const isAlreadyCompacted = morningSlots[0] === 0 && morningSlots[morningSlots.length - 1] === morningSlots.length - 1;
        if (!isAlreadyCompacted) {
          const sessions = morningSlots.map(p => grid[cls][d][p]!);
          const targetPeriods = Array.from({ length: sessions.length }, (_, i) => i);
          const permResult = findValidPermutation(
            grid, cls, d, sessions, targetPeriods, teacherBusySet, fixedSlots, classRuleMap
          );
          if (permResult) {
            morningSlots.forEach(p => { grid[cls][d][p] = null; });
            permResult.forEach((sess, idx) => {
              const targetP = targetPeriods[idx];
              grid[cls][d][targetP] = { ...sess, day: d, period: targetP };
            });
          }
        }
      }

      const afternoonSlots: number[] = [];
      for (let p = 5; p < 8; p++) {
        if (grid[cls]?.[d]?.[p]) afternoonSlots.push(p);
      }
      if (afternoonSlots.length > 0 && afternoonSlots.length < 3) {
        const isAlreadyCompacted = afternoonSlots[0] === 5 && afternoonSlots[afternoonSlots.length - 1] === 5 + afternoonSlots.length - 1;
        if (!isAlreadyCompacted) {
          const sessions = afternoonSlots.map(p => grid[cls][d][p]!);
          const targetPeriods = Array.from({ length: sessions.length }, (_, i) => 5 + i);
          const permResult = findValidPermutation(
            grid, cls, d, sessions, targetPeriods, teacherBusySet, fixedSlots, classRuleMap
          );
          if (permResult) {
            afternoonSlots.forEach(p => { grid[cls][d][p] = null; });
            permResult.forEach((sess, idx) => {
              const targetP = targetPeriods[idx];
              grid[cls][d][targetP] = { ...sess, day: d, period: targetP };
            });
          }
        }
      }
    }
  }

  return totalCrossDaySwaps;
}

/**
 * Kiểm tra một tiết học có thể đặt vào slot (d, p) của lớp cls không
 */
function canPlaceInSlot(
  grid: TimetableGrid,
  cls: string,
  d: number,
  p: number,
  subject: string,
  teacher: string,
  teacherBusySet: Set<string>,
  fixedSlots: Set<string>,
  allowGap = false,
  classRuleMap?: Map<string, ClassShiftRule>
): boolean {
  if (!isValidSlot(d, p)) return false;
  if (fixedSlots.has(`${cls}_${d}_${p}`)) return false;
  if (grid[cls]?.[d]?.[p] !== null) return false;

  // Kiểm tra ràng buộc buổi học & thứ học của lớp (Buổi sáng / Buổi chiều / Từng thứ trong tuần)
  if (!isSlotAllowedForClass(cls, d, p, classRuleMap)) return false;

  // Giáo viên có bận ở ô này không
  if (isTeacherBusyAt(grid, teacher, d, p, teacherBusySet, cls)) return false;

  // Kiểm tra giới hạn số tiết cùng môn trong ngày (Toán/Văn tối đa 2, môn khác tối đa 1)
  let countSameToday = 0;
  for (let period = 0; period < PERIODS.length; period++) {
    if (grid[cls]?.[d]?.[period]?.subject === subject) countSameToday++;
  }
  const maxPerDay = (subject === 'Toán' || subject === 'Ngữ văn') ? 2 : 1;
  if (countSameToday >= maxPerDay) return false;

  // Ràng buộc GDTC không học tiết 4 sáng hoặc tiết 3 chiều
  if (subject === 'GDTC' && (p === 4 || p === 7)) return false;

  // Kiểm tra lỗ lủng tiết học sinh
  if (!allowGap) {
    grid[cls][d][p] = { day: d, period: p, subject, teacher };
    const hasGap = checkClassHasGaps(grid, cls, d);
    grid[cls][d][p] = null;
    if (hasGap) return false;
  }

  return true;
}

/**
 * Thuật toán Chuỗi đẩy dời (Ejection Chain / Kempe Swaps):
 * Khi một tiết bị kẹt (unassigned), quét tìm các ô có thể nhận tiết này nếu dời tiết hiện hữu
 * sang ô trống hợp lệ khác trong cùng lớp hoặc hoán đổi giáo viên giữa các lớp.
 */
function resolveUnassignedWithEjectionChain(
  grid: TimetableGrid,
  unassignedList: InputRow[],
  teacherBusySet: Set<string>,
  fixedSlots: Set<string>,
  classRuleMap?: Map<string, ClassShiftRule>,
  targetClasses?: string[]
): InputRow[] {
  let remainingUnassigned = [...unassignedList];
  let progress = true;

  while (remainingUnassigned.length > 0 && progress) {
    progress = false;
    const stillUnassigned: InputRow[] = [];

    for (const item of remainingUnassigned) {
      const cls = item.className;
      const subj = item.subject;
      const teacher = item.teacher;
      let placed = false;

      // Bước 1: Tìm ô trống trực tiếp
      for (let d = 0; d < DAYS.length && !placed; d++) {
        for (let p = 0; p < PERIODS.length && !placed; p++) {
          if (canPlaceInSlot(grid, cls, d, p, subj, teacher, teacherBusySet, fixedSlots, false, classRuleMap)) {
            grid[cls][d][p] = { day: d, period: p, subject: subj, teacher };
            placed = true;
            progress = true;
            break;
          }
        }
      }

      if (placed) continue;

      // Bước 2: Ejection Chain Cấp 1 (Single Ejection Swap trong cùng lớp)
      // Dời tiết đang chiếm ô (d, p) sang một ô trống khác (d_new, p_new) của lớp cls
      for (let d = 0; d < DAYS.length && !placed; d++) {
        for (let p = 0; p < PERIODS.length && !placed; p++) {
          if (!isValidSlot(d, p)) continue;
          if (fixedSlots.has(`${cls}_${d}_${p}`)) continue;
          if (!isSlotAllowedForClass(cls, d, p, classRuleMap)) continue;
          const occupier = grid[cls]?.[d]?.[p];
          if (!occupier) continue;

          // Kiểm tra xem giáo viên của tiết kẹt có rảnh ở (d, p) không
          if (isTeacherBusyAt(grid, teacher, d, p, teacherBusySet, cls)) continue;

          // Kiểm tra số tiết môn subj trong ngày d nếu thay thế occupier
          let countSameToday = 0;
          for (let period = 0; period < PERIODS.length; period++) {
            if (period === p) continue;
            if (grid[cls]?.[d]?.[period]?.subject === subj) countSameToday++;
          }
          const maxPerDay = (subj === 'Toán' || subj === 'Ngữ văn') ? 2 : 1;
          if (countSameToday >= maxPerDay) continue;

          if (subj === 'GDTC' && (p === 4 || p === 7)) continue;

          // Thử tạm thời gỡ occupier để tìm vị trí mới
          const origOccupier = occupier;
          grid[cls][d][p] = null;

          let foundAlternative = false;
          for (let d_new = 0; d_new < DAYS.length && !foundAlternative; d_new++) {
            for (let p_new = 0; p_new < PERIODS.length && !foundAlternative; p_new++) {
              if (d_new === d && p_new === p) continue;
              if (canPlaceInSlot(grid, cls, d_new, p_new, origOccupier.subject, origOccupier.teacher, teacherBusySet, fixedSlots, false, classRuleMap)) {
                // Thử đặt
                grid[cls][d_new][p_new] = { day: d_new, period: p_new, subject: origOccupier.subject, teacher: origOccupier.teacher };
                grid[cls][d][p] = { day: d, period: p, subject: subj, teacher };

                if (!checkClassHasGaps(grid, cls, d) && !checkClassHasGaps(grid, cls, d_new)) {
                  foundAlternative = true;
                } else {
                  // Hoàn tác
                  grid[cls][d_new][p_new] = null;
                  grid[cls][d][p] = null;
                }
              }
            }
          }

          if (foundAlternative) {
            placed = true;
            progress = true;
            break;
          } else {
            // Khôi phục lại trạng thái cũ
            grid[cls][d][p] = origOccupier;
          }
        }
      }

      if (placed) continue;

      // Bước 3: Ejection Chain Cấp 2 (Cross-Class Teacher Swap)
      // Nếu giáo viên `teacher` đang bận ở lớp khác tại (d, p), thử dời tiết của lớp đó sang ô trống khác
      for (let d = 0; d < DAYS.length && !placed; d++) {
        for (let p = 0; p < PERIODS.length && !placed; p++) {
          if (!isValidSlot(d, p)) continue;
          if (grid[cls]?.[d]?.[p] !== null) continue; // ô của cls phải đang trống
          if (fixedSlots.has(`${cls}_${d}_${p}`)) continue;
          if (!isSlotAllowedForClass(cls, d, p, classRuleMap)) continue;

          // Kiểm tra xem cls có nhận được môn subj vào (d, p) không nếu teacher rảnh
          let countSameToday = 0;
          for (let period = 0; period < PERIODS.length; period++) {
            if (grid[cls]?.[d]?.[period]?.subject === subj) countSameToday++;
          }
          const maxPerDay = (subj === 'Toán' || subj === 'Ngữ văn') ? 2 : 1;
          if (countSameToday >= maxPerDay) continue;
          if (subj === 'GDTC' && (p === 4 || p === 7)) continue;

          // Tìm lớp khác đang học giáo viên `teacher` tại (d, p)
          const classesToScan = targetClasses && targetClasses.length > 0 ? targetClasses : (Object.keys(grid).length > 0 ? Object.keys(grid) : CLASSES);
          let conflictingClass: string | null = null;
          for (const otherCls of classesToScan) {
            if (otherCls === cls) continue;
            if (grid[otherCls]?.[d]?.[p]?.teacher === teacher) {
              conflictingClass = otherCls;
              break;
            }
          }

          if (!conflictingClass) continue;
          if (fixedSlots.has(`${conflictingClass}_${d}_${p}`)) continue;

          const otherSession = grid[conflictingClass][d][p];
          if (!otherSession) continue;

          grid[conflictingClass][d][p] = null; // thử tạm gỡ

          let movedOther = false;
          for (let d2 = 0; d2 < DAYS.length && !movedOther; d2++) {
            for (let p2 = 0; p2 < PERIODS.length && !movedOther; p2++) {
              if (d2 === d && p2 === p) continue;
              if (canPlaceInSlot(grid, conflictingClass, d2, p2, otherSession.subject, otherSession.teacher, teacherBusySet, fixedSlots, false, classRuleMap)) {
                grid[conflictingClass][d2][p2] = { day: d2, period: p2, subject: otherSession.subject, teacher: otherSession.teacher };
                grid[cls][d][p] = { day: d, period: p, subject: subj, teacher };

                if (!checkClassHasGaps(grid, cls, d) &&
                    !checkClassHasGaps(grid, conflictingClass, d) &&
                    !checkClassHasGaps(grid, conflictingClass, d2)) {
                  movedOther = true;
                } else {
                  grid[conflictingClass][d2][p2] = null;
                  grid[cls][d][p] = null;
                }
              }
            }
          }

          if (movedOther) {
            placed = true;
            progress = true;
            break;
          } else {
            grid[conflictingClass][d][p] = otherSession;
          }
        }
      }

      if (!placed) {
        stillUnassigned.push(item);
      }
    }

    remainingUnassigned = stillUnassigned;
  }

  return remainingUnassigned;
}

/**
 * GIAI ĐOẠN 1: Tạo bảng Thời khóa biểu ban đầu với MRV + Ejection Chain
 */
function generateInitialGrid(data: InputRow[], constraints: Constraint[] = [], allowCrossDaySwapping = false) {
  let bestGrid: TimetableGrid = {};
  let minUnplaced = Infinity;
  let bestUnassigned: InputRow[] = [];

  const fixedSlots = new Set<string>();
  constraints.forEach(c => {
    if (c.type === 'FIXED_SESSION' && c.className && c.day !== undefined && c.period !== undefined) {
      fixedSlots.add(`${c.className}_${c.day}_${c.period}`);
    }
  });

  const dynamicClasses = Array.from(new Set(data.map(r => r.className))).filter(Boolean);
  const targetClasses = dynamicClasses.length > 0 ? dynamicClasses : CLASSES;
  const teacherBusySet = buildTeacherBusySet(constraints);
  const classRuleMap = buildClassRuleMap(constraints, targetClasses);

  const baseOrderedSlots: { d: number; p: number }[] = [];
  for (let p = 0; p < PERIODS.length; p++) {
    for (let d = 0; d < DAYS.length; d++) {
      if (isValidSlot(d, p)) {
        baseOrderedSlots.push({ d, p });
      }
    }
  }

  // Khởi động tối đa 80 vòng lặp Monte Carlo Heuristic thông minh
  for (let iter = 0; iter < 80; iter++) {
    const grid: TimetableGrid = {};
    targetClasses.forEach((cls) => {
      grid[cls] = Array(DAYS.length)
        .fill(null)
        .map(() => Array(PERIODS.length).fill(null));
    });

    const teacherBusy: Record<number, Record<number, Set<string>>> = {};
    for (let d = 0; d < DAYS.length; d++) {
      teacherBusy[d] = {};
      for (let p = 0; p < PERIODS.length; p++) {
        teacherBusy[d][p] = new Set();
      }
    }

    // Đồng bộ giáo viên bận từ teacherBusySet vào ma trận teacherBusy
    teacherBusySet.forEach(key => {
      const lastUnderscore = key.lastIndexOf('_');
      const secondLastUnderscore = key.lastIndexOf('_', lastUnderscore - 1);
      if (secondLastUnderscore !== -1) {
        const teacher = key.substring(0, secondLastUnderscore);
        const d = parseInt(key.substring(secondLastUnderscore + 1, lastUnderscore), 10);
        const p = parseInt(key.substring(lastUnderscore + 1), 10);
        if (teacherBusy[d] && teacherBusy[d][p]) {
          teacherBusy[d][p].add(teacher);
        }
      }
    });

    type Need = { subject: string; teacher: string; remaining: number };
    const needs: Record<string, Need[]> = {};
    targetClasses.forEach(cls => needs[cls] = []);
    data.forEach((row) => {
      if (needs[row.className]) {
        needs[row.className].push({
          subject: row.subject,
          teacher: row.teacher,
          remaining: row.sessionsPerWeek
        });
      }
    });

    // 2. Áp dụng ràng buộc Tiết cố định
    constraints.forEach(c => {
      if (c.type === 'FIXED_SESSION' && c.className && c.subject && c.day !== undefined && c.period !== undefined) {
        const cls = c.className;
        const need = needs[cls]?.find(n => n.subject === c.subject);
        if (need && need.remaining > 0) {
          need.remaining--;
          grid[cls][c.day][c.period] = {
            day: c.day,
            period: c.period,
            subject: c.subject,
            teacher: need.teacher
          };
          teacherBusy[c.day][c.period].add(need.teacher);
        }
      }
    });

    const classSubjectTodayCount: Record<string, Record<number, Record<string, number>>> = {};
    targetClasses.forEach(cls => {
      classSubjectTodayCount[cls] = {};
      for (let d = 0; d < DAYS.length; d++) {
        classSubjectTodayCount[cls][d] = {};
      }
    });

    targetClasses.forEach(cls => {
      for (let d = 0; d < DAYS.length; d++) {
        for (let p = 0; p < PERIODS.length; p++) {
          if (grid[cls][d][p]) {
            const subj = grid[cls][d][p]!.subject;
            classSubjectTodayCount[cls][d][subj] = (classSubjectTodayCount[cls][d][subj] || 0) + 1;
          }
        }
      }
    });

    // Sắp xếp các lớp theo số tiết cần xếp giảm dần (MRV: Lớp nặng tải xếp trước)
    const sortedClasses = [...targetClasses].sort((a, b) => {
      const sumA = needs[a].reduce((acc, n) => acc + n.remaining, 0);
      const sumB = needs[b].reduce((acc, n) => acc + n.remaining, 0);
      return (sumB + (Math.random() - 0.5)) - sumA;
    });

    const runOrderedSlots: typeof baseOrderedSlots = [];
    for (let p = 0; p < PERIODS.length; p++) {
      const slotsInP = baseOrderedSlots.filter(s => s.p === p);
      slotsInP.sort(() => Math.random() - 0.5);
      runOrderedSlots.push(...slotsInP);
    }

    for (const slot of runOrderedSlots) {
      const { d, p } = slot;
      const isMorning = p < 5;

      for (const cls of sortedClasses) {
        if (grid[cls][d][p] !== null) continue;

        const validNeeds = needs[cls].filter(need => {
          if (need.remaining <= 0) return false;
          if (!isSlotAllowedForClass(cls, d, p, classRuleMap)) return false;
          if (teacherBusy[d][p].has(need.teacher)) return false;

          const currentCount = classSubjectTodayCount[cls][d][need.subject] || 0;
          const maxPerDay = (need.subject === 'Toán' || need.subject === 'Ngữ văn') ? 2 : 1;
          if (currentCount >= maxPerDay) return false;

          if (need.subject === 'GDTC' && (p === 4 || p === 7)) return false;

          // Kiểm tra tính liên tục, không tạo lỗ lủng tiết
          grid[cls][d][p] = { day: d, period: p, subject: need.subject, teacher: need.teacher };
          const hasGap = checkClassHasGaps(grid, cls, d);
          grid[cls][d][p] = null;
          if (hasGap) return false;

          return true;
        });

        if (validNeeds.length > 0) {
          validNeeds.sort((a, b) => {
            const aGDTCPriority = a.subject === 'GDTC' ? 3 : 0;
            const bGDTCPriority = b.subject === 'GDTC' ? 3 : 0;
            const aMorningBonus = (isMorning && CORE_SUBJECTS.has(a.subject)) ? 2 : 0;
            const bMorningBonus = (isMorning && CORE_SUBJECTS.has(b.subject)) ? 2 : 0;
            return (b.remaining + bGDTCPriority + bMorningBonus + Math.random() * 0.3) -
                   (a.remaining + aGDTCPriority + aMorningBonus + Math.random() * 0.3);
          });

          const picked = validNeeds[0];
          grid[cls][d][p] = {
            day: d,
            period: p,
            subject: picked.subject,
            teacher: picked.teacher
          };
          picked.remaining--;
          teacherBusy[d][p].add(picked.teacher);
          classSubjectTodayCount[cls][d][picked.subject] = (classSubjectTodayCount[cls][d][picked.subject] || 0) + 1;
        }
      }
    }

    // Thu thập các tiết còn sót lại
    const rawUnassigned: InputRow[] = [];
    let unassignedCounter = 1;
    targetClasses.forEach(cls => {
      needs[cls].forEach(need => {
        for (let rem = 0; rem < need.remaining; rem++) {
          rawUnassigned.push({
            id: unassignedCounter++,
            className: cls,
            subject: need.subject,
            teacher: need.teacher,
            sessionsPerWeek: 1
          });
        }
      });
    });

    // KÍCH HOẠT CHUỖI ĐẨY DỜI (EJECTION CHAIN) ĐỂ GIẢI CỨU 100% TIẾT KẸT
    let finalUnassigned = rawUnassigned;
    if (rawUnassigned.length > 0) {
      finalUnassigned = resolveUnassignedWithEjectionChain(grid, rawUnassigned, teacherBusySet, fixedSlots, classRuleMap, targetClasses);
    }

    if (finalUnassigned.length < minUnplaced) {
      minUnplaced = finalUnassigned.length;
      bestGrid = JSON.parse(JSON.stringify(grid));
      bestUnassigned = finalUnassigned;
      if (minUnplaced === 0) break;
    }
  }

  compactAndHealClassGaps(bestGrid, teacherBusySet, fixedSlots, classRuleMap, targetClasses, allowCrossDaySwapping);

  return { grid: bestGrid, unassigned: bestUnassigned, unplacedCount: minUnplaced, classRuleMap };
}

/**
 * GIAI ĐOẠN 2: Luyện kim nhân tạo (Simulated Annealing) tối ưu hóa sư phạm & triệt tiêu tiết trống
 */
function optimizeWithSimulatedAnnealing(
  initialGrid: TimetableGrid,
  constraints: Constraint[] = [],
  maxIterations = 5000,
  classRuleMap?: Map<string, ClassShiftRule>,
  targetClasses?: string[],
  allowCrossDaySwapping = false,
  crossDayTracker?: Map<string, number>
): { grid: TimetableGrid; crossDaySwapsCount: number } {
  const classesList = targetClasses && targetClasses.length > 0
    ? targetClasses
    : (Object.keys(initialGrid).length > 0 ? Object.keys(initialGrid) : CLASSES);

  let currentGrid = JSON.parse(JSON.stringify(initialGrid)) as TimetableGrid;
  let currentPenalty = calculatePenalty(currentGrid, 0, classesList);

  let bestGrid = JSON.parse(JSON.stringify(currentGrid)) as TimetableGrid;
  let bestPenalty = currentPenalty;

  const fixedSlots = new Set<string>();
  constraints.forEach(c => {
    if (c.type === 'FIXED_SESSION' && c.className && c.day !== undefined && c.period !== undefined) {
      fixedSlots.add(`${c.className}_${c.day}_${c.period}`);
    }
  });

  const teacherBusySet = buildTeacherBusySet(constraints);

  let temperature = 40.0;
  const coolingRate = 0.998;

  for (let iter = 0; iter < maxIterations; iter++) {
    // 1. Chọn ngẫu nhiên 1 lớp học trong danh sách trường
    const cls = classesList[Math.floor(Math.random() * classesList.length)];

    // 2. Chọn ngẫu nhiên 2 vị trí slot hợp lệ trong tuần
    const d1 = Math.floor(Math.random() * DAYS.length);
    const p1 = Math.floor(Math.random() * PERIODS.length);
    const d2 = Math.floor(Math.random() * DAYS.length);
    const p2 = Math.floor(Math.random() * PERIODS.length);

    if (!isValidSlot(d1, p1) || !isValidSlot(d2, p2)) continue;
    if (d1 === d2 && p1 === p2) continue;

    // Không hoán đổi các ô cố định
    if (fixedSlots.has(`${cls}_${d1}_${p1}`) || fixedSlots.has(`${cls}_${d2}_${p2}`)) continue;

    const s1 = currentGrid[cls][d1][p1];
    const s2 = currentGrid[cls][d2][p2];

    if (!s1 && !s2) continue;

    // Ràng buộc ca học & thứ học của lớp (không hoán đổi tiết sang buổi/thứ bị cấm)
    if (s1 && !isSlotAllowedForClass(cls, d2, p2, classRuleMap)) continue;
    if (s2 && !isSlotAllowedForClass(cls, d1, p1, classRuleMap)) continue;

    // Kiểm tra ràng buộc tiết bận của giáo viên
    if (s1 && teacherBusySet.has(`${s1.teacher}_${d2}_${p2}`)) continue;
    if (s2 && teacherBusySet.has(`${s2.teacher}_${d1}_${p1}`)) continue;

    // Kiểm tra xung đột trùng tiết dạy với các lớp khác
    let conflict = false;
    if (s1) {
      for (const otherCls of classesList) {
        if (otherCls === cls) continue;
        if (currentGrid[otherCls]?.[d2]?.[p2]?.teacher === s1.teacher) {
          conflict = true;
          break;
        }
      }
    }
    if (!conflict && s2) {
      for (const otherCls of classesList) {
        if (otherCls === cls) continue;
        if (currentGrid[otherCls]?.[d1]?.[p1]?.teacher === s2.teacher) {
          conflict = true;
          break;
        }
      }
    }
    if (!conflict) continue;

    // Kiểm tra số lượng tiết môn học trong ngày (Toán/Văn tối đa 2, môn khác tối đa 1)
    if (s1) {
      let countSameOnD2 = 0;
      for (let p = 0; p < PERIODS.length; p++) {
        if (p === p2) continue;
        if (currentGrid[cls][d2][p]?.subject === s1.subject) countSameOnD2++;
      }
      const limit = (s1.subject === 'Toán' || s1.subject === 'Ngữ văn') ? 2 : 1;
      if (countSameOnD2 >= limit) continue;
    }
    if (s2) {
      let countSameOnD1 = 0;
      for (let p = 0; p < PERIODS.length; p++) {
        if (p === p1) continue;
        if (currentGrid[cls][d1][p]?.subject === s2.subject) countSameOnD1++;
      }
      const limit = (s2.subject === 'Toán' || s2.subject === 'Ngữ văn') ? 2 : 1;
      if (countSameOnD1 >= limit) continue;
    }

    // GDTC không xếp vào tiết 4 hoặc 7
    if (s1 && s1.subject === 'GDTC' && (p2 === 4 || p2 === 7)) continue;
    if (s2 && s2.subject === 'GDTC' && (p1 === 4 || p1 === 7)) continue;

    // Thử áp dụng phép hoán vị
    currentGrid[cls][d1][p1] = s2 ? { ...s2, day: d1, period: p1 } : null;
    currentGrid[cls][d2][p2] = s1 ? { ...s1, day: d2, period: p2 } : null;

    // Tuyệt đối không cho phép tạo khoảng lủng tiết giữa buổi của học sinh
    if (checkClassHasGaps(currentGrid, cls, d1) || checkClassHasGaps(currentGrid, cls, d2)) {
      currentGrid[cls][d1][p1] = s1;
      currentGrid[cls][d2][p2] = s2;
      continue;
    }

    const newPenalty = calculatePenalty(currentGrid, 0, classesList);
    const delta = newPenalty - currentPenalty;

    // Chấp nhận bước chuyển theo tiêu chuẩn Metropolis
    if (delta < 0 || Math.random() < Math.exp(-delta / temperature)) {
      currentPenalty = newPenalty;
      if (currentPenalty < bestPenalty) {
        bestPenalty = currentPenalty;
        bestGrid = JSON.parse(JSON.stringify(currentGrid));
      }
    } else {
      // Hoàn tác hoán đổi
      currentGrid[cls][d1][p1] = s1;
      currentGrid[cls][d2][p2] = s2;
    }

    temperature *= coolingRate;
  }

  const crossDaySwapsCount = compactAndHealClassGaps(bestGrid, teacherBusySet, fixedSlots, classRuleMap, classesList, allowCrossDaySwapping, crossDayTracker);

  return { grid: bestGrid, crossDaySwapsCount };
}

/**
 * Phân tích và tính toán các chỉ số Điểm nghẽn Xung đột Liên ngày (Cross-day Bottleneck Statistics):
 * Đo lường mức độ kẹt lịch, tỷ lệ hoán đổi liên ngày và xác định các giáo viên đang gánh tải bất đối xứng.
 */
export function computeBottleneckStats(
  grid: TimetableGrid,
  data: InputRow[],
  targetClasses: string[],
  crossDaySwapsCount: number,
  crossDayInvolvedTeachers: Map<string, number>
): BottleneckStats {
  let totalAssignedSlots = 0;
  for (const cls of targetClasses) {
    for (let d = 0; d < DAYS.length; d++) {
      for (let p = 0; p < PERIODS.length; p++) {
        if (grid[cls]?.[d]?.[p]) totalAssignedSlots++;
      }
    }
  }

  // Thống kê phân công theo giáo viên
  const teacherMap = new Map<string, { totalSessions: number; morningLoad: number; assignedClasses: Set<string> }>();
  for (const row of data) {
    if (!teacherMap.has(row.teacher)) {
      teacherMap.set(row.teacher, { totalSessions: 0, morningLoad: 0, assignedClasses: new Set() });
    }
    const stat = teacherMap.get(row.teacher)!;
    stat.totalSessions += row.sessionsPerWeek;
    stat.assignedClasses.add(row.className);
  }

  // Tính số tiết buổi sáng thực tế từ bảng TKB
  for (const cls of targetClasses) {
    for (let d = 0; d < DAYS.length; d++) {
      for (let p = 0; p < 5; p++) {
        const sess = grid[cls]?.[d]?.[p];
        if (sess) {
          const stat = teacherMap.get(sess.teacher);
          if (stat) stat.morningLoad++;
        }
      }
    }
  }

  const highPressureTeachers: Array<{
    teacher: string;
    totalSessions: number;
    morningLoad: number;
    crossDayInvolvements: number;
    assignedClasses: string[];
    pressureScore: number;
  }> = [];

  teacherMap.forEach((stat, teacher) => {
    const involvements = crossDayInvolvedTeachers.get(teacher) || 0;
    const classCount = stat.assignedClasses.size;
    const morningRatio = stat.totalSessions > 0 ? stat.morningLoad / stat.totalSessions : 0;

    // Áp lực chuyên môn được tính dựa trên: số tiết sáng, số lớp phụ trách, mức độ dồn ca sáng và số lần kẹt liên ngày
    const pressureScore = Math.round(
      (stat.morningLoad * 2.5) + (classCount * 3.0) + (involvements * 12.0) + (morningRatio * 20.0)
    );

    highPressureTeachers.push({
      teacher,
      totalSessions: stat.totalSessions,
      morningLoad: stat.morningLoad,
      crossDayInvolvements: involvements,
      assignedClasses: Array.from(stat.assignedClasses).sort(),
      pressureScore
    });
  });

  highPressureTeachers.sort((a, b) => b.pressureScore - a.pressureScore);

  const crossDayConflictDensity = totalAssignedSlots > 0
    ? Math.round((crossDaySwapsCount / totalAssignedSlots) * 1000) / 10
    : 0;

  // Ngưỡng kích hoạt cảnh báo AI: Mật độ xung đột liên ngày >= 10% HOẶC có từ >= 4 tiết phải hoán đổi liên ngày
  const suggestsAiIntervention = crossDayConflictDensity >= 10.0 || crossDaySwapsCount >= 4;

  return {
    crossDaySwapsCount,
    crossDayConflictDensity,
    totalAssignedSlots,
    highPressureTeachers: highPressureTeachers.slice(0, 5),
    suggestsAiIntervention
  };
}

/**
 * Thuật toán xếp Thời khóa biểu Tối ưu hóa Toàn diện (Chính thức):
 * Kết hợp Heuristic Monte Carlo + Luyện kim nhân tạo Simulated Annealing
 */
export const generateSchedule = (
  data: InputRow[],
  constraints: Constraint[] = [],
  options?: GenerateScheduleOptions
): ScheduleResult => {
  const startTime = Date.now();
  const allowCrossDaySwapping = options?.allowCrossDaySwapping ?? false;

  const dynamicClasses = Array.from(new Set(data.map(r => r.className))).filter(Boolean);
  const targetClasses = dynamicClasses.length > 0 ? dynamicClasses : CLASSES;

  // Bước 1: Khởi tạo lưới thời khóa biểu hợp lệ ban đầu
  const initial = generateInitialGrid(data, constraints, allowCrossDaySwapping);

  // Nếu còn tiết chưa thể xếp do ràng buộc quá chặt
  if (initial.unplacedCount > 0) {
    return {
      timetable: initial.grid,
      unassigned: initial.unassigned,
      success: false
    };
  }

  const allTeachers = Array.from(new Set(data.map(r => r.teacher)));
  const initialMetrics = evaluateScheduleQuality(initial.grid, allTeachers, targetClasses);

  // Bước 2: Tối ưu hóa sâu bằng Simulated Annealing (triệt tiêu tiết trống, ghép tiết đôi, cân đối sư phạm)
  const crossDayTracker = new Map<string, number>();
  const { grid: optimizedGrid, crossDaySwapsCount } = optimizeWithSimulatedAnnealing(
    initial.grid,
    constraints,
    5000,
    initial.classRuleMap,
    targetClasses,
    allowCrossDaySwapping,
    crossDayTracker
  );
  const finalMetrics = evaluateScheduleQuality(optimizedGrid, allTeachers, targetClasses);
  const timeMs = Date.now() - startTime;

  const bottleneckStats = computeBottleneckStats(
    optimizedGrid,
    data,
    targetClasses,
    crossDaySwapsCount,
    crossDayTracker
  );

  console.log(`⚡ Xếp TKB tối ưu hoàn tất trong ${timeMs}ms:`);
  console.log(`- Tiết trống giáo viên: giảm từ ${initialMetrics.teacherGaps} xuống còn ${finalMetrics.teacherGaps}`);
  console.log(`- Tiết lủng học sinh: ${finalMetrics.studentGaps}`);
  console.log(`- Hoán đổi liên ngày: ${crossDaySwapsCount} tiết (Mật độ: ${bottleneckStats.crossDayConflictDensity}%)`);

  return {
    timetable: optimizedGrid,
    unassigned: [],
    success: true,
    metrics: {
      initialGaps: initialMetrics.teacherGaps,
      teacherGaps: finalMetrics.teacherGaps,
      studentGaps: finalMetrics.studentGaps,
      optimizationTimeMs: timeMs,
      bottleneckStats
    }
  };
};

