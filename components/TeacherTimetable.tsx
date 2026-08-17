import React, { useMemo, useState } from 'react';
import { TimetableGrid } from '../types';
import { DAYS, PERIODS, CLASSES, isValidSlot } from '../constants';

interface Props {
  schedule: TimetableGrid;
}

const TeacherTimetable: React.FC<Props> = ({ schedule }) => {
  const [selectedTeacher, setSelectedTeacher] = useState<string>('Tất cả');

  // Extract unique teachers from the schedule
  const allTeachers = useMemo(() => {
    const teachers = new Set<string>();
    CLASSES.forEach(cls => {
      DAYS.forEach((_, dIdx) => {
        PERIODS.forEach((_, pIdx) => {
          const session = schedule[cls]?.[dIdx]?.[pIdx];
          if (session && session.teacher) {
            teachers.add(session.teacher);
          }
        });
      });
    });
    return Array.from(teachers).sort();
  }, [schedule]);

  const displayTeachers = selectedTeacher === 'Tất cả' ? allTeachers : [selectedTeacher];

  return (
    <div className="space-y-8">
      <div className="bg-white shadow rounded-lg p-4 flex items-center justify-between print:hidden">
        <h2 className="text-xl font-bold text-primary">TKB GIÁO VIÊN</h2>
        <div>
          <label className="mr-2 font-medium text-gray-700">Chọn giáo viên:</label>
          <select 
            className="border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:border-primary"
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

      {allTeachers.length === 0 && (
        <div className="bg-white p-8 text-center text-gray-500 rounded-lg shadow">
          Chưa có dữ liệu thời khóa biểu để hiển thị.
        </div>
      )}

      {displayTeachers.map(teacher => (
        <div key={teacher} className="bg-white shadow rounded-lg p-6 overflow-x-auto page-break-after">
          <h3 className="text-lg font-bold mb-4 text-center text-primary border-b pb-2">GIÁO VIÊN: {teacher}</h3>
          <div className="border border-gray-300 min-w-[600px]">
             <div className="grid grid-cols-[100px_repeat(5,minmax(100px,1fr))] divide-x divide-gray-300">
               <div className="bg-primary text-white font-bold p-2 text-center flex items-center justify-center">Tiết</div>
               {DAYS.map(day => (
                 <div key={day} className="bg-primary text-white font-bold p-2 text-center">{day}</div>
               ))}
             </div>
             
             {PERIODS.map((period, pIdx) => {
               // Only render the row if at least one day has this period as valid
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

                    let foundSession = null;
                    for (const cls of CLASSES) {
                      const session = schedule[cls]?.[dIdx]?.[pIdx];
                      if (session && session.teacher === teacher) {
                        foundSession = { class: cls, subject: session.subject };
                        break; // Teacher can only be in one class at a time
                      }
                    }
                    return (
                      <div key={day} className="p-2 text-sm flex flex-col justify-center min-h-[60px] hover:bg-blue-50 transition-colors text-center bg-white">
                        {foundSession ? (
                          <>
                            <span className="font-bold text-gray-800">{foundSession.class || ''}</span>
                            <span className="text-gray-500">{foundSession.subject || ''}</span>
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

export default TeacherTimetable;
