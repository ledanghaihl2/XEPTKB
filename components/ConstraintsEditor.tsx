import React, { useState } from 'react';
import { Constraint, ConstraintType } from '../types';
import { DAYS, PERIODS } from '../constants';

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
  const [isManualTeacher, setIsManualTeacher] = useState(false);

  const handleAdd = () => {
    if (type === 'TEACHER_BUSY' && !selectedTeacher) return;
    if (type === 'FIXED_SESSION' && (!selectedClass || !selectedSubject)) return;

    onAdd({
      type,
      teacher: type === 'TEACHER_BUSY' ? selectedTeacher : undefined,
      className: type === 'FIXED_SESSION' ? selectedClass : undefined,
      subject: type === 'FIXED_SESSION' ? selectedSubject : undefined,
      day: selectedDay,
      period: selectedPeriod,
    });
  };

  const toggleTeacherInputMode = () => {
    setIsManualTeacher(!isManualTeacher);
    // Reset to default from list if switching back to select, or empty if manual
    if (isManualTeacher) {
      // Switching to select
      setSelectedTeacher(teachers[0] || '');
    } else {
      // Switching to manual
      setSelectedTeacher('');
    }
  };

  const getConstraintDescription = (c: Constraint) => {
    const timeStr = `${DAYS[c.day]}, Tiết ${c.period + 1}`;
    if (c.type === 'TEACHER_BUSY') {
      return `Giáo viên ${c.teacher} bận vào ${timeStr}`;
    } else {
      return `Lớp ${c.className} phải học ${c.subject} vào ${timeStr}`;
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-bold mb-6 text-primary uppercase">Cấu hình Ràng buộc</h2>
      
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
              className="w-full p-2 border border-gray-300 rounded shadow-sm focus:border-primary focus:ring-1 focus:ring-primary"
            >
              <option value="TEACHER_BUSY">Giáo viên bận (Teacher Busy)</option>
              <option value="FIXED_SESSION">Tiết cố định (Fixed Session)</option>
            </select>
          </div>

          {/* Dynamic Selectors */}
          {type === 'TEACHER_BUSY' ? (
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
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Lớp</label>
                <select 
                    value={selectedClass}
                    onChange={e => setSelectedClass(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded shadow-sm"
                >
                  {classes.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Môn học</label>
                <select 
                    value={selectedSubject}
                    onChange={e => setSelectedSubject(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded shadow-sm"
                >
                  {subjects.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </>
          )}

          {/* Time Selectors */}
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tiết</label>
            <select 
              value={selectedPeriod}
              onChange={e => setSelectedPeriod(Number(e.target.value))}
              className="w-full p-2 border border-gray-300 rounded shadow-sm"
            >
              {PERIODS.map((p, i) => <option key={i} value={i}>Tiết {p}</option>)}
            </select>
          </div>

        </div>
        
        <button 
          onClick={handleAdd}
          className="bg-primary text-white px-4 py-2 rounded hover:bg-teal-800 transition-colors flex items-center gap-2"
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
          {constraints.map(c => (
            <div key={c.id} className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded shadow-sm hover:border-blue-300 transition-colors">
              <div className="flex items-center gap-3">
                <span className={`px-2 py-1 text-xs font-bold rounded uppercase ${c.type === 'TEACHER_BUSY' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                  {c.type === 'TEACHER_BUSY' ? 'GV Bận' : 'Cố định'}
                </span>
                <span className="text-gray-800">{getConstraintDescription(c)}</span>
              </div>
              <button 
                onClick={() => onRemove(c.id)}
                className="text-gray-400 hover:text-red-600 transition-colors p-1"
                title="Xóa"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ConstraintsEditor;