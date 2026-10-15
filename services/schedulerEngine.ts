import { InputRow, TimetableGrid, ScheduleResult, Constraint, ShiftType } from '../types';
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
export function evaluateScheduleQuality(grid: TimetableGrid, allTeachers: string[]) {
  let teacherGaps = 0;
  let studentGaps = 0;

  // 1. Tính số tiết trống của giáo viên
  allTeachers.forEach(teacher => {
    for (let d = 0; d < DAYS.length; d++) {
      // Buổi sáng: Tiết 0..4
      const mSlots: number[] = [];
      for (let p = 0; p < 5; p++) {
        let teaches = false;
        for (const cls of CLASSES) {
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
        for (const cls of CLASSES) {
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

  // 2. Tính số tiết lủng của học sinh
  CLASSES.forEach(cls => {
    for (let d = 0; d < DAYS.length; d++) {
      const mSlots: number[] = [];
      for (let p = 0; p < 5; p++) {
        if (grid[cls]?.[d]?.[p]) mSlots.push(p);
      }
      if (mSlots.length > 1) {
        const span = mSlots[mSlots.length - 1] - mSlots[0] + 1;
        studentGaps += span - mSlots.length;
      }

      const aSlots: number[] = [];
      for (let p = 5; p < 8; p++) {
        if (grid[cls]?.[d]?.[p]) aSlots.push(p);
      }
      if (aSlots.length > 1) {
        const span = aSlots[aSlots.length - 1] - aSlots[0] + 1;
        studentGaps += span - aSlots.length;
      }
    }
  });

  return { teacherGaps, studentGaps };
}

/**
 * Hàm phạt đa mục tiêu (Multi-objective Penalty Function):
 * Điểm phạt càng thấp thì Thời khóa biểu càng đẹp và tối ưu sư phạm.
 */
function calculatePenalty(grid: TimetableGrid, unplacedCount = 0): number {
  let penalty = unplacedCount * 100000;

  const teacherSchedule: Record<string, Record<number, number[]>> = {};
  const allTeachers = new Set<string>();

  // 1. Kiểm tra phân bổ môn học từng lớp theo ngày
  CLASSES.forEach(cls => {
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
    }
  });

  // 2. Thu thập lịch dạy giáo viên
  CLASSES.forEach(cls => {
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
 * Kiểm tra xem lớp học có bị thủng lỗ tiết giữa buổi không
 */
function checkClassHasGaps(grid: TimetableGrid, className: string, day: number): boolean {
  // Sáng 0..4
  let seenFilled = false;
  let seenHoleAfterFilled = false;
  for (let p = 0; p < 5; p++) {
    const isFilled = !!grid[className]?.[day]?.[p];
    if (isFilled) {
      if (seenHoleAfterFilled) return true;
      seenFilled = true;
    } else {
      if (seenFilled) seenHoleAfterFilled = true;
    }
  }

  // Chiều 5..7
  seenFilled = false;
  seenHoleAfterFilled = false;
  for (let p = 5; p < 8; p++) {
    const isFilled = !!grid[className]?.[day]?.[p];
    if (isFilled) {
      if (seenHoleAfterFilled) return true;
      seenFilled = true;
    } else {
      if (seenFilled) seenHoleAfterFilled = true;
    }
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
  excludeClass: string | null = null
): boolean {
  if (teacherBusySet.has(`${teacher}_${d}_${p}`)) return true;
  for (const cls of CLASSES) {
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
  classRuleMap?: Map<string, ClassShiftRule>
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
          let conflictingClass: string | null = null;
          for (const otherCls of CLASSES) {
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
function generateInitialGrid(data: InputRow[], constraints: Constraint[] = []) {
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
    CLASSES.forEach((cls) => {
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
    CLASSES.forEach(cls => needs[cls] = []);
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
    CLASSES.forEach(cls => {
      classSubjectTodayCount[cls] = {};
      for (let d = 0; d < DAYS.length; d++) {
        classSubjectTodayCount[cls][d] = {};
      }
    });

    CLASSES.forEach(cls => {
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
    const sortedClasses = [...CLASSES].sort((a, b) => {
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
    CLASSES.forEach(cls => {
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
      finalUnassigned = resolveUnassignedWithEjectionChain(grid, rawUnassigned, teacherBusySet, fixedSlots, classRuleMap);
    }

    if (finalUnassigned.length < minUnplaced) {
      minUnplaced = finalUnassigned.length;
      bestGrid = JSON.parse(JSON.stringify(grid));
      bestUnassigned = finalUnassigned;
      if (minUnplaced === 0) break;
    }
  }

  return { grid: bestGrid, unassigned: bestUnassigned, unplacedCount: minUnplaced, classRuleMap };
}

/**
 * GIAI ĐOẠN 2: Luyện kim nhân tạo (Simulated Annealing) tối ưu hóa sư phạm & triệt tiêu tiết trống
 */
function optimizeWithSimulatedAnnealing(
  initialGrid: TimetableGrid,
  constraints: Constraint[] = [],
  maxIterations = 5000,
  classRuleMap?: Map<string, ClassShiftRule>
): TimetableGrid {
  let currentGrid = JSON.parse(JSON.stringify(initialGrid)) as TimetableGrid;
  let currentPenalty = calculatePenalty(currentGrid, 0);

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
    // 1. Chọn ngẫu nhiên 1 lớp học
    const cls = CLASSES[Math.floor(Math.random() * CLASSES.length)];

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
      for (const otherCls of CLASSES) {
        if (otherCls === cls) continue;
        if (currentGrid[otherCls]?.[d2]?.[p2]?.teacher === s1.teacher) {
          conflict = true;
          break;
        }
      }
    }
    if (!conflict && s2) {
      for (const otherCls of CLASSES) {
        if (otherCls === cls) continue;
        if (currentGrid[otherCls]?.[d1]?.[p1]?.teacher === s2.teacher) {
          conflict = true;
          break;
        }
      }
    }
    if (conflict) continue;

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

    const newPenalty = calculatePenalty(currentGrid, 0);
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

  return bestGrid;
}

/**
 * Thuật toán xếp Thời khóa biểu Tối ưu hóa Toàn diện (Chính thức):
 * Kết hợp Heuristic Monte Carlo + Luyện kim nhân tạo Simulated Annealing
 */
export const generateSchedule = (data: InputRow[], constraints: Constraint[] = []): ScheduleResult => {
  const startTime = Date.now();

  // Bước 1: Khởi tạo lưới thời khóa biểu hợp lệ ban đầu
  const initial = generateInitialGrid(data, constraints);

  // Nếu còn tiết chưa thể xếp do ràng buộc quá chặt
  if (initial.unplacedCount > 0) {
    return {
      timetable: initial.grid,
      unassigned: initial.unassigned,
      success: false
    };
  }

  const allTeachers = Array.from(new Set(data.map(r => r.teacher)));
  const initialMetrics = evaluateScheduleQuality(initial.grid, allTeachers);

  // Bước 2: Tối ưu hóa sâu bằng Simulated Annealing (triệt tiêu tiết trống, ghép tiết đôi, cân đối sư phạm)
  const optimizedGrid = optimizeWithSimulatedAnnealing(initial.grid, constraints, 5000, initial.classRuleMap);
  const finalMetrics = evaluateScheduleQuality(optimizedGrid, allTeachers);
  const timeMs = Date.now() - startTime;

  console.log(`⚡ Xếp TKB tối ưu hoàn tất trong ${timeMs}ms:`);
  console.log(`- Tiết trống giáo viên: giảm từ ${initialMetrics.teacherGaps} xuống còn ${finalMetrics.teacherGaps}`);
  console.log(`- Tiết lủng học sinh: ${finalMetrics.studentGaps}`);

  return {
    timetable: optimizedGrid,
    unassigned: [],
    success: true,
    metrics: {
      initialGaps: initialMetrics.teacherGaps,
      teacherGaps: finalMetrics.teacherGaps,
      studentGaps: finalMetrics.studentGaps,
      optimizationTimeMs: timeMs
    }
  };
};

