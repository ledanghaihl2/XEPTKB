import React, { useState } from 'react';
import { TimetableGrid, ClassSession } from '../types';
import { DAYS, PERIODS, CLASSES, isValidSlot } from '../constants';

interface Props {
  data: TimetableGrid;
  onEditCell?: (className: string, day: number, period: number, subject: string, teacher: string) => void;
}

const TimetableGridDisplay: React.FC<Props> = ({ data, onEditCell }) => {
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
      onEditCell(editingCell.cls, editingCell.dayIdx, editingCell.periodIdx, editSubject, editTeacher);
    }
    setEditingCell(null);
  };

  return (
    <div className="overflow-x-auto bg-white shadow rounded-lg p-4 relative">
      <h2 className="text-xl font-bold mb-4 text-center uppercase text-primary">Thời khóa biểu lóp</h2>
      <div className="border border-gray-300 min-w-[1200px]">
        <div className="grid grid-cols-[80px_100px_repeat(11,minmax(80px,1fr))] divide-x divide-gray-300 bg-primary text-white sticky top-0 z-10">
          <div className="font-bold p-2 text-center flex items-center justify-center">Thứ</div>
          <div className="font-bold p-2 text-center flex items-center justify-center">Tiết</div>
          {CLASSES.map(cls => (
            <div key={cls} className="font-bold p-2 text-center">{cls}</div>
          ))}
        </div>

        {DAYS.map((day, dayIdx) => (
          <React.Fragment key={day}>
            {PERIODS.map((period, periodIdx) => {
               const isValid = isValidSlot(dayIdx, periodIdx);
               if (!isValid) return null; // Or render as completely blocked out row, but skipping is cleaner if the whole period across all classes is invalid

               // actually, isValid is based on day and period, not class. 
               // So if it's invalid for this day/period, we can just skip rendering the row for this day!
               // Wait, isValidSlot is identical for all classes!
               
               const isDayEnd = Math.max(...PERIODS.map((_, i) => isValidSlot(dayIdx, i) ? i : -1)) === periodIdx;

               return (
                  <div key={`${day}-${period}`} className={`grid grid-cols-[80px_100px_repeat(11,minmax(80px,1fr))] divide-x divide-gray-300 ${isDayEnd ? 'border-b-4 border-gray-800' : (periodIdx === 4 || periodIdx === 7 ? 'border-b-4 border-gray-400' : 'border-b border-gray-200')}`}>
                    
                    {/* Day Column */}
                    {periodIdx === 0 ? (
                        <div className="p-2 flex items-center justify-center font-bold bg-gray-100 border-r text-sm">
                            {day}
                        </div>
                    ) : periodIdx === 5 ? (
                        <div className="p-2 flex items-center justify-center font-bold bg-gray-100 border-r text-sm">
                            {day} <br/>(Chiều)
                        </div>
                    ) : (
                        <div className="p-2 flex items-center justify-center bg-gray-50 border-r text-transparent text-xs">
                          {day}
                        </div>
                    )}

                    <div className="p-2 flex items-center justify-center font-medium text-gray-600 bg-gray-50 text-center text-sm">
                      {period}
                    </div>

                    {CLASSES.map(cls => {
                      const session = data[cls]?.[dayIdx]?.[periodIdx];
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
        ))}
      </div>

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
