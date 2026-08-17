import React from 'react';
import { InputRow, TimetableGrid } from '../types';
import { CLASSES, DAYS, PERIODS } from '../constants';

interface Props {
  rawData: InputRow[];
  schedule: TimetableGrid;
}

const Reports: React.FC<Props> = ({ rawData, schedule }) => {
  // Helper for generating Table 1: Teacher Stats
  const generateTeacherStats = () => {
    const stats: Record<string, { subjects: Set<string>, totalSessions: number, classes: Set<string> }> = {};
    
    rawData.forEach(row => {
      if (!stats[row.teacher]) {
        stats[row.teacher] = { subjects: new Set(), totalSessions: 0, classes: new Set() };
      }
      stats[row.teacher].subjects.add(row.subject);
      stats[row.teacher].totalSessions += row.sessionsPerWeek;
      stats[row.teacher].classes.add(row.className);
    });

    return Object.entries(stats).map(([name, data], idx) => ({
      stt: idx + 1,
      name,
      subjects: Array.from(data.subjects).join(', '),
      total: data.totalSessions,
      classCount: data.classes.size,
      note: ''
    }));
  };

  // Helper for Table 2: Class Stats
  const generateClassStats = () => {
    return CLASSES.map((cls, idx) => {
      let total = 0;
      const subjects = new Set<string>();
      
      // Calculate from ACTUAL schedule to ensure accuracy of output
      if (schedule[cls]) {
        schedule[cls].forEach(day => {
          day.forEach(session => {
            if (session) {
              total++;
              subjects.add(session.subject);
            }
          });
        });
      }

      return {
        stt: idx + 1,
        className: cls,
        total,
        subjectCount: subjects.size,
        note: total === 0 ? 'Chưa xếp' : ''
      };
    });
  };

  // Helper for Table 3: Subject Stats
  const generateSubjectStats = () => {
    const stats: Record<string, { total: number, classes: Set<string> }> = {};
    
    rawData.forEach(row => {
      if (!stats[row.subject]) {
        stats[row.subject] = { total: 0, classes: new Set() };
      }
      stats[row.subject].total += row.sessionsPerWeek;
      stats[row.subject].classes.add(row.className);
    });

    return Object.entries(stats).map(([name, data], idx) => ({
      stt: idx + 1,
      name,
      total: data.total,
      classCount: data.classes.size,
      note: ''
    }));
  };

  const teacherStats = generateTeacherStats();
  const classStats = generateClassStats();
  const subjectStats = generateSubjectStats();

  // Shared Table Styles
  const tableContainerClass = "mb-10 bg-white p-6 shadow-sm border border-gray-200";
  const tableClass = "w-full border-collapse border border-black";
  const thClass = "border border-black p-2 bg-gray-100 font-bold text-center";
  const tdClass = "border border-black p-2";
  const tdNumClass = "border border-black p-2 text-right";
  const tdCenterClass = "border border-black p-2 text-center";

  return (
    <div className="max-w-5xl mx-auto p-4 print:p-0">
      <h1 className="text-2xl font-bold text-center mb-8 uppercase">Báo cáo Tổng hợp Thời khóa biểu</h1>

      {/* Table 1 */}
      <div className={tableContainerClass}>
        <h3 className="font-bold text-lg mb-2">Bảng 1: Thống kê số tiết theo giáo viên</h3>
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={thClass}>STT</th>
              <th className={thClass}>Tên giáo viên</th>
              <th className={thClass}>Môn</th>
              <th className={thClass}>Tổng tiết/tuần</th>
              <th className={thClass}>Số lớp dạy</th>
              <th className={thClass}>Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {teacherStats.map(row => (
              <tr key={row.name}>
                <td className={tdCenterClass}>{row.stt}</td>
                <td className={tdClass}>{row.name}</td>
                <td className={tdClass}>{row.subjects}</td>
                <td className={tdNumClass}>{row.total}</td>
                <td className={tdNumClass}>{row.classCount}</td>
                <td className={tdClass}>{row.note}</td>
              </tr>
            ))}
            <tr className="font-bold bg-gray-50">
              <td colSpan={3} className={tdCenterClass}>Tổng cộng</td>
              <td className={tdNumClass}>{teacherStats.reduce((a, b) => a + b.total, 0)}</td>
              <td className={tdNumClass}>-</td>
              <td className={tdClass}></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Spacer for print */}
      <div className="h-8"></div>

      {/* Table 2 */}
      <div className={tableContainerClass}>
        <h3 className="font-bold text-lg mb-2">Bảng 2: Thống kê số tiết theo lớp</h3>
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={thClass}>STT</th>
              <th className={thClass}>Lớp</th>
              <th className={thClass}>Tổng tiết/tuần</th>
              <th className={thClass}>Số môn học</th>
              <th className={thClass}>Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {classStats.map(row => (
              <tr key={row.className}>
                <td className={tdCenterClass}>{row.stt}</td>
                <td className={tdCenterClass}>{row.className}</td>
                <td className={tdNumClass}>{row.total}</td>
                <td className={tdNumClass}>{row.subjectCount}</td>
                <td className={tdClass}>{row.note}</td>
              </tr>
            ))}
            <tr className="font-bold bg-gray-50">
              <td colSpan={2} className={tdCenterClass}>Tổng cộng</td>
              <td className={tdNumClass}>{classStats.reduce((a, b) => a + b.total, 0)}</td>
              <td colSpan={2} className={tdClass}></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Spacer for print */}
      <div className="h-8"></div>

      {/* Table 3 */}
      <div className={tableContainerClass}>
        <h3 className="font-bold text-lg mb-2">Bảng 3: Thống kê số tiết theo môn học</h3>
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={thClass}>STT</th>
              <th className={thClass}>Môn học</th>
              <th className={thClass}>Tổng tiết/tuần</th>
              <th className={thClass}>Số lớp áp dụng</th>
              <th className={thClass}>Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {subjectStats.map(row => (
              <tr key={row.name}>
                <td className={tdCenterClass}>{row.stt}</td>
                <td className={tdClass}>{row.name}</td>
                <td className={tdNumClass}>{row.total}</td>
                <td className={tdNumClass}>{row.classCount}</td>
                <td className={tdClass}>{row.note}</td>
              </tr>
            ))}
            <tr className="font-bold bg-gray-50">
              <td colSpan={2} className={tdCenterClass}>Tổng cộng</td>
              <td className={tdNumClass}>{subjectStats.reduce((a, b) => a + b.total, 0)}</td>
              <td colSpan={2} className={tdClass}></td>
            </tr>
          </tbody>
        </table>
      </div>

    </div>
  );
};

export default Reports;
