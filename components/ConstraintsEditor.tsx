import React, { useState, useMemo } from 'react';
import { Constraint, ConstraintType, ShiftType, InputRow } from '../types';
import { DAYS, PERIODS, calcShiftCapacity } from '../constants';
import SchoolShiftMatrix from './SchoolShiftMatrix';
import { isSubjectMatching } from '../services/schedulerEngine';

interface Props {
  constraints: Constraint[];
  onAdd: (c: Omit<Constraint, 'id'>) => void;
  onRemove: (id: string) => void;
  onUpdateConstraints?: (updater: Constraint[] | ((prev: Constraint[]) => Constraint[])) => void;
  teachers: string[];
  classes: string[];
  subjects: string[];
  data?: InputRow[];
  allowCrossDaySwapping?: boolean;
  onToggleCrossDaySwapping?: (val?: boolean) => void;
  onRegenerateSchedule?: () => void;
}

const ConstraintsEditor: React.FC<Props> = ({ 
  constraints, 
  onAdd, 
  onRemove,
  onUpdateConstraints,
  teachers,
  classes,
  subjects,
  data = [],
  allowCrossDaySwapping,
  onToggleCrossDaySwapping,
  onRegenerateSchedule
}) => {
  const [activeView, setActiveView] = useState<'matrix' | 'form_list'>('matrix');
  const [type, setType] = useState<ConstraintType>('CLASS_SHIFT');
  const [selectedTeacher, setSelectedTeacher] = useState(teachers[0] || '');
  const [selectedClass, setSelectedClass] = useState('ALL');
  const [selectedSubject, setSelectedSubject] = useState(subjects[0] || 'HĐTN');
  const [selectedFixedTeacher, setSelectedFixedTeacher] = useState('');
  const [isManualFixedTeacher, setIsManualFixedTeacher] = useState(false);
  const [selectedDay, setSelectedDay] = useState(0);
  const [selectedPeriod, setSelectedPeriod] = useState(0);
  const [busyScope, setBusyScope] = useState<'PERIOD' | 'MORNING' | 'AFTERNOON'>('PERIOD');
  const [isManualTeacher, setIsManualTeacher] = useState(false);
  const [isManualSubject, setIsManualSubject] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // Cấu hình thứ học theo từng ca trong tuần: 0=Thứ 2, 1=Thứ 3, ..., 4=Thứ 6
  const [morningDays, setMorningDays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [afternoonDays, setAfternoonDays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [applyScope, setApplyScope] = useState<string>('SINGLE');

  // Danh sách các khối lớp độc lập (Khối 6, 7, 8, 9...)
  const distinctGrades = useMemo(() => {
    const set = new Set<string>();
    classes.forEach(c => {
      const match = c.match(/^(\d+)/);
      if (match) set.add(match[1]);
    });
    return Array.from(set).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  }, [classes]);

  // Danh sách môn học gợi ý cho Tiết cố định (luôn ưu tiên HĐTN, Chào cờ, Sinh hoạt lớp)
  const availableFixedSubjects = useMemo(() => {
    const list = [...subjects];
    const popular = ['HĐTN', 'Chào cờ', 'Sinh hoạt lớp'];
    popular.forEach(p => {
      if (!list.some(s => isSubjectMatching(s, p))) {
        list.unshift(p);
      }
    });
    return Array.from(new Set(list));
  }, [subjects]);

  // Thông tin ca học Thứ 6 để tính đúng Tiết cuối (Tiết 4 nếu có học chiều, Tiết 5 nếu chỉ học sáng)
  const schoolShift = useMemo(() => constraints.find(c => c.type === 'SCHOOL_SHIFT'), [constraints]);
  const hasAfternoonFriday = useMemo(() => schoolShift?.afternoonDays?.includes(4) ?? false, [schoolShift]);
  const fridayPeriod = hasAfternoonFriday ? 3 : 4;
  const fridayPeriodLabel = hasAfternoonFriday ? 'Tiết 4 Thứ 6 (Học chiều)' : 'Tiết 5 Thứ 6 (Sáng)';

  // Xử lý cập nhật ca học nhanh từ Ma trận ca học toàn trường (Cập nhật nguyên tử 100%)
  const handleUpdateClassShift = (cls: string, mDays: number[], aDays: number[]) => {
    if (onUpdateConstraints) {
      onUpdateConstraints(prev => {
        const filtered = prev.filter(c => !(c.type === 'CLASS_SHIFT' && c.className === cls));
        return [
          ...filtered,
          {
            id: 'cs_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            type: 'CLASS_SHIFT',
            className: cls,
            morningDays: [...mDays],
            afternoonDays: [...aDays]
          }
        ];
      });
      return;
    }
    const existing = constraints.filter(c => c.type === 'CLASS_SHIFT' && c.className === cls);
    existing.forEach(item => onRemove(item.id));
    onAdd({
      type: 'CLASS_SHIFT',
      className: cls,
      morningDays: mDays,
      afternoonDays: aDays
    });
  };

  // Xử lý cập nhật hàng loạt cho nhiều lớp (Áp dụng theo khối hoặc toàn trường - Cập nhật nguyên tử 100%)
  const handleBatchUpdateClassShifts = (targetClasses: string[], mDays: number[], aDays: number[]) => {
    const targetSet = new Set(targetClasses);
    if (onUpdateConstraints) {
      onUpdateConstraints(prev => {
        const filtered = prev.filter(c => !(c.type === 'CLASS_SHIFT' && targetSet.has(c.className || '')));
        const additions: Constraint[] = targetClasses.map(cls => ({
          id: 'cs_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
          type: 'CLASS_SHIFT',
          className: cls,
          morningDays: [...mDays],
          afternoonDays: [...aDays]
        }));
        return [...filtered, ...additions];
      });
      return;
    }
    targetClasses.forEach(cls => {
      const existing = constraints.filter(c => c.type === 'CLASS_SHIFT' && c.className === cls);
      existing.forEach(item => onRemove(item.id));
      onAdd({
        type: 'CLASS_SHIFT',
        className: cls,
        morningDays: mDays,
        afternoonDays: aDays
      });
    });
  };

  // Xử lý cập nhật nhanh ca học Toàn trường trực tiếp từ Ma trận (Cập nhật nguyên tử 100%)
  const handleUpdateSchoolShift = (
    morningDays: number[], 
    afternoonDays: number[], 
    resetIndividualClasses: boolean = false,
    periodCaps?: { morningPeriodCap?: number; afternoonPeriodCap?: number }
  ) => {
    if (onUpdateConstraints) {
      onUpdateConstraints(prev => {
        const prevSS = prev.find(c => c.type === 'SCHOOL_SHIFT');
        let filtered = prev.filter(c => c.type !== 'SCHOOL_SHIFT');
        if (resetIndividualClasses) {
          filtered = filtered.filter(c => c.type !== 'CLASS_SHIFT');
        }
        return [
          ...filtered,
          {
            id: 'ss_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            type: 'SCHOOL_SHIFT',
            morningDays: [...morningDays],
            afternoonDays: [...afternoonDays],
            morningPeriodCap: periodCaps?.morningPeriodCap ?? prevSS?.morningPeriodCap,
            afternoonPeriodCap: periodCaps?.afternoonPeriodCap ?? prevSS?.afternoonPeriodCap
          }
        ];
      });
      return;
    }
    const existing = constraints.filter(c => c.type === 'SCHOOL_SHIFT');
    const prevCap = existing[0];
    existing.forEach(item => onRemove(item.id));
    if (resetIndividualClasses) {
      const classShifts = constraints.filter(c => c.type === 'CLASS_SHIFT');
      classShifts.forEach(item => onRemove(item.id));
    }
    onAdd({
      type: 'SCHOOL_SHIFT',
      morningDays: [...morningDays],
      afternoonDays: [...afternoonDays],
      morningPeriodCap: periodCaps?.morningPeriodCap ?? prevCap?.morningPeriodCap,
      afternoonPeriodCap: periodCaps?.afternoonPeriodCap ?? prevCap?.afternoonPeriodCap
    });
  };

  // Đưa tất cả các lớp có cấu hình cá biệt về kế thừa 100% ca toàn trường
  const handleResetAllClassesToSchoolShift = () => {
    if (onUpdateConstraints) {
      onUpdateConstraints(prev => prev.filter(c => c.type !== 'CLASS_SHIFT'));
      return;
    }
    const classShifts = constraints.filter(c => c.type === 'CLASS_SHIFT');
    classShifts.forEach(item => onRemove(item.id));
  };

  // Cập nhật tùy biến ca học cho nhiều lớp cùng lúc (Cập nhật nguyên tử 100%)
  const handleBatchUpdateCustomClassShifts = (
    updates: { className: string; morningDays: number[]; afternoonDays: number[]; morningPeriodCap?: number; afternoonPeriodCap?: number }[],
    schoolWideUpdate?: { morningDays: number[]; afternoonDays: number[]; morningPeriodCap?: number; afternoonPeriodCap?: number }
  ) => {
    if (onUpdateConstraints) {
      onUpdateConstraints(prev => {
        const prevSS = prev.find(c => c.type === 'SCHOOL_SHIFT');
        const updateClassSet = new Set(updates.map(u => u.className));
        let next = prev.filter(c => !(c.type === 'CLASS_SHIFT' && updateClassSet.has(c.className || '')));
        
        if (schoolWideUpdate) {
          next = next.filter(c => c.type !== 'SCHOOL_SHIFT');
          next.push({
            id: 'ss_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            type: 'SCHOOL_SHIFT',
            morningDays: [...schoolWideUpdate.morningDays],
            afternoonDays: [...schoolWideUpdate.afternoonDays],
            morningPeriodCap: schoolWideUpdate.morningPeriodCap ?? prevSS?.morningPeriodCap,
            afternoonPeriodCap: schoolWideUpdate.afternoonPeriodCap ?? prevSS?.afternoonPeriodCap
          });
        }

        const additions: Constraint[] = updates.map(u => ({
          id: 'cs_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
          type: 'CLASS_SHIFT',
          className: u.className,
          morningDays: [...u.morningDays],
          afternoonDays: [...u.afternoonDays],
          morningPeriodCap: u.morningPeriodCap,
          afternoonPeriodCap: u.afternoonPeriodCap
        }));

        return [...next, ...additions];
      });
      return;
    }
    // Fallback nếu không có onUpdateConstraints
    updates.forEach(u => {
      const existing = constraints.filter(c => c.type === 'CLASS_SHIFT' && c.className === u.className);
      existing.forEach(item => onRemove(item.id));
      onAdd({
        type: 'CLASS_SHIFT',
        className: u.className,
        morningDays: u.morningDays,
        afternoonDays: u.afternoonDays,
        morningPeriodCap: u.morningPeriodCap,
        afternoonPeriodCap: u.afternoonPeriodCap
      });
    });
  };

  // Định mức số tiết ca Sáng / Chiều từ cấu hình Toàn trường (mặc định Sáng 5, Chiều 3)
  const schoolWideConstraint = useMemo(() => {
    return constraints.find(item => 
      item.type === 'SCHOOL_SHIFT' || 
      (item.type === 'CLASS_SHIFT' && (!item.className || item.className === 'ALL' || item.className === 'TOAN_TRUONG'))
    );
  }, [constraints]);

  const morningCap = schoolWideConstraint?.morningPeriodCap || 5;
  const afternoonCap = schoolWideConstraint?.afternoonPeriodCap || 3;

  // Tính tổng số tiết tối đa có thể xếp theo cấu hình ca/thứ này (áp dụng quy tắc sáng 4 tiết khi học cả chiều)
  const currentCapacity = calcShiftCapacity(morningDays, afternoonDays, morningCap, afternoonCap);

  // Số tiết mà lớp đang chọn cần trong phân công
  const selectedClassNeededSessions = useMemo(() => {
    if (!data || data.length === 0 || !selectedClass) return null;
    return data
      .filter(r => r.className === selectedClass)
      .reduce((sum, r) => sum + r.sessionsPerWeek, 0);
  }, [data, selectedClass]);

  const toggleMorningDay = (dayIdx: number) => {
    setMorningDays(prev => 
      prev.includes(dayIdx) ? prev.filter(d => d !== dayIdx) : [...prev, dayIdx].sort()
    );
  };

  const toggleAfternoonDay = (dayIdx: number) => {
    setAfternoonDays(prev => 
      prev.includes(dayIdx) ? prev.filter(d => d !== dayIdx) : [...prev, dayIdx].sort()
    );
  };

  // Áp dụng nhanh tiết cố định toàn trường theo mẫu chuẩn Bộ GD&ĐT (Chào cờ T1 Thứ 2 / Sinh hoạt lớp T6)
  const handleApplyQuickFixedPresets = (presetType: 'CHAO_CO' | 'SINH_HOAT_LOP' | 'BOTH') => {
    const hdtnSubj = subjects.find(s => isSubjectMatching(s, 'HĐTN')) || 'HĐTN';
    const newItems: Constraint[] = [];

    if (presetType === 'CHAO_CO' || presetType === 'BOTH') {
      newItems.push({
        id: 'fix_t2_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        type: 'FIXED_SESSION',
        className: 'ALL',
        subject: hdtnSubj,
        day: 0,
        period: 0
      });
    }

    if (presetType === 'SINH_HOAT_LOP' || presetType === 'BOTH') {
      newItems.push({
        id: 'fix_t6_' + (Date.now() + 1) + '_' + Math.random().toString(36).substr(2, 4),
        type: 'FIXED_SESSION',
        className: 'ALL',
        subject: hdtnSubj,
        day: 4,
        period: fridayPeriod
      });
    }

    if (onUpdateConstraints) {
      onUpdateConstraints(prev => {
        const filtered = prev.filter(c => {
          if (c.type !== 'FIXED_SESSION') return true;
          if (c.className === 'ALL' || !c.className || c.className === 'ALL_CLASSES' || c.className === 'TOAN_TRUONG') {
            if ((presetType === 'CHAO_CO' || presetType === 'BOTH') && c.day === 0 && c.period === 0) return false;
            if ((presetType === 'SINH_HOAT_LOP' || presetType === 'BOTH') && c.day === 4 && (c.period === 4 || c.period === 3)) return false;
          }
          return true;
        });
        return [...filtered, ...newItems];
      });
    } else {
      newItems.forEach(item => onAdd(item));
    }
  };

  const handleAdd = () => {
    if ((type === 'TEACHER_BUSY' || type === 'TEACHER_SHIFT') && !selectedTeacher) return;
    if (type === 'FIXED_SESSION' && (!selectedClass || !selectedSubject)) {
      alert('Vui lòng chọn lớp (hoặc Toàn trường) và nhập môn học cần cố định!');
      return;
    }
    if (type === 'CLASS_SHIFT' && !selectedClass) return;

    if (type === 'SCHOOL_SHIFT') {
      if (morningDays.length === 0 && afternoonDays.length === 0) {
        alert('Vui lòng chọn ít nhất 1 buổi (sáng hoặc chiều) trong tuần cho toàn trường!');
        return;
      }

      if (onUpdateConstraints) {
        onUpdateConstraints(prev => {
          const filtered = prev.filter(c => c.type !== 'SCHOOL_SHIFT');
          return [
            ...filtered,
            {
              id: 'ss_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
              type: 'SCHOOL_SHIFT',
              morningDays: [...morningDays],
              afternoonDays: [...afternoonDays]
            }
          ];
        });
        return;
      }

      const existing = constraints.filter(c => c.type === 'SCHOOL_SHIFT');
      existing.forEach(item => onRemove(item.id));

      onAdd({
        type: 'SCHOOL_SHIFT',
        morningDays: [...morningDays],
        afternoonDays: [...afternoonDays],
      });
      return;
    }

    if (type === 'CLASS_SHIFT') {
      if (morningDays.length === 0 && afternoonDays.length === 0) {
        alert('Vui lòng chọn ít nhất 1 buổi (sáng hoặc chiều) trong tuần!');
        return;
      }

      let targetClasses = [selectedClass];
      if (applyScope === 'GRADE_6') targetClasses = classes.filter(c => c.startsWith('6'));
      else if (applyScope === 'GRADE_7') targetClasses = classes.filter(c => c.startsWith('7'));
      else if (applyScope === 'GRADE_8') targetClasses = classes.filter(c => c.startsWith('8'));
      else if (applyScope === 'GRADE_9') targetClasses = classes.filter(c => c.startsWith('9'));
      else if (applyScope === 'ALL_CLASSES') targetClasses = [...classes];

      handleBatchUpdateClassShifts(targetClasses, morningDays, afternoonDays);
      return;
    }

    if (type === 'TEACHER_SHIFT') {
      if (morningDays.length === 0 && afternoonDays.length === 0) {
        alert('Vui lòng chọn ít nhất 1 buổi (sáng hoặc chiều) trong tuần!');
        return;
      }
      onAdd({
        type: 'TEACHER_SHIFT',
        teacher: selectedTeacher,
        morningDays: [...morningDays],
        afternoonDays: [...afternoonDays],
      });
      return;
    }

    if (type === 'TEACHER_BUSY') {
      if (busyScope === 'PERIOD') {
        onAdd({
          type: 'TEACHER_BUSY',
          teacher: selectedTeacher,
          day: selectedDay,
          period: selectedPeriod,
        });
      } else {
        onAdd({
          type: 'TEACHER_BUSY',
          teacher: selectedTeacher,
          day: selectedDay,
          shift: busyScope,
        });
      }
      return;
    }

    if (type === 'FIXED_SESSION') {
      const subj = selectedSubject.trim();
      const teacherVal = selectedFixedTeacher.trim() || undefined;

      const newConstraint: Omit<Constraint, 'id'> = {
        type: 'FIXED_SESSION',
        className: selectedClass,
        subject: subj,
        teacher: teacherVal,
        day: selectedDay,
        period: selectedPeriod,
      };

      if (onUpdateConstraints) {
        onUpdateConstraints(prev => {
          // Lọc bỏ ràng buộc trùng nếu cùng lớp (hoặc cùng khối/toàn trường) tại cùng ngày và tiết
          const filtered = prev.filter(c => !(c.type === 'FIXED_SESSION' && c.className === selectedClass && c.day === selectedDay && c.period === selectedPeriod));
          return [...filtered, { ...newConstraint, id: 'fix_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4) }];
        });
      } else {
        onAdd(newConstraint);
      }

      const scopeName = selectedClass === 'ALL' 
        ? `Toàn trường (${classes.length} lớp)` 
        : selectedClass.startsWith('KHOI_') 
        ? `Toàn bộ ${selectedClass.replace('KHOI_', 'Khối ')}` 
        : `Lớp ${selectedClass}`;
      const teacherInfo = teacherVal ? ` (GV: ${teacherVal})` : '';
      setSuccessMessage(`✅ Đã thêm tiết cố định môn "${subj}"${teacherInfo} cho ${scopeName} vào ${DAYS[selectedDay]}, ${PERIODS[selectedPeriod]}!`);
      setTimeout(() => setSuccessMessage(''), 7000);
      return;
    }
  };

  const toggleTeacherInputMode = () => {
    setIsManualTeacher(!isManualTeacher);
    if (isManualTeacher) {
      setSelectedTeacher(teachers[0] || '');
    } else {
      setSelectedTeacher('');
    }
  };

  const formatDayList = (days?: number[]) => {
    if (!days || days.length === 0) return 'Nghỉ';
    if (days.length === 5) return 'Cả tuần (T2-T6)';
    return days.map(d => DAYS[d] || `T${d + 2}`).join(', ');
  };

  const getConstraintDescription = (c: Constraint) => {
    if (c.type === 'SCHOOL_SHIFT') {
      const morningStr = formatDayList(c.morningDays);
      const afternoonStr = formatDayList(c.afternoonDays);
      return `🏫 TOÀN TRƯỜNG (${classes.length} lớp): 🌅 Sáng [${morningStr}] | 🌇 Chiều [${afternoonStr}]`;
    }
    if (c.type === 'CLASS_SHIFT') {
      if (c.morningDays !== undefined || c.afternoonDays !== undefined) {
        const morningStr = formatDayList(c.morningDays);
        const afternoonStr = formatDayList(c.afternoonDays);
        return `Lớp ${c.className}: 🌅 Sáng [${morningStr}] | 🌇 Chiều [${afternoonStr}]`;
      }
      const shiftName = c.shift === 'MORNING' ? 'Buổi Sáng (Tiết 1 - 5)' : c.shift === 'AFTERNOON' ? 'Buổi Chiều (Tiết 1 - 3)' : 'Cả ngày';
      return `Lớp ${c.className} chỉ học ${shiftName}`;
    }
    if (c.type === 'TEACHER_SHIFT') {
      if (c.morningDays !== undefined || c.afternoonDays !== undefined) {
        const morningStr = formatDayList(c.morningDays);
        const afternoonStr = formatDayList(c.afternoonDays);
        return `GV ${c.teacher}: 🌅 Dạy sáng [${morningStr}] | 🌇 Dạy chiều [${afternoonStr}]`;
      }
      const shiftName = c.shift === 'MORNING' ? 'Buổi Sáng' : c.shift === 'AFTERNOON' ? 'Buổi Chiều' : 'Cả ngày';
      return `Giáo viên ${c.teacher} chỉ dạy ${shiftName}`;
    }
    if (c.type === 'TEACHER_BUSY') {
      if (c.shift) {
        const shiftName = c.shift === 'MORNING' ? 'cả Buổi Sáng' : 'cả Buổi Chiều';
        return `Giáo viên ${c.teacher} bận ${shiftName} ${DAYS[c.day ?? 0]}`;
      }
      const timeStr = `${DAYS[c.day ?? 0]}, Tiết ${PERIODS[c.period ?? 0] || ((c.period ?? 0) + 1)}`;
      return `Giáo viên ${c.teacher} bận vào ${timeStr}`;
    }
    if (c.type === 'FIXED_SESSION') {
      const timeStr = `${DAYS[c.day ?? 0]}, Tiết ${PERIODS[c.period ?? 0] || ((c.period ?? 0) + 1)}`;
      let scopeStr = `Lớp ${c.className}`;
      if (!c.className || c.className === 'ALL' || c.className === 'ALL_CLASSES' || c.className === 'TOAN_TRUONG') {
        scopeStr = `🏫 TOÀN TRƯỜNG (${classes.length} lớp)`;
      } else if (c.className.startsWith('KHOI_') || c.className.startsWith('GRADE_')) {
        const gradeNum = c.className.replace(/^(KHOI_|GRADE_)/, '');
        const gradeClasses = classes.filter(cls => cls.startsWith(gradeNum));
        scopeStr = `🏢 TOÀN BỘ KHỐI ${gradeNum} (${gradeClasses.length} lớp)`;
      }
      return `${scopeStr}: Cố định môn [${c.subject}] vào ${timeStr}`;
    }
    const timeStr = `${DAYS[c.day ?? 0]}, Tiết ${PERIODS[c.period ?? 0] || ((c.period ?? 0) + 1)}`;
    return `Lớp ${c.className} phải học ${c.subject} vào ${timeStr}`;
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 border-b pb-4">
        <div>
          <h2 className="text-xl font-bold text-primary uppercase">Cấu hình Ràng buộc & Ca học Toàn trường</h2>
          <p className="text-xs text-gray-500 mt-0.5">Thiết lập chi tiết buổi sáng học thứ nào, buổi chiều học thứ nào cho từng lớp hoặc giáo viên</p>
        </div>

        {/* Bộ chuyển đổi chế độ xem: Ma trận ca học <-> Biểu mẫu & Danh sách ràng buộc */}
        <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200 shadow-xs self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveView('matrix')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeView === 'matrix'
                ? 'bg-primary text-white shadow-xs scale-[1.02]'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/70'
            }`}
          >
            <span>📊</span>
            <span>Ma trận ca học toàn trường</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveView('form_list')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeView === 'form_list'
                ? 'bg-primary text-white shadow-xs scale-[1.02]'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/70'
            }`}
          >
            <span>⚙️</span>
            <span>Thiết lập & Danh sách ({constraints.length})</span>
          </button>
        </div>
      </div>

      {activeView === 'matrix' ? (
        <div className="space-y-6">
          <SchoolShiftMatrix 
            classes={classes}
            constraints={constraints}
            data={data}
            onUpdateClassShift={handleUpdateClassShift}
            onBatchUpdateClassShifts={handleBatchUpdateClassShifts}
            onUpdateSchoolShift={handleUpdateSchoolShift}
            onResetAllClassesToSchoolShift={handleResetAllClassesToSchoolShift}
            onBatchUpdateCustomClassShifts={handleBatchUpdateCustomClassShifts}
            allowCrossDaySwapping={allowCrossDaySwapping}
            onToggleCrossDaySwapping={onToggleCrossDaySwapping}
          />
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-teal-50/60 rounded-xl border border-teal-200">
            <div className="flex items-center gap-2 text-xs text-teal-950">
              <span className="text-base">💡</span>
              <span>Cần thêm ràng buộc giáo viên bận, tiết cố định hoặc áp dụng mẫu đồng bộ cho toàn khối?</span>
            </div>
            <button
              type="button"
              onClick={() => setActiveView('form_list')}
              className="text-xs font-bold text-teal-800 hover:text-teal-950 underline flex items-center gap-1 self-start sm:self-auto"
            >
              Mở biểu mẫu thiết lập nâng cao ➔
            </button>
          </div>
        </div>
      ) : (
        <div>
          {/* Form thêm ràng buộc */}
          <div className="bg-gray-50 p-4 md:p-5 rounded-xl border border-gray-200 mb-8 shadow-sm">
        <h3 className="font-bold mb-4 text-gray-800 flex items-center gap-2 text-sm uppercase">
          <span className="w-2 h-2 rounded-full bg-primary"></span>
          Thêm ràng buộc mới
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          
          {/* Chọn Loại ràng buộc */}
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">Loại ràng buộc</label>
            <select 
              value={type} 
              onChange={e => setType(e.target.value as ConstraintType)}
              className="w-full p-2.5 border border-gray-300 rounded-lg shadow-sm focus:border-primary focus:ring-1 focus:ring-primary font-semibold text-sm text-gray-900 bg-white"
            >
              <option value="SCHOOL_SHIFT">🏫 Ca học TOÀN TRƯỜNG theo thứ (Morning & Afternoon for Whole School)</option>
              <option value="CLASS_SHIFT">📅 Buổi học của từng lớp theo thứ (Class Shift by Days)</option>
              <option value="TEACHER_SHIFT">👨‍🏫 Buổi dạy của giáo viên theo thứ (Teacher Shift by Days)</option>
              <option value="TEACHER_BUSY">⏳ Giáo viên bận tiết/buổi cụ thể (Teacher Busy)</option>
              <option value="FIXED_SESSION">📌 Tiết cố định (Fixed Session)</option>
            </select>
          </div>

          {/* Phạm vi áp dụng cho SCHOOL_SHIFT */}
          {type === 'SCHOOL_SHIFT' && (
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">Phạm vi áp dụng</label>
              <div className="w-full p-2.5 border border-teal-200 bg-teal-50/80 rounded-lg text-xs font-bold text-teal-900 flex items-center gap-2">
                <span className="text-base">🏫</span>
                <span>Áp dụng đồng bộ cho toàn bộ {classes.length} lớp học trong trường</span>
              </div>
            </div>
          )}

          {/* Thanh áp dụng nhanh Tiết cố định Toàn trường (Mẫu Chuẩn Bộ GD&ĐT) */}
          {type === 'FIXED_SESSION' && (
            <div className="col-span-1 md:col-span-2 lg:col-span-3 bg-gradient-to-r from-teal-50/90 via-emerald-50/70 to-teal-50/90 border border-teal-200 rounded-xl p-4 shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">⚡</span>
                  <span className="text-xs font-bold uppercase tracking-wider text-teal-950">
                    Áp dụng nhanh Tiết cố định Toàn trường (Mẫu Chuẩn Bộ GD&ĐT)
                  </span>
                </div>
                <span className="text-[11px] text-teal-800 font-bold bg-teal-100/80 px-2.5 py-0.5 rounded-full border border-teal-200">
                  Khóa cứng slot cho cả {classes.length} lớp
                </span>
              </div>
              <p className="text-xs text-teal-900 mb-3">
                Nhấn 1 chạm để tự động gán và khóa cố định môn HĐTN / Chào cờ / Sinh hoạt lớp cho toàn bộ các lớp trong trường:
              </p>
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => handleApplyQuickFixedPresets('CHAO_CO')}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-teal-50 text-teal-900 border border-teal-300 rounded-lg text-xs font-bold shadow-2xs transition-all active:scale-95"
                >
                  <span>🇻🇳</span>
                  <span>Tiết 1 Thứ 2: Chào cờ / HĐTN</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyQuickFixedPresets('SINH_HOAT_LOP')}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-teal-50 text-teal-900 border border-teal-300 rounded-lg text-xs font-bold shadow-2xs transition-all active:scale-95"
                >
                  <span>👥</span>
                  <span>{fridayPeriodLabel}: Sinh hoạt lớp / HĐTN</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyQuickFixedPresets('BOTH')}
                  className="flex items-center gap-1.5 px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-bold shadow-xs transition-all active:scale-95"
                >
                  <span>🌟</span>
                  <span>Áp dụng cả 2 tiết mẫu (T1 T2 & {fridayPeriodLabel})</span>
                </button>
              </div>
            </div>
          )}

          {/* Chọn Lớp cho FIXED_SESSION (Hỗ trợ Toàn trường, Khối, Lớp lẻ) */}
          {type === 'FIXED_SESSION' && (
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">
                Phạm vi áp dụng
              </label>
              <select 
                value={selectedClass}
                onChange={e => setSelectedClass(e.target.value)}
                className="w-full p-2.5 border border-teal-300 rounded-lg shadow-sm font-bold text-sm bg-white text-teal-950 focus:border-primary focus:ring-1 focus:ring-primary"
              >
                <optgroup label="🏫 Phạm vi rộng (Toàn trường / Khối)">
                  <option value="ALL">🏫 TOÀN TRƯỜNG (Tất cả {classes.length} lớp)</option>
                  {distinctGrades.map(g => (
                    <option key={g} value={`KHOI_${g}`}>🏢 Toàn bộ Khối {g} ({classes.filter(c => c.startsWith(g)).length} lớp)</option>
                  ))}
                </optgroup>
                <optgroup label="📖 Từng lớp học cụ thể">
                  {classes.map(c => <option key={c} value={c}>Lớp {c}</option>)}
                </optgroup>
              </select>
            </div>
          )}

          {/* Chọn Lớp cho CLASS_SHIFT */}
          {type === 'CLASS_SHIFT' && (
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">Chọn Lớp học</label>
              <select 
                value={selectedClass}
                onChange={e => setSelectedClass(e.target.value)}
                className="w-full p-2.5 border border-gray-300 rounded-lg shadow-sm font-semibold text-sm bg-white"
              >
                {classes.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}

          {/* Chọn Giáo viên (cho TEACHER_BUSY hoặc TEACHER_SHIFT) */}
          {(type === 'TEACHER_BUSY' || type === 'TEACHER_SHIFT') && (
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">Giáo viên</label>
                <button 
                  type="button"
                  onClick={toggleTeacherInputMode}
                  className="text-xs text-primary hover:text-teal-800 underline focus:outline-none"
                >
                  {isManualTeacher ? 'Chọn danh sách' : 'Nhập tay'}
                </button>
              </div>
              {isManualTeacher ? (
                <input
                  type="text"
                  value={selectedTeacher}
                  onChange={e => setSelectedTeacher(e.target.value)}
                  placeholder="Nhập tên giáo viên..."
                  className="w-full p-2.5 border border-gray-300 rounded-lg shadow-sm focus:border-primary focus:ring-1 focus:ring-primary text-sm bg-white"
                />
              ) : (
                <select 
                  value={selectedTeacher}
                  onChange={e => setSelectedTeacher(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-lg shadow-sm text-sm bg-white font-medium"
                >
                  {teachers.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              )}
            </div>
          )}

          {/* Chọn Môn học (cho FIXED_SESSION) */}
          {type === 'FIXED_SESSION' && (
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">Môn học</label>
                <button 
                  type="button"
                  onClick={() => setIsManualSubject(!isManualSubject)}
                  className="text-xs text-primary hover:text-teal-800 underline focus:outline-none"
                >
                  {isManualSubject ? 'Chọn danh sách' : 'Nhập tay'}
                </button>
              </div>
              {isManualSubject ? (
                <input
                  type="text"
                  value={selectedSubject}
                  onChange={e => setSelectedSubject(e.target.value)}
                  placeholder="Ví dụ: HĐTN, Chào cờ, Sinh hoạt lớp..."
                  className="w-full p-2.5 border border-gray-300 rounded-lg shadow-sm focus:border-primary focus:ring-1 focus:ring-primary text-sm bg-white font-medium"
                />
              ) : (
                <select 
                  value={selectedSubject}
                  onChange={e => setSelectedSubject(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-lg shadow-sm font-medium text-sm bg-white"
                >
                  {availableFixedSubjects.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
              {/* Nút bấm chọn nhanh môn học cố định */}
              <div className="flex flex-wrap gap-1 mt-1.5">
                {['HĐTN', 'Chào cờ', 'Sinh hoạt lớp'].map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSelectedSubject(s)}
                    className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                      selectedSubject === s 
                        ? 'bg-teal-700 text-white border-teal-800 font-bold' 
                        : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border-gray-200'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Chọn Giáo viên cho FIXED_SESSION (Tùy chọn) */}
          {type === 'FIXED_SESSION' && (
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">
                  Giáo viên <span className="font-normal text-gray-400 lowercase">(tùy chọn)</span>
                </label>
                <button 
                  type="button"
                  onClick={() => setIsManualFixedTeacher(!isManualFixedTeacher)}
                  className="text-xs text-primary hover:text-teal-800 underline focus:outline-none"
                >
                  {isManualFixedTeacher ? 'Chọn danh sách' : 'Nhập tay'}
                </button>
              </div>
              {isManualFixedTeacher ? (
                <input
                  type="text"
                  value={selectedFixedTeacher}
                  onChange={e => setSelectedFixedTeacher(e.target.value)}
                  placeholder="Ví dụ: GVCN, TPT, hoặc tên giáo viên..."
                  className="w-full p-2.5 border border-gray-300 rounded-lg shadow-sm focus:border-primary focus:ring-1 focus:ring-primary text-sm bg-white font-medium"
                />
              ) : (
                <select 
                  value={selectedFixedTeacher}
                  onChange={e => setSelectedFixedTeacher(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-lg shadow-sm font-medium text-sm bg-white"
                >
                  <option value="">-- Tự động theo phân công / GVCN --</option>
                  <optgroup label="🌟 Vai trò phụ trách chung">
                    <option value="GVCN">Giáo viên chủ nhiệm (GVCN)</option>
                    <option value="TPT">Tổng phụ trách (TPT)</option>
                    <option value="BGH">Ban giám hiệu (BGH)</option>
                  </optgroup>
                  <optgroup label="👨‍🏫 Danh sách giáo viên">
                    {teachers.map(t => <option key={t} value={t}>{t}</option>)}
                  </optgroup>
                </select>
              )}
            </div>
          )}

          {/* Chọn Thứ & Tiết (cho FIXED_SESSION) */}
          {type === 'FIXED_SESSION' && (
            <>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">Thứ</label>
                <select 
                  value={selectedDay}
                  onChange={e => setSelectedDay(Number(e.target.value))}
                  className="w-full p-2.5 border border-gray-300 rounded-lg shadow-sm text-sm bg-white"
                >
                  {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">Tiết</label>
                <select 
                  value={selectedPeriod}
                  onChange={e => setSelectedPeriod(Number(e.target.value))}
                  className="w-full p-2.5 border border-gray-300 rounded-lg shadow-sm text-sm bg-white"
                >
                  {PERIODS.map((p, i) => <option key={i} value={i}>{p}</option>)}
                </select>
              </div>
            </>
          )}

          {/* Chọn Phạm vi bận & Thời gian (cho TEACHER_BUSY) */}
          {type === 'TEACHER_BUSY' && (
            <>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">Phạm vi bận</label>
                <select
                  value={busyScope}
                  onChange={e => setBusyScope(e.target.value as any)}
                  className="w-full p-2.5 border border-gray-300 rounded-lg shadow-sm text-sm bg-white"
                >
                  <option value="PERIOD">Từng tiết cụ thể</option>
                  <option value="MORNING">Cả buổi sáng</option>
                  <option value="AFTERNOON">Cả buổi chiều</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">Thứ</label>
                <select 
                  value={selectedDay}
                  onChange={e => setSelectedDay(Number(e.target.value))}
                  className="w-full p-2.5 border border-gray-300 rounded-lg shadow-sm text-sm bg-white"
                >
                  {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </div>
              {busyScope === 'PERIOD' && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">Tiết</label>
                  <select 
                    value={selectedPeriod}
                    onChange={e => setSelectedPeriod(Number(e.target.value))}
                    className="w-full p-2.5 border border-gray-300 rounded-lg shadow-sm text-sm bg-white"
                  >
                    {PERIODS.map((p, i) => <option key={i} value={i}>{p}</option>)}
                  </select>
                </div>
              )}
            </>
          )}

          {/* KHU VỰC CẤU HÌNH THỨ HỌC BUỔI SÁNG & BUỔI CHIỀU (Dành cho SCHOOL_SHIFT, CLASS_SHIFT & TEACHER_SHIFT) */}
          {(type === 'SCHOOL_SHIFT' || type === 'CLASS_SHIFT' || type === 'TEACHER_SHIFT') && (
            <div className="col-span-1 md:col-span-2 lg:col-span-3 bg-white p-4 md:p-5 rounded-xl border border-gray-200 shadow-sm space-y-4">
              
              {/* Tiêu đề & Các mẫu chọn nhanh (Presets) */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-primary"></span>
                  <h4 className="font-bold text-sm text-gray-900">
                    {type === 'SCHOOL_SHIFT'
                      ? `🏫 Cấu hình Buổi Sáng & Buổi Chiều cho TOÀN BỘ CÁC LỚP TRONG TRƯỜNG (${classes.length} lớp)`
                      : type === 'CLASS_SHIFT'
                      ? `Chọn các thứ học cho Lớp ${selectedClass}`
                      : `Chọn các thứ dạy cho GV ${selectedTeacher}`}
                  </h4>
                </div>
                
                {/* Các nút bấm mẫu chọn nhanh */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs text-gray-500 font-semibold">Mẫu nhanh:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setMorningDays([0, 1, 2, 3, 4]);
                      setAfternoonDays([0, 1, 2, 3, 4]);
                    }}
                    className="text-xs px-2.5 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-800 transition-colors font-medium"
                    title="Cả sáng và chiều từ Thứ 2 đến Thứ 6"
                  >
                    Cả ngày (T2-T6)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMorningDays([0, 1, 2, 3, 4]);
                      setAfternoonDays([]);
                    }}
                    className="text-xs px-2.5 py-1 rounded bg-teal-50 hover:bg-teal-100 text-teal-800 font-semibold transition-colors border border-teal-200/60"
                    title="Chỉ học/dạy 5 buổi sáng, nghỉ chiều"
                  >
                    Chỉ sáng (T2-T6)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMorningDays([]);
                      setAfternoonDays([0, 1, 2, 3, 4]);
                    }}
                    className="text-xs px-2.5 py-1 rounded bg-amber-50 hover:bg-amber-100 text-amber-800 font-semibold transition-colors border border-amber-200/60"
                    title="Chỉ học/dạy 5 buổi chiều, nghỉ sáng"
                  >
                    Chỉ chiều (T2-T6)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMorningDays([0, 1, 2, 3, 4]);
                      setAfternoonDays([0, 2, 4]);
                    }}
                    className="text-xs px-2.5 py-1 rounded bg-blue-50 hover:bg-blue-100 text-blue-800 font-semibold transition-colors border border-blue-200/60"
                    title="Sáng cả tuần, chiều học Thứ 2, 4, 6"
                  >
                    Sáng T2-T6 + Chiều T2,4,6
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMorningDays([0, 1, 2, 3, 4]);
                      setAfternoonDays([0, 2]);
                    }}
                    className="text-xs px-2.5 py-1 rounded bg-blue-50 hover:bg-blue-100 text-blue-800 font-semibold transition-colors border border-blue-200/60"
                    title="Sáng cả tuần, chiều học Thứ 2, 4"
                  >
                    Sáng T2-T6 + Chiều T2,4
                  </button>
                </div>
              </div>

              {/* Hàng chọn thứ BUỔI SÁNG */}
              <div className="bg-teal-50/60 p-3.5 rounded-xl border border-teal-100">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-xs font-bold text-teal-950 flex items-center gap-1.5">
                    <span>🌅</span>
                    BUỔI SÁNG (Tiết 1 - {morningCap}, từ 07:15 đến 11:30):
                    <span className="font-semibold text-teal-800 ml-1">
                      {morningDays.length > 0 
                        ? `(${morningDays.length} buổi = ${morningDays.length * morningCap} tiết)` 
                        : '(Không chọn - Nghỉ buổi sáng)'}
                    </span>
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setMorningDays([0, 1, 2, 3, 4])}
                      className="text-xs text-teal-700 hover:text-teal-950 underline font-medium"
                    >
                      Chọn cả tuần
                    </button>
                    <span className="text-gray-300">|</span>
                    <button
                      type="button"
                      onClick={() => setMorningDays([])}
                      className="text-xs text-red-600 hover:text-red-800 underline font-medium"
                    >
                      Bỏ chọn sáng
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {DAYS.map((dayName, dIdx) => {
                    const isSelected = morningDays.includes(dIdx);
                    return (
                      <button
                        key={`morning_${dIdx}`}
                        type="button"
                        onClick={() => toggleMorningDay(dIdx)}
                        className={`py-2 px-3 rounded-lg text-xs font-bold transition-all border flex items-center justify-center gap-1.5 ${
                          isSelected
                            ? 'bg-teal-600 text-white border-teal-600 shadow-sm scale-[1.01]'
                            : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                        }`}
                      >
                        <span className="text-sm">{isSelected ? '✓' : '○'}</span>
                        <span>{dayName}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Hàng chọn thứ BUỔI CHIỀU */}
              <div className="bg-amber-50/60 p-3.5 rounded-xl border border-amber-100">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                    <span>🌇</span>
                    BUỔI CHIỀU (Tiết 1 - {afternoonCap}, từ 13:30 đến 16:00):
                    <span className="font-semibold text-amber-800 ml-1">
                      {afternoonDays.length > 0 
                        ? `(${afternoonDays.length} buổi = ${afternoonDays.length * afternoonCap} tiết)` 
                        : '(Không chọn - Nghỉ buổi chiều)'}
                    </span>
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setAfternoonDays([0, 1, 2, 3, 4])}
                      className="text-xs text-amber-800 hover:text-amber-950 underline font-medium"
                    >
                      Chọn cả tuần
                    </button>
                    <span className="text-gray-300">|</span>
                    <button
                      type="button"
                      onClick={() => setAfternoonDays([])}
                      className="text-xs text-red-600 hover:text-red-800 underline font-medium"
                    >
                      Bỏ chọn chiều
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {DAYS.map((dayName, dIdx) => {
                    const isSelected = afternoonDays.includes(dIdx);
                    return (
                      <button
                        key={`afternoon_${dIdx}`}
                        type="button"
                        onClick={() => toggleAfternoonDay(dIdx)}
                        className={`py-2 px-3 rounded-lg text-xs font-bold transition-all border flex items-center justify-center gap-1.5 ${
                          isSelected
                            ? 'bg-amber-600 text-white border-amber-600 shadow-sm scale-[1.01]'
                            : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                        }`}
                      >
                        <span className="text-sm">{isSelected ? '✓' : '○'}</span>
                        <span>{dayName}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Hộp Thông tin Sức chứa & Cảnh báo Quá tải */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-700">Tổng sức chứa tối đa của cấu hình này:</span>
                  <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-900 font-bold border border-blue-200">
                    {currentCapacity} tiết/tuần
                  </span>
                  <span className="text-slate-500">
                    ({morningDays.length * morningCap} tiết sáng + {afternoonDays.length * afternoonCap} tiết chiều)
                  </span>
                </div>

                {type === 'CLASS_SHIFT' && selectedClassNeededSessions !== null && (
                  <div>
                    {selectedClassNeededSessions > currentCapacity ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-red-100 text-red-800 font-bold border border-red-300 shadow-sm animate-pulse">
                        ⚠️ CẢNH BÁO: Lớp {selectedClass} cần {selectedClassNeededSessions} tiết, vượt quá sức chứa {currentCapacity} tiết (Thiếu {selectedClassNeededSessions - currentCapacity} tiết)!
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-emerald-100 text-emerald-800 font-semibold border border-emerald-300">
                        ✓ Đủ sức chứa: Lớp {selectedClass} cần {selectedClassNeededSessions} / {currentCapacity} tiết
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Tùy chọn Áp dụng hàng loạt cho Toàn khối / Toàn trường */}
              {type === 'CLASS_SHIFT' && (
                <div className="flex items-center gap-3 pt-2 border-t border-gray-100 flex-wrap">
                  <span className="text-xs font-bold text-gray-700">Phạm vi áp dụng:</span>
                  <select
                    value={applyScope}
                    onChange={e => setApplyScope(e.target.value)}
                    className="text-xs p-1.5 px-3 border border-gray-300 rounded-lg shadow-sm font-semibold bg-white text-gray-800 focus:border-primary focus:ring-1 focus:ring-primary"
                  >
                    <option value="SINGLE">Chỉ áp dụng cho lớp {selectedClass}</option>
                    <option value="GRADE_6">Toàn bộ các lớp Khối 6</option>
                    <option value="GRADE_7">Toàn bộ các lớp Khối 7</option>
                    <option value="GRADE_8">Toàn bộ các lớp Khối 8</option>
                    <option value="GRADE_9">Toàn bộ các lớp Khối 9</option>
                    <option value="ALL_CLASSES">Tất cả các lớp trong trường</option>
                  </select>
                  {applyScope !== 'SINGLE' && (
                    <span className="text-xs text-teal-800 font-medium bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                      ⚡ Sẽ tự động áp dụng đồng bộ cấu hình này cho tất cả các lớp thuộc phạm vi đã chọn!
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

        </div>
        
        {/* Banner thông báo thêm ràng buộc thành công */}
        {successMessage && (
          <div className="mb-4 p-3.5 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-900 text-xs font-semibold flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 animate-fadeIn">
            <div className="flex items-center gap-2">
              <span className="text-base">🎉</span>
              <span>{successMessage}</span>
            </div>
            {onRegenerateSchedule && (
              <button
                type="button"
                onClick={onRegenerateSchedule}
                className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-bold text-xs shadow-xs transition-all active:scale-95 flex items-center gap-1 self-start sm:self-auto cursor-pointer"
              >
                <span>⚡</span>
                <span>Xếp lại TKB ngay</span>
              </button>
            )}
          </div>
        )}

        {/* Các nút bấm Thao tác */}
        <div className="flex items-center gap-3 flex-wrap">
          <button 
            type="button"
            onClick={handleAdd}
            className="bg-primary hover:bg-teal-800 text-white px-5 py-2.5 rounded-lg transition-colors flex items-center gap-2 shadow font-bold text-sm cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Thêm ràng buộc
          </button>

          {onRegenerateSchedule && (
            <button 
              type="button"
              onClick={() => {
                handleAdd();
                setTimeout(() => onRegenerateSchedule(), 80);
              }}
              className="bg-emerald-700 hover:bg-emerald-800 text-white px-5 py-2.5 rounded-lg transition-all flex items-center gap-2 shadow font-bold text-sm cursor-pointer active:scale-95"
              title="Thêm ràng buộc và tự động xếp lại thời khóa biểu ngay lập tức"
            >
              <span>⚡</span>
              <span>Thêm & Xếp lại TKB ngay</span>
            </button>
          )}
        </div>
      </div>

      {/* Danh sách ràng buộc đã thiết lập */}
      <h3 className="font-bold mb-4 text-gray-800 border-b pb-2 flex items-center justify-between">
        <span>Danh sách ràng buộc đã thiết lập ({constraints.length})</span>
        <span className="text-xs text-gray-500 font-normal">Các ràng buộc sẽ được thuật toán tối ưu tuân thủ tuyệt đối</span>
      </h3>
      
      {constraints.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-200 text-gray-500 text-sm italic">
          Chưa có ràng buộc nào được thiết lập. Hãy chọn loại ràng buộc ở biểu mẫu phía trên và ấn &quot;Thêm ràng buộc&quot;.
        </div>
      ) : (
        <div className="space-y-2.5">
          {constraints.map(c => {
            let badgeBg = 'bg-blue-100 text-blue-800 border-blue-200';
            let badgeLabel = 'Cố định';
            if (c.type === 'SCHOOL_SHIFT') {
              badgeBg = 'bg-teal-700 text-white border-teal-800 shadow-xs font-black';
              badgeLabel = '🏫 Toàn trường';
            } else if (c.type === 'FIXED_SESSION') {
              if (!c.className || c.className === 'ALL' || c.className === 'ALL_CLASSES' || c.className === 'TOAN_TRUONG') {
                badgeBg = 'bg-emerald-700 text-white border-emerald-800 shadow-xs font-black';
                badgeLabel = '🏫 Cố định Toàn trường';
              } else if (c.className.startsWith('KHOI_') || c.className.startsWith('GRADE_')) {
                const gradeNum = c.className.replace(/^(KHOI_|GRADE_)/, '');
                badgeBg = 'bg-teal-700 text-white border-teal-800 shadow-xs font-black';
                badgeLabel = `🏢 Cố định Khối ${gradeNum}`;
              } else {
                badgeBg = 'bg-blue-100 text-blue-800 border-blue-200';
                badgeLabel = `📌 Cố định Lớp ${c.className}`;
              }
            } else if (c.type === 'TEACHER_BUSY') {
              badgeBg = 'bg-red-100 text-red-800 border-red-200';
              badgeLabel = 'GV Bận';
            } else if (c.type === 'CLASS_SHIFT') {
              badgeBg = 'bg-teal-100 text-teal-800 border-teal-200';
              badgeLabel = 'Ca học lớp';
            } else if (c.type === 'TEACHER_SHIFT') {
              badgeBg = 'bg-amber-100 text-amber-800 border-amber-200';
              badgeLabel = 'Ca dạy GV';
            }

            return (
              <div key={c.id} className="flex items-center justify-between p-3.5 bg-white border border-gray-200 rounded-xl shadow-sm hover:border-teal-300 transition-all">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className={`px-2.5 py-1 text-xs font-bold rounded-md uppercase border ${badgeBg}`}>
                    {badgeLabel}
                  </span>
                  <span className="text-gray-900 text-sm font-semibold">{getConstraintDescription(c)}</span>
                </div>
                <button 
                  onClick={() => onRemove(c.id)}
                  className="text-gray-400 hover:text-red-600 transition-colors p-1.5 rounded-lg hover:bg-red-50"
                  title="Xóa ràng buộc này"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                </button>
              </div>
            );
          })}
        </div>
      )}
        </div>
      )}
    </div>
  );
};

export default ConstraintsEditor;