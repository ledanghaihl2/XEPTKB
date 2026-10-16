import React, { useState } from 'react';
import { TimetableGrid as TimetableGridType, ShiftType, Constraint } from '../types';
import { DAYS, PERIODS, CLASSES, isSlotValidForClass, SHIFT_OPTIONS, isPeriodInShift } from '../constants';

interface Props {
  schedule: TimetableGridType;
  onEditCell?: (className: string, day: number, period: number, subject: string, teacher: string) => void;
  shift?: ShiftType;
  onShiftChange?: (shift: ShiftType) => void;
  constraints?: Constraint[];
  classes?: string[];
}

const ClassTimetable: React.FC<Props> = ({ schedule, onEditCell, shift, onShiftChange, constraints, classes }) => {
  const [selectedClass, setSelectedClass] = useState<string>('Tất cả');
  const [internalShift, setInternalShift] = useState<ShiftType>('ALL');
  const currentShift = shift ?? internalShift;

  const handleShiftSelect = (s: ShiftType) => {
    if (onShiftChange) {
      onShiftChange(s);
    } else {
      setInternalShift(s);
    }
  };

  const [editingCell, setEditingCell] = useState<{cls: string, dayIdx: number, periodIdx: number} | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editTeacher, setEditTeacher] = useState("");

  const handleCellClick = (cls: string, dayIdx: number, periodIdx: number) => {
    if (!onEditCell) return;
    const session = schedule[cls]?.[dayIdx]?.[periodIdx];
    setEditingCell({ cls, dayIdx, periodIdx });
    setEditSubject(session?.subject || "");
    setEditTeacher(session?.teacher || "");
  };

  const handleSave = () => {
    if (editingCell && onEditCell) {
      onEditCell(editingCell.cls, editingCell.dayIdx, editingCell.periodIdx, editSubject.trim(), editTeacher.trim());
    }
    setEditingCell(null);
  };

  const availableClasses = classes && classes.length > 0 ? classes : (
    Object.keys(schedule).length > 0 ? Object.keys(schedule).sort((a, b) => a.localeCompare(b, 'vi', { numeric: true })) : CLASSES
  );
  const displayClasses = selectedClass === 'Tất cả' ? availableClasses : [selectedClass];

  return (
    <div className="space-y-8">
      <div className="bg-white shadow rounded-lg p-4 flex flex-col md:flex-row items-center justify-between gap-4 print:hidden">
        <h2 className="text-xl font-bold text-primary">TKB TỪNG LỚP</h2>
        
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
            <label className="mr-2 font-medium text-gray-700 text-sm">Chọn lớp:</label>
            <select 
              className="border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:border-primary text-sm font-medium shadow-sm"
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
            >
              <option value="Tất cả">-- Tất cả các lớp --</option>
              {availableClasses.map(cls => (
                <option key={cls} value={cls}>{cls}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {availableClasses.length === 0 && (
        <div className="bg-white p-8 text-center text-gray-500 rounded-lg shadow">
          Chưa có dữ liệu lớp học.
        </div>
      )}

      {displayClasses.map(cls => (
        <div key={cls} className="bg-white shadow rounded-lg p-6 overflow-x-auto page-break-after">
          <h3 className="text-lg font-bold mb-4 text-center text-primary border-b pb-2">
            LỚP: {cls}
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
               const isRowValid = DAYS.some((_, dIdx) => isSlotValidForClass(cls, dIdx, pIdx, constraints));
               if (!isRowValid) return null;

               return (
                <div key={period} className={`grid grid-cols-[100px_repeat(5,minmax(100px,1fr))] divide-x divide-gray-300 ${pIdx === 4 || pIdx === 7 ? 'border-b-4 border-gray-400' : 'border-b border-gray-200'}`}>
                  <div className="bg-gray-50 font-bold p-2 text-center flex items-center justify-center text-gray-600 text-sm">
                    {period}
                  </div>
                  {DAYS.map((day, dIdx) => {
                    const isValid = isSlotValidForClass(cls, dIdx, pIdx, constraints);
                    if (!isValid) {
                        return <div key={day} className="bg-gray-200"></div>;
                    }

                    const isFixed = constraints?.some(c => {
                      if (c.type !== 'FIXED_SESSION') return false;
                      if (c.day !== dIdx || c.period !== pIdx) return false;
                      if (!c.className || c.className === 'ALL' || c.className === 'ALL_CLASSES' || c.className === 'TOAN_TRUONG') return true;
                      if (c.className.startsWith('KHOI_') || c.className.startsWith('GRADE_')) {
                        const g = c.className.replace(/^(KHOI_|GRADE_)/, '');
                        return cls.startsWith(g) || cls.startsWith(`Lớp ${g}`);
                      }
                      return c.className === cls;
                    });

                    const session = schedule[cls]?.[dIdx]?.[pIdx];
                    return (
                      <div 
                        key={day} 
                        className={`p-2 text-sm flex flex-col justify-center min-h-[60px] transition-colors text-center ${
                          isFixed ? 'bg-emerald-50/50' : 'bg-white'
                        } ${onEditCell ? 'cursor-pointer hover:bg-blue-100' : 'hover:bg-blue-50'}`}
                        onClick={() => handleCellClick(cls, dIdx, pIdx)}
                      >
                        {session ? (
                          <>
                            <div className="flex items-center justify-center gap-1">
                              <span className="font-bold text-gray-800">{session.subject || ''}</span>
                              {isFixed && (
                                <span title="Tiết cố định" className="text-xs text-emerald-600 font-bold">📌</span>
                              )}
                            </div>
                            <span className="text-gray-500">{session.teacher || ''}</span>
                          </>
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

      {/* Modal Chỉnh sửa tiết học khi xem TKB từng lớp */}
      {editingCell && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 print:hidden">
          <div className="bg-white rounded-lg shadow-xl w-[400px] overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-medium text-gray-900">
                Chỉnh sửa: Lớp {editingCell.cls} - Thứ {editingCell.dayIdx + 2} - Tiết {editingCell.periodIdx + 1}
              </h3>
              <button 
                onClick={() => setEditingCell(null)}
                className="text-gray-400 hover:text-gray-500"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-500 mb-4">Để xóa tiết học này, hãy để trống Môn học.</p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Môn học</label>
                <input
                  type="text"
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                  placeholder="Ví dụ: Toán, Ngữ Văn..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Giáo viên</label>
                <input
                  type="text"
                  value={editTeacher}
                  onChange={(e) => setEditTeacher(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                  placeholder="Tên giáo viên"
                />
              </div>
            </div>
            <div className="px-6 py-3 bg-gray-50 text-right flex justify-end gap-3 rounded-b-lg">
              <button
                type="button"
                className="px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                onClick={() => setEditingCell(null)}
              >
                Hủy
              </button>
              <button
                type="button"
                className="px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                onClick={handleSave}
              >
                Lưu thay đổi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClassTimetable;
