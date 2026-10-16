import React, { useState } from 'react';
import { TimetableGrid as TimetableGridType, ShiftType, Constraint } from '../types';
import { DAYS, PERIODS, CLASSES, isSlotValidForClass, SHIFT_OPTIONS, isPeriodInShift } from '../constants';
import { getTargetClassesForConstraint } from '../services/schedulerEngine';

interface Props {
  schedule: TimetableGridType;
  onEditCell?: (className: string, day: number, period: number, subject: string, teacher: string) => void;
  shift?: ShiftType;
  onShiftChange?: (shift: ShiftType) => void;
  constraints?: Constraint[];
  classes?: string[];
  onTogglePin?: (
    className: string, 
    day: number, 
    period: number, 
    action: 'PIN' | 'UNPIN', 
    scope?: 'CLASS' | 'ALL', 
    subject?: string, 
    teacher?: string
  ) => void;
}

const ClassTimetable: React.FC<Props> = ({ 
  schedule, 
  onEditCell, 
  shift, 
  onShiftChange, 
  constraints, 
  classes,
  onTogglePin
}) => {
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
      {editingCell && (() => {
        const matchingFixed = constraints?.filter(c => {
          if (c.type !== 'FIXED_SESSION') return false;
          if (c.day !== editingCell.dayIdx || c.period !== editingCell.periodIdx) return false;
          const targetClasses = getTargetClassesForConstraint(c.className, allClasses);
          return targetClasses.includes(editingCell.cls);
        }) || [];
        const isCurrentlyFixed = matchingFixed.length > 0;
        const isSchoolWide = matchingFixed.some(c => !c.className || c.className === 'ALL' || c.className === 'ALL_CLASSES' || c.className === 'TOAN_TRUONG');
        const isGradeWide = matchingFixed.some(c => c.className?.startsWith('KHOI_') || c.className?.startsWith('GRADE_'));

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 print:hidden p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden border border-gray-100">
              <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                <div>
                  <h3 className="text-base font-bold text-gray-900">
                    Chỉnh sửa tiết học
                  </h3>
                  <p className="text-xs text-gray-500 font-medium">
                    Lớp <span className="font-bold text-teal-700">{editingCell.cls}</span> &bull; {DAYS[editingCell.dayIdx]} &bull; {PERIODS[editingCell.periodIdx]}
                  </p>
                </div>
                <button 
                  onClick={() => setEditingCell(null)}
                  className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="p-6 space-y-4">
                {/* Trạng thái Ghim cố định */}
                {isCurrentlyFixed ? (
                  <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs">
                    <div className="flex items-center gap-1.5 font-bold mb-1">
                      <span>📌</span>
                      <span>Tiết học này đang được KHÓA CỐ ĐỊNH!</span>
                    </div>
                    <p className="text-amber-700 leading-relaxed mb-3">
                      {isSchoolWide ? 'Phạm vi: Cố định toàn trường (Chào cờ, Sinh hoạt lớp...)' : isGradeWide ? 'Phạm vi: Cố định theo khối' : `Phạm vi: Cố định riêng Lớp ${editingCell.cls}`}
                    </p>
                    
                    {/* Các nút bấm bỏ ghim ngay trong modal */}
                    <div className="flex flex-wrap gap-2">
                      {isSchoolWide ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              onTogglePin?.(editingCell.cls, editingCell.dayIdx, editingCell.periodIdx, 'UNPIN', 'ALL');
                              setEditingCell(null);
                            }}
                            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-md text-xs font-semibold shadow-xs flex items-center gap-1 transition-colors"
                          >
                            🔓 Bỏ ghim TOÀN TRƯỜNG tiết này
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onTogglePin?.(editingCell.cls, editingCell.dayIdx, editingCell.periodIdx, 'UNPIN', 'CLASS');
                              setEditingCell(null);
                            }}
                            className="px-3 py-1.5 bg-white border border-red-300 hover:bg-red-50 text-red-700 rounded-md text-xs font-semibold shadow-xs flex items-center gap-1 transition-colors"
                          >
                            🔓 Chỉ bỏ ghim riêng Lớp {editingCell.cls}
                          </button>
                        </>
                      ) : isGradeWide ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              onTogglePin?.(editingCell.cls, editingCell.dayIdx, editingCell.periodIdx, 'UNPIN', 'ALL');
                              setEditingCell(null);
                            }}
                            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-md text-xs font-semibold shadow-xs flex items-center gap-1 transition-colors"
                          >
                            🔓 Bỏ ghim TOÀN KHỐI tiết này
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onTogglePin?.(editingCell.cls, editingCell.dayIdx, editingCell.periodIdx, 'UNPIN', 'CLASS');
                              setEditingCell(null);
                            }}
                            className="px-3 py-1.5 bg-white border border-red-300 hover:bg-red-50 text-red-700 rounded-md text-xs font-semibold shadow-xs flex items-center gap-1 transition-colors"
                          >
                            🔓 Chỉ bỏ ghim riêng Lớp {editingCell.cls}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            onTogglePin?.(editingCell.cls, editingCell.dayIdx, editingCell.periodIdx, 'UNPIN', 'CLASS');
                            setEditingCell(null);
                          }}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-md text-xs font-semibold shadow-xs flex items-center gap-1 transition-colors"
                        >
                          🔓 Bỏ ghim tiết cố định này (Giải phóng ô)
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600">
                    <span>Ô này hiện là tiết tự do.</span>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          onTogglePin?.(editingCell.cls, editingCell.dayIdx, editingCell.periodIdx, 'PIN', 'CLASS', editSubject, editTeacher);
                          setEditingCell(null);
                        }}
                        className="px-2.5 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded text-xs font-medium flex items-center gap-1 transition-colors"
                      >
                        📌 Ghim riêng lớp
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onTogglePin?.(editingCell.cls, editingCell.dayIdx, editingCell.periodIdx, 'PIN', 'ALL', editSubject, editTeacher);
                          setEditingCell(null);
                        }}
                        className="px-2.5 py-1 bg-teal-700 hover:bg-teal-800 text-white rounded text-xs font-medium flex items-center gap-1 transition-colors"
                      >
                        🏫 Ghim toàn trường
                      </button>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Môn học</label>
                  <input
                    type="text"
                    value={editSubject}
                    onChange={(e) => setEditSubject(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    placeholder="Ví dụ: Toán, Ngữ Văn, HĐTN..."
                  />
                  <p className="text-[11px] text-gray-400 mt-1">Để trống môn học để xóa tiết học này khỏi ô.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Giáo viên phụ trách</label>
                  <input
                    type="text"
                    value={editTeacher}
                    onChange={(e) => setEditTeacher(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    placeholder="Tên giáo viên hoặc để trống"
                  />
                </div>
              </div>

              <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 flex justify-between items-center rounded-b-xl">
                <div>
                  {editSubject && (
                    <button
                      type="button"
                      className="text-xs text-red-600 hover:text-red-700 font-medium hover:underline"
                      onClick={() => {
                        setEditSubject('');
                        setEditTeacher('');
                      }}
                    >
                      Xóa trắng ô
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="px-4 py-2 border border-gray-300 shadow-xs text-xs font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                    onClick={() => setEditingCell(null)}
                  >
                    Đóng
                  </button>
                  <button
                    type="button"
                    className="px-4 py-2 text-xs font-semibold rounded-lg text-white bg-teal-600 hover:bg-teal-700 shadow-xs transition-colors"
                    onClick={handleSave}
                  >
                    Lưu thay đổi
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default ClassTimetable;
