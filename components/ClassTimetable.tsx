import React, { useState } from 'react';
import { TimetableGrid as TimetableGridType } from '../types';
import { DAYS, PERIODS, CLASSES, isValidSlot } from '../constants';

interface Props {
  schedule: TimetableGridType;
}

const ClassTimetable: React.FC<Props> = ({ schedule }) => {
  const [selectedClass, setSelectedClass] = useState<string>('Tất cả');

  const displayClasses = selectedClass === 'Tất cả' ? CLASSES : [selectedClass];

  return (
    <div className="space-y-8">
      <div className="bg-white shadow rounded-lg p-4 flex items-center justify-between print:hidden">
        <h2 className="text-xl font-bold text-primary">TKB TỪNG LỚP</h2>
        <div>
          <label className="mr-2 font-medium text-gray-700">Chọn lớp:</label>
          <select 
            className="border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:border-primary"
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
          >
            <option value="Tất cả">-- Tất cả các lớp --</option>
            {CLASSES.map(cls => (
              <option key={cls} value={cls}>{cls}</option>
            ))}
          </select>
        </div>
      </div>

      {CLASSES.length === 0 && (
        <div className="bg-white p-8 text-center text-gray-500 rounded-lg shadow">
          Chưa có dữ liệu lớp học.
        </div>
      )}

      {displayClasses.map(cls => (
        <div key={cls} className="bg-white shadow rounded-lg p-6 overflow-x-auto page-break-after">
          <h3 className="text-lg font-bold mb-4 text-center text-primary border-b pb-2">LỚP: {cls}</h3>
          <div className="border border-gray-300 min-w-[600px]">
             <div className="grid grid-cols-[100px_repeat(5,minmax(100px,1fr))] divide-x divide-gray-300">
               <div className="bg-primary text-white font-bold p-2 text-center flex items-center justify-center">Tiết</div>
               {DAYS.map(day => (
                 <div key={day} className="bg-primary text-white font-bold p-2 text-center">{day}</div>
               ))}
             </div>
             
             {PERIODS.map((period, pIdx) => {
               const isRowValid = DAYS.some((_, dIdx) => isValidSlot(dIdx, pIdx));
               if (!isRowValid) return null;

               return (
                <div key={period} className={`grid grid-cols-[100px_repeat(5,minmax(100px,1fr))] divide-x divide-gray-300 ${pIdx === 4 || pIdx === 7 ? 'border-b-4 border-gray-400' : 'border-b border-gray-200'}`}>
                  <div className="bg-gray-50 font-bold p-2 text-center flex items-center justify-center text-gray-600 text-sm">
                    {period}
                  </div>
                  {DAYS.map((day, dIdx) => {
                    const isValid = isValidSlot(dIdx, pIdx);
                    if (!isValid) {
                        return <div key={day} className="bg-gray-200"></div>;
                    }

                    const session = schedule[cls]?.[dIdx]?.[pIdx];
                    return (
                      <div key={day} className="p-2 text-sm flex flex-col justify-center min-h-[60px] hover:bg-blue-50 transition-colors text-center bg-white">
                        {session ? (
                          <>
                            <span className="font-bold text-gray-800">{session.subject || ''}</span>
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
    </div>
  );
};

export default ClassTimetable;
