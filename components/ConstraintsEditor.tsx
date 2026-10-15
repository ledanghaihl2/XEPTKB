import React, { useState } from 'react';
import { Constraint, ConstraintType, ShiftType } from '../types';
import { DAYS, PERIODS, SHIFT_OPTIONS } from '../constants';

interface Props {
  constraints: Constraint[];
  onAdd: (c: Omit<Constraint, 'id'>) => void;
  onRemove: (id: string) => void;
  teachers: string[];
  classes: string[];
  subjects: string[];
}

const ConstraintsEditor: React.FC<Props> = ({ 
  constraints, 
  onAdd, 
  onRemove,
  teachers,
  classes,
  subjects 
}) => {
  const [type, setType] = useState<ConstraintType>('TEACHER_BUSY');
  const [selectedTeacher, setSelectedTeacher] = useState(teachers[0] || '');
  const [selectedClass, setSelectedClass] = useState(classes[0] || '');
  const [selectedSubject, setSelectedSubject] = useState(subjects[0] || '');
  const [selectedDay, setSelectedDay] = useState(0);
  const [selectedPeriod, setSelectedPeriod] = useState(0);
  const [busyScope, setBusyScope] = useState<'PERIOD' | 'MORNING' | 'AFTERNOON'>('PERIOD');
  const [selectedShift, setSelectedShift] = useState<ShiftType>('MORNING');
  const [isManualTeacher, setIsManualTeacher] = useState(false);

  const handleAdd = () => {
    if ((type === 'TEACHER_BUSY' || type === 'TEACHER_SHIFT') && !selectedTeacher) return;
    if (type === 'FIXED_SESSION' && (!selectedClass || !selectedSubject)) return;
    if (type === 'CLASS_SHIFT' && !selectedClass) return;

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
    } else if (type === 'FIXED_SESSION') {
      onAdd({
        type: 'FIXED_SESSION',
        className: selectedClass,
        subject: selectedSubject,
        day: selectedDay,
        period: selectedPeriod,
      });
    } else if (type === 'CLASS_SHIFT') {
      onAdd({
        type: 'CLASS_SHIFT',
        className: selectedClass,
        shift: selectedShift,
      });
    } else if (type === 'TEACHER_SHIFT') {
      onAdd({
        type: 'TEACHER_SHIFT',
        teacher: selectedTeacher,
        shift: selectedShift,
      });
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

  const getConstraintDescription = (c: Constraint) => {
    if (c.type === 'CLASS_SHIFT') {
      const shiftName = c.shift === 'MORNING' ? 'Buổi Sáng (Tiết 1 - 5)' : c.shift === 'AFTERNOON' ? 'Buổi Chiều (Tiết 1 - 3)' : 'Cả ngày';
      return `Lớp ${c.className} chỉ học ${shiftName}`;
    }
    if (c.type === 'TEACHER_SHIFT') {
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
    const timeStr = `${DAYS[c.day ?? 0]}, Tiết ${PERIODS[c.period ?? 0] || ((c.period ?? 0) + 1)}`;
    return `Lớp ${c.className} phải học ${c.subject} vào ${timeStr}`;
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-bold mb-6 text-primary uppercase">Cấu hình Ràng buộc & Buổi học</h2>
      
      {/* Form */}
      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mb-8">
        <h3 className="font-bold mb-4 text-gray-700">Thêm ràng buộc mới</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          
          {/* Type Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Loại ràng buộc</label>
            <select 
              value={type} 
              onChange={e => setType(e.target.value as ConstraintType)}
              className="w-full p-2 border border-gray-300 rounded shadow-sm focus:border-primary focus:ring-1 focus:ring-primary font-medium"
            >
              <option value="TEACHER_BUSY">Giáo viên bận (Teacher Busy)</option>
              <option value="FIXED_SESSION">Tiết cố định (Fixed Session)</option>
              <option value="CLASS_SHIFT">Buổi học của lớp (Class Shift)</option>
              <option value="TEACHER_SHIFT">Buổi dạy của giáo viên (Teacher Shift)</option>
            </select>
          </div>

          {/* Dynamic Selectors for Teacher */}
          {(type === 'TEACHER_BUSY' || type === 'TEACHER_SHIFT') && (
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium text-gray-700">Giáo viên</label>
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
                  className="w-full p-2 border border-gray-300 rounded shadow-sm focus:border-primary focus:ring-1 focus:ring-primary"
                />
              ) : (
                <select 
                  value={selectedTeacher}
                  onChange={e => setSelectedTeacher(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded shadow-sm"
                >
                  {teachers.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              )}
            </div>
          )}

          {/* Dynamic Selectors for Class */}
          {(type === 'FIXED_SESSION' || type === 'CLASS_SHIFT') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lớp</label>
              <select 
                value={selectedClass}
                onChange={e => setSelectedClass(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded shadow-sm font-medium"
              >
                {classes.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}

          {/* Dynamic Selectors for Subject */}
          {type === 'FIXED_SESSION' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Môn học</label>
              <select 
                value={selectedSubject}
                onChange={e => setSelectedSubject(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded shadow-sm font-medium"
              >
                {subjects.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}

          {/* Shift Selector for CLASS_SHIFT and TEACHER_SHIFT */}
          {(type === 'CLASS_SHIFT' || type === 'TEACHER_SHIFT') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Chọn buổi</label>
              <select
                value={selectedShift}
                onChange={e => setSelectedShift(e.target.value as ShiftType)}
                className="w-full p-2 border border-gray-300 rounded shadow-sm font-semibold text-primary"
              >
                <option value="MORNING">🌅 Buổi Sáng (Tiết 1 - 5)</option>
                <option value="AFTERNOON">🌇 Buổi Chiều (Tiết 1 - 3)</option>
              </select>
            </div>
          )}

          {/* Scope Selector for TEACHER_BUSY */}
          {type === 'TEACHER_BUSY' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phạm vi bận</label>
              <select
                value={busyScope}
                onChange={e => setBusyScope(e.target.value as any)}
                className="w-full p-2 border border-gray-300 rounded shadow-sm"
              >
                <option value="PERIOD">Từng tiết cụ thể</option>
                <option value="MORNING">Cả buổi sáng</option>
                <option value="AFTERNOON">Cả buổi chiều</option>
              </select>
            </div>
          )}

          {/* Time Selectors for TEACHER_BUSY and FIXED_SESSION */}
          {(type === 'FIXED_SESSION' || (type === 'TEACHER_BUSY')) && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Thứ</label>
              <select 
                value={selectedDay}
                onChange={e => setSelectedDay(Number(e.target.value))}
                className="w-full p-2 border border-gray-300 rounded shadow-sm"
              >
                {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </div>
          )}

          {(type === 'FIXED_SESSION' || (type === 'TEACHER_BUSY' && busyScope === 'PERIOD')) && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tiết</label>
              <select 
                value={selectedPeriod}
                onChange={e => setSelectedPeriod(Number(e.target.value))}
                className="w-full p-2 border border-gray-300 rounded shadow-sm"
              >
                {PERIODS.map((p, i) => <option key={i} value={i}>{p}</option>)}
              </select>
            </div>
          )}

        </div>
        
        <button 
          onClick={handleAdd}
          className="bg-primary text-white px-4 py-2 rounded hover:bg-teal-800 transition-colors flex items-center gap-2 shadow-sm font-medium"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Thêm ràng buộc
        </button>
      </div>

      {/* List */}
      <h3 className="font-bold mb-4 text-gray-700 border-b pb-2">Danh sách ràng buộc đã thiết lập ({constraints.length})</h3>
      {constraints.length === 0 ? (
        <p className="text-gray-500 italic">Chưa có ràng buộc nào.</p>
      ) : (
        <div className="space-y-3">
          {constraints.map(c => {
            let badgeBg = 'bg-blue-100 text-blue-700';
            let badgeLabel = 'Cố định';
            if (c.type === 'TEACHER_BUSY') {
              badgeBg = 'bg-red-100 text-red-700';
              badgeLabel = 'GV Bận';
            } else if (c.type === 'CLASS_SHIFT') {
              badgeBg = 'bg-purple-100 text-purple-700';
              badgeLabel = 'Buổi học lớp';
            } else if (c.type === 'TEACHER_SHIFT') {
              badgeBg = 'bg-amber-100 text-amber-700';
              badgeLabel = 'Ca dạy GV';
            }

            return (
              <div key={c.id} className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded shadow-sm hover:border-blue-300 transition-colors">
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-1 text-xs font-bold rounded uppercase ${badgeBg}`}>
                    {badgeLabel}
                  </span>
                  <span className="text-gray-800 text-sm font-medium">{getConstraintDescription(c)}</span>
                </div>
                <button 
                  onClick={() => onRemove(c.id)}
                  className="text-gray-400 hover:text-red-600 transition-colors p-1"
                  title="Xóa"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ConstraintsEditor;