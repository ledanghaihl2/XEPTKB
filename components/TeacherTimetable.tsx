import React, { useMemo, useState } from 'react';
import { TimetableGrid, ShiftType, Constraint } from '../types';
import { DAYS, PERIODS, CLASSES, isValidSlot, SHIFT_OPTIONS, isPeriodInShift } from '../constants';

interface Props {
  schedule: TimetableGrid;
  shift?: ShiftType;
  onShiftChange?: (shift: ShiftType) => void;
  constraints?: Constraint[];
}

const TeacherTimetable: React.FC<Props> = ({ schedule, shift, onShiftChange, constraints }) => {
  const [selectedTeacher, setSelectedTeacher] = useState<string>('Tất cả');
  const [internalShift, setInternalShift] = useState<ShiftType>('ALL');
  const currentShift = shift ?? internalShift;

  const handleShiftSelect = (s: ShiftType) => {
    if (onShiftChange) {
      onShiftChange(s);
    } else {
      setInternalShift(s);
    }
  };

  // Trích xuất danh sách giáo viên duy nhất từ thời khóa biểu (đã trim và chuẩn hóa)
  const allTeachers = useMemo(() => {
    const teacherMap = new Map<string, string>();
    CLASSES.forEach(cls => {
      DAYS.forEach((_, dIdx) => {
        PERIODS.forEach((_, pIdx) => {
          const session = schedule[cls]?.[dIdx]?.[pIdx];
          if (session && session.teacher && session.teacher.trim()) {
            const cleanName = session.teacher.trim();
            const key = cleanName.toLowerCase();
            if (!teacherMap.has(key)) {
              teacherMap.set(key, cleanName);
            }
          }
        });
      });
    });
    return Array.from(teacherMap.values()).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [schedule]);

  const displayTeachers = selectedTeacher === 'Tất cả' ? allTeachers : [selectedTeacher];

  return (
    <div className="space-y-8">
      <div className="bg-white shadow rounded-lg p-4 flex flex-col md:flex-row items-center justify-between gap-4 print:hidden">
        <h2 className="text-xl font-bold text-primary">TKB GIÁO VIÊN</h2>
        
        <div className="flex items-center gap-4 flex-wrap justify-center">
          {/* Bộ chọn buổi học */}
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg border border-gray-200 shadow-sm">
            <span className="text-xs font-semibold text-gray-500 px-2 flex items-center gap-1">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
              Buổi:
            </span>
            {SHIFT_OPTIONS.map(opt => {
              const active = currentShift === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleShiftSelect(opt.id)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${
                    active 
                      ? 'bg-primary text-white shadow font-bold' 
                      : 'text-gray-600 hover:text-gray-900 hover:bg-white/80'
                  }`}
                  title={opt.description}
                >
                  <span>{opt.icon}</span>
                  <span>{opt.shortLabel}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center">
            <label className="mr-2 font-medium text-gray-700 text-sm">Chọn giáo viên:</label>
            <select 
              className="border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:border-primary text-sm font-medium shadow-sm"
              value={selectedTeacher}
              onChange={(e) => setSelectedTeacher(e.target.value)}
            >
              <option value="Tất cả">-- Tất cả giáo viên --</option>
              {allTeachers.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {allTeachers.length === 0 && (
        <div className="bg-white p-8 text-center text-gray-500 rounded-lg shadow">
          Chưa có dữ liệu thời khóa biểu để hiển thị.
        </div>
      )}

      {displayTeachers.map(teacher => (
        <div key={teacher} className="bg-white shadow rounded-lg p-6 overflow-x-auto page-break-after">
          <h3 className="text-lg font-bold mb-4 text-center text-primary border-b pb-2">
            GIÁO VIÊN: {teacher}
            {currentShift === 'MORNING' && <span className="text-sm font-normal text-teal-700 ml-2">(Buổi Sáng)</span>}
            {currentShift === 'AFTERNOON' && <span className="text-sm font-normal text-amber-700 ml-2">(Buổi Chiều)</span>}
          </h3>
          <div className="border border-gray-300 min-w-[600px]">
             <div className="grid grid-cols-[100px_repeat(5,minmax(100px,1fr))] divide-x divide-gray-300">
               <div className="bg-primary text-white font-bold p-2 text-center flex items-center justify-center">Tiết</div>
               {DAYS.map(day => (
                 <div key={day} className="bg-primary text-white font-bold p-2 text-center">{day}</div>
               ))}
             </div>
             
             {PERIODS.map((period, pIdx) => {
               if (!isPeriodInShift(pIdx, currentShift)) return null;
               const isRowValid = DAYS.some((_, dIdx) => isValidSlot(dIdx, pIdx, constraints));
               if (!isRowValid) return null;

               return (
                <div key={period} className={`grid grid-cols-[100px_repeat(5,minmax(100px,1fr))] divide-x divide-gray-300 ${pIdx === 4 || pIdx === 7 ? 'border-b-4 border-gray-400' : 'border-b border-gray-200'}`}>
                  <div className="bg-gray-50 font-bold p-2 text-center flex items-center justify-center text-gray-600 text-sm">
                    {period}
                  </div>
                  {DAYS.map((day, dIdx) => {
                    const isValid = isValidSlot(dIdx, pIdx, constraints);
                    if (!isValid) {
                        return <div key={day} className="bg-gray-200"></div>;
                    }

                    const matchedSessions: { class: string; subject: string }[] = [];
                    for (const cls of CLASSES) {
                      const session = schedule[cls]?.[dIdx]?.[pIdx];
                      if (session && session.teacher && session.teacher.trim().toLowerCase() === teacher.trim().toLowerCase()) {
                        matchedSessions.push({ class: cls, subject: session.subject });
                      }
                    }

                    return (
                      <div key={day} className="p-2 text-sm flex flex-col justify-center min-h-[60px] hover:bg-blue-50 transition-colors text-center bg-white">
                        {matchedSessions.length === 1 ? (
                          <>
                            <span className="font-bold text-gray-800">{matchedSessions[0].class || ''}</span>
                            <span className="text-gray-500">{matchedSessions[0].subject || ''}</span>
                          </>
                        ) : matchedSessions.length > 1 ? (
                          <div className="bg-red-50 text-red-700 font-bold p-1 rounded border border-red-300 text-xs">
                            <span className="text-red-600 font-bold block">⚠️ TRÙNG {matchedSessions.length} LỚP</span>
                            <span className="text-[11px] font-medium text-gray-700 block mt-0.5">
                              {matchedSessions.map(s => `${s.class} (${s.subject})`).join(', ')}
                            </span>
                          </div>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </div>
                    );
                  })}
                </div>
               );
             })}
          </div>
        </div>
      ))}
    </div>
  );
};

export default TeacherTimetable;
