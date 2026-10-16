import React, { useState } from 'react';
import { TimetableGrid, ClassSession, ShiftType, Constraint } from '../types';
import { DAYS, PERIODS, CLASSES, isValidSlot, isSlotValidForClass, SHIFT_OPTIONS, isPeriodInShift } from '../constants';
import { getTargetClassesForConstraint } from '../services/schedulerEngine';

interface Props {
  data: TimetableGrid;
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

const TimetableGridDisplay: React.FC<Props> = ({ 
  data, 
  onEditCell, 
  shift, 
  onShiftChange, 
  constraints, 
  classes,
  onTogglePin
}) => {
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
    const session = data[cls]?.[dayIdx]?.[periodIdx];
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

  return (
    <div className="overflow-x-auto bg-white shadow rounded-lg p-4 relative">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4 border-b pb-3">
        <h2 className="text-xl font-bold uppercase text-primary text-center sm:text-left">
          Thời khóa biểu tổng hợp các lớp
          {currentShift === 'MORNING' && <span className="text-sm font-normal text-teal-700 ml-2">(Buổi Sáng)</span>}
          {currentShift === 'AFTERNOON' && <span className="text-sm font-normal text-amber-700 ml-2">(Buổi Chiều)</span>}
        </h2>

        {/* Bộ chọn buổi học (Shift Switcher) */}
        <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg border border-gray-200 print:hidden shadow-sm">
          <span className="text-xs font-semibold text-gray-500 px-2 flex items-center gap-1">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
            Buổi học:
          </span>
          {SHIFT_OPTIONS.map(opt => {
            const active = currentShift === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleShiftSelect(opt.id)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
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
      </div>

      {/* Dynamic Classes & Columns calculation */}
      {(() => {
        const displayClasses = classes && classes.length > 0 ? classes : (
          Object.keys(data).length > 0 ? Object.keys(data).sort((a, b) => a.localeCompare(b, 'vi', { numeric: true })) : CLASSES
        );
        const gridColsStyle = { gridTemplateColumns: `80px 100px repeat(${displayClasses.length}, minmax(80px, 1fr))` };
        const containerMinW = Math.max(1200, 180 + displayClasses.length * 85);

        return (
          <div className="border border-gray-300" style={{ minWidth: `${containerMinW}px` }}>
            <div className="grid divide-x divide-gray-300 bg-primary text-white sticky top-0 z-10" style={gridColsStyle}>
              <div className="font-bold p-2 text-center flex items-center justify-center">Thứ</div>
              <div className="font-bold p-2 text-center flex items-center justify-center">Tiết</div>
              {displayClasses.map(cls => (
                <div key={cls} className="font-bold p-2 text-center">{cls}</div>
              ))}
            </div>

            {DAYS.map((day, dayIdx) => {
              // Lọc các tiết hợp lệ trong ngày thỏa mãn ca/buổi học đang chọn
              const validPeriodsInDay = PERIODS.map((_, p) => p).filter(
                p => isValidSlot(dayIdx, p, constraints) && isPeriodInShift(p, currentShift)
              );
              if (validPeriodsInDay.length === 0) return null;

              const firstPeriodInDay = validPeriodsInDay[0];
              const lastPeriodInDay = validPeriodsInDay[validPeriodsInDay.length - 1];

              return (
                <React.Fragment key={day}>
                  {validPeriodsInDay.map((periodIdx) => {
                    const period = PERIODS[periodIdx];
                    const isDayEnd = periodIdx === lastPeriodInDay;
                    const isDayStart = periodIdx === firstPeriodInDay;

                    return (
                      <div key={`${day}-${period}`} className={`grid divide-x divide-gray-300 ${isDayEnd ? 'border-b-4 border-gray-800' : (periodIdx === 4 || periodIdx === 7 ? 'border-b-4 border-gray-400' : 'border-b border-gray-200')}`} style={gridColsStyle}>
                        
                        {/* Day Column */}
                        {isDayStart ? (
                          <div className="p-2 flex items-center justify-center font-bold bg-gray-100 border-r text-sm">
                            {day}
                            {currentShift === 'AFTERNOON' && (
                              <>
                                <br />
                                <span className="text-[11px] font-normal text-gray-500">(Chiều)</span>
                              </>
                            )}
                          </div>
                        ) : (
                          <div className="p-2 flex items-center justify-center bg-gray-50 border-r text-transparent text-xs select-none">
                            {day}
                          </div>
                        )}

                        <div className="p-2 flex items-center justify-center font-medium text-gray-600 bg-gray-50 text-center text-sm">
                          {period}
                        </div>

                        {displayClasses.map(cls => {
                          const session = data[cls]?.[dayIdx]?.[periodIdx];
                          const isSlotValid = isSlotValidForClass(cls, dayIdx, periodIdx, constraints);
                          if (!isSlotValid) {
                            return (
                              <div
                                key={cls}
                                className="p-2 text-xs flex flex-col justify-center min-h-[50px] text-center bg-gray-100/80 border-b-transparent text-gray-400 select-none"
                                title={`Lớp ${cls} nghỉ (không học tiết này do lịch học sáng chỉ 4 tiết khi có ca chiều)`}
                              >
                                <span className="text-[11px] font-medium text-gray-400">Nghỉ</span>
                              </div>
                            );
                          }

                          const isFixed = constraints?.some(c => {
                            if (c.type !== 'FIXED_SESSION') return false;
                            if (c.day !== dayIdx || c.period !== periodIdx) return false;
                            if (!c.className || c.className === 'ALL' || c.className === 'ALL_CLASSES' || c.className === 'TOAN_TRUONG') return true;
                            if (c.className.startsWith('KHOI_') || c.className.startsWith('GRADE_')) {
                              const g = c.className.replace(/^(KHOI_|GRADE_)/, '');
                              return cls.startsWith(g) || cls.startsWith(`Lớp ${g}`);
                            }
                            return c.className === cls;
                          });

                          return (
                            <div 
                              key={cls} 
                              className={`p-2 text-xs flex flex-col justify-center min-h-[50px] transition-colors text-center border-b-transparent ${
                                isFixed ? 'bg-emerald-50/50' : 'bg-white'
                              } ${onEditCell ? 'cursor-pointer hover:bg-blue-100' : 'hover:bg-blue-50'}`}
                              onClick={() => handleCellClick(cls, dayIdx, periodIdx)}
                            >
                              {session ? (
                                <>
                                  <div className="flex items-center justify-center gap-1">
                                    <span className="font-bold text-gray-800">{session.subject}</span>
                                    {isFixed && (
                                      <span title="Tiết cố định" className="text-[10px] text-emerald-600 font-bold">📌</span>
                                    )}
                                  </div>
                                  <span className="text-gray-500 italic">{session.teacher}</span>
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
                </React.Fragment>
              );
            })}
          </div>
        );
      })()}

      {/* Edit Modal */}
      {editingCell && (() => {
        const matchingFixed = constraints?.filter(c => {
          if (c.type !== 'FIXED_SESSION') return false;
          if (c.day !== editingCell.dayIdx || c.period !== editingCell.periodIdx) return false;
          const targetClasses = getTargetClassesForConstraint(c.className, displayClasses);
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

export default TimetableGridDisplay;
