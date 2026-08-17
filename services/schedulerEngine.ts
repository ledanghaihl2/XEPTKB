import { InputRow, TimetableGrid, ClassSession, ScheduleResult, Constraint } from '../types';
import { DAYS, PERIODS, CLASSES, isValidSlot } from '../constants';

// A heuristic scheduler with Monte Carlo gap-free sequential filling
export const generateSchedule = (data: InputRow[], constraints: Constraint[] = []): ScheduleResult => {
  let bestGrid: TimetableGrid = {};
  let minUnplaced = Infinity;
  let bestUnassigned: InputRow[] = [];

  // Identify ordered slots
  const baseOrderedSlots: {d: number, p: number}[] = [];
  for (let p = 0; p < PERIODS.length; p++) {
    for (let d = 0; d < DAYS.length; d++) {
      if (isValidSlot(d, p)) {
        baseOrderedSlots.push({d, p});
      }
    }
  }

  // Monte Carlo loop
  for (let iter = 0; iter < 100; iter++) {
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
      needs[row.className].push({
        subject: row.subject,
        teacher: row.teacher,
        remaining: row.sessionsPerWeek
      });
    });

    constraints.forEach(c => {
      if (c.type === 'TEACHER_BUSY' && c.teacher && c.day !== undefined && c.period !== undefined) {
        teacherBusy[c.day][c.period].add(c.teacher);
      }
    });

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

    const classSubjectToday: Record<string, Record<number, Set<string>>> = {};
    const morningBlocked: Record<string, Record<number, boolean>> = {};
    const afternoonBlocked: Record<string, Record<number, boolean>> = {};
    CLASSES.forEach(cls => {
      classSubjectToday[cls] = {};
      morningBlocked[cls] = {};
      afternoonBlocked[cls] = {};
      for (let d = 0; d < DAYS.length; d++) {
        classSubjectToday[cls][d] = new Set();
        morningBlocked[cls][d] = false;
        afternoonBlocked[cls][d] = false;
      }
    });

    CLASSES.forEach(cls => {
      for (let d = 0; d < DAYS.length; d++) {
        for (let p = 0; p < PERIODS.length; p++) {
          if (grid[cls][d][p]) {
            classSubjectToday[cls][d].add(grid[cls][d][p]!.subject);
          }
        }
      }
    });

    // Shuffle slots WITHIN their period layers (so P0 days are shuffled, but P0 always before P1)
    const runOrderedSlots: typeof baseOrderedSlots = [];
    for (let p = 0; p < PERIODS.length; p++) {
       const slotsInP = baseOrderedSlots.filter(s => s.p === p);
       slotsInP.sort(() => Math.random() - 0.5);
       runOrderedSlots.push(...slotsInP);
    }

    for (const slot of runOrderedSlots) {
      const {d, p} = slot;
      const isMorning = p < 5;
      const shuffledClasses = [...CLASSES].sort(() => Math.random() - 0.5);

      for (const cls of shuffledClasses) {
        if (grid[cls][d][p] !== null) continue;

        if (isMorning && morningBlocked[cls][d]) continue;
        if (!isMorning && afternoonBlocked[cls][d]) continue;

        const validNeeds = needs[cls].filter(need => {
          if (need.remaining <= 0) return false;
          if (teacherBusy[d][p].has(need.teacher)) return false;
          if (classSubjectToday[cls][d].has(need.subject)) return false;
          if (need.subject === 'GDTC' && (p === 4 || p === 7)) return false;
          return true;
        });

        if (validNeeds.length > 0) {
          // Shuffle valid needs to add randomness if remaining is same
          validNeeds.sort((a, b) => (b.remaining + Math.random()*0.1) - (a.remaining + Math.random()*0.1));
          const picked = validNeeds[0];

          grid[cls][d][p] = {
            day: d,
            period: p,
            subject: picked.subject,
            teacher: picked.teacher
          };
          picked.remaining--;
          teacherBusy[d][p].add(picked.teacher);
          classSubjectToday[cls][d].add(picked.subject);

        } else {
          // No subject could be found (or all remaining tasks exhausted), block the rest of 
          // this half-day to prevent disjoint periods
          if (isMorning) morningBlocked[cls][d] = true;
          else afternoonBlocked[cls][d] = true;
        }
      }
    }

    let unplacedCount = 0;
    const runUnassigned: InputRow[] = [];
    CLASSES.forEach(cls => {
      needs[cls].forEach(need => {
        if (need.remaining > 0) {
          unplacedCount += need.remaining;
          runUnassigned.push({
            id: `${cls}-${need.subject}-${need.remaining}`, // dummy id
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

  return { timetable: bestGrid, unassigned: bestUnassigned, success: minUnplaced === 0 };
};
