import { InputRow, TimetableGrid, ScheduleResult, Constraint } from '../types';
import { DAYS, PERIODS, CLASSES, isValidSlot } from '../constants';

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
 * GIAI ĐOẠN 1: Tạo bảng Thời khóa biểu hợp lệ ban đầu (Constructive Heuristic với MRV)
 */
function generateInitialGrid(data: InputRow[], constraints: Constraint[] = []) {
  let bestGrid: TimetableGrid = {};
  let minUnplaced = Infinity;
  let bestUnassigned: InputRow[] = [];

  const baseOrderedSlots: { d: number; p: number }[] = [];
  for (let p = 0; p < PERIODS.length; p++) {
    for (let d = 0; d < DAYS.length; d++) {
      if (isValidSlot(d, p)) {
        baseOrderedSlots.push({ d, p });
      }
    }
  }

  // Khởi động Monte Carlo restarts (120 vòng lặp)
  for (let iter = 0; iter < 120; iter++) {
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

    // 1. Áp dụng ràng buộc Giáo viên bận
    constraints.forEach(c => {
      if (c.type === 'TEACHER_BUSY' && c.teacher && c.day !== undefined && c.period !== undefined) {
        teacherBusy[c.day][c.period].add(c.teacher);
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
    const morningBlocked: Record<string, Record<number, boolean>> = {};
    const afternoonBlocked: Record<string, Record<number, boolean>> = {};

    CLASSES.forEach(cls => {
      classSubjectTodayCount[cls] = {};
      morningBlocked[cls] = {};
      afternoonBlocked[cls] = {};
      for (let d = 0; d < DAYS.length; d++) {
        classSubjectTodayCount[cls][d] = {};
        morningBlocked[cls][d] = false;
        afternoonBlocked[cls][d] = false;
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

    // Xáo trộn nhẹ các ngày trong từng lớp tiết học
    const runOrderedSlots: typeof baseOrderedSlots = [];
    for (let p = 0; p < PERIODS.length; p++) {
      const slotsInP = baseOrderedSlots.filter(s => s.p === p);
      slotsInP.sort(() => Math.random() - 0.5);
      runOrderedSlots.push(...slotsInP);
    }

    for (const slot of runOrderedSlots) {
      const { d, p } = slot;
      const isMorning = p < 5;
      const shuffledClasses = [...CLASSES].sort(() => Math.random() - 0.5);

      for (const cls of shuffledClasses) {
        if (grid[cls][d][p] !== null) continue;

        if (isMorning && morningBlocked[cls][d]) continue;
        if (!isMorning && afternoonBlocked[cls][d]) continue;

        const validNeeds = needs[cls].filter(need => {
          if (need.remaining <= 0) return false;
          if (teacherBusy[d][p].has(need.teacher)) return false;

          const currentCount = classSubjectTodayCount[cls][d][need.subject] || 0;
          // Cho phép môn Toán và Ngữ văn tối đa 2 tiết/ngày (tiết đôi), các môn khác tối đa 1 tiết/ngày
          const maxPerDay = (need.subject === 'Toán' || need.subject === 'Ngữ văn') ? 2 : 1;
          if (currentCount >= maxPerDay) return false;

          if (need.subject === 'GDTC' && (p === 4 || p === 7)) return false;
          return true;
        });

        if (validNeeds.length > 0) {
          // Ưu tiên chọn môn còn nhiều tiết nhất và môn học chính vào buổi sáng
          validNeeds.sort((a, b) => {
            const aMorningBonus = (isMorning && CORE_SUBJECTS.has(a.subject)) ? 2 : 0;
            const bMorningBonus = (isMorning && CORE_SUBJECTS.has(b.subject)) ? 2 : 0;
            return (b.remaining + bMorningBonus + Math.random() * 0.2) - (a.remaining + aMorningBonus + Math.random() * 0.2);
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
        } else {
          // Khóa nửa buổi này để học sinh không bị lủng tiết giữa buổi
          if (isMorning) morningBlocked[cls][d] = true;
          else afternoonBlocked[cls][d] = true;
        }
      }
    }

    let unplacedCount = 0;
    const runUnassigned: InputRow[] = [];
    let unassignedCounter = 1;
    CLASSES.forEach(cls => {
      needs[cls].forEach(need => {
        if (need.remaining > 0) {
          unplacedCount += need.remaining;
          runUnassigned.push({
            id: unassignedCounter++,
            className: cls,
            subject: need.subject,
            teacher: need.teacher,
            sessionsPerWeek: need.remaining
          });
        }
      });
    });

    if (unplacedCount < minUnplaced) {
      minUnplaced = unplacedCount;
      bestGrid = grid;
      bestUnassigned = runUnassigned;
      if (minUnplaced === 0) break;
    }
  }

  return { grid: bestGrid, unassigned: bestUnassigned, unplacedCount: minUnplaced };
}

/**
 * GIAI ĐOẠN 2: Luyện kim nhân tạo (Simulated Annealing) tối ưu hóa sư phạm & triệt tiêu tiết trống
 */
function optimizeWithSimulatedAnnealing(
  initialGrid: TimetableGrid,
  constraints: Constraint[] = [],
  maxIterations = 5000
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

  const teacherBusySet = new Set<string>();
  constraints.forEach(c => {
    if (c.type === 'TEACHER_BUSY' && c.teacher && c.day !== undefined && c.period !== undefined) {
      teacherBusySet.add(`${c.teacher}_${c.day}_${c.period}`);
    }
  });

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
  const optimizedGrid = optimizeWithSimulatedAnnealing(initial.grid, constraints, 5000);
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

