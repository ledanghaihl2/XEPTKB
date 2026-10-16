import React, { useState } from 'react';
import { TimetableGrid, ClassSession, ShiftType, Constraint } from '../types';
import { DAYS, PERIODS, CLASSES, isValidSlot, isSlotValidForClass, SHIFT_OPTIONS, isPeriodInShift } from '../constants';

interface Props {
  data: TimetableGrid;
  onEditCell?: (className: string, day: number, period: number, subject: string, teacher: string) => void;
  shift?: ShiftType;
  onShiftChange?: (shift: ShiftType) => void;
  constraints?: Constraint[];
  classes?: string[];
}

const TimetableGridDisplay: React.FC<Props> = ({ data, onEditCell, shift, onShiftChange, constraints, classes }) => {
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

                          return (
                            <div 
                              key={cls} 
                              className={`p-2 text-xs flex flex-col justify-center min-h-[50px] transition-colors text-center border-b-transparent ${onEditCell ? 'cursor-pointer hover:bg-blue-100 bg-white' : 'hover:bg-blue-50'}`}
                              onClick={() => handleCellClick(cls, dayIdx, periodIdx)}
                            >
                              {session ? (
                                <>
                                  <span className="font-bold text-gray-800">{session.subject}</span>
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

export default TimetableGridDisplay;
