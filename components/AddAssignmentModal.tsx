import React, { useState } from 'react';
import { InputRow } from '../types';
import { CLASSES } from '../constants';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Omit<InputRow, 'id'>) => void;
  existingTeachers?: string[]; // Autocomplete suggestion
  existingSubjects?: string[]; // Autocomplete suggestion
}

const AddAssignmentModal: React.FC<Props> = ({ isOpen, onClose, onSave, existingTeachers = [], existingSubjects = [] }) => {
  const [teacher, setTeacher] = useState('');
  const [subject, setSubject] = useState('');
  const [className, setClassName] = useState(CLASSES[0]);
  const [sessions, setSessions] = useState(1);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacher || !subject) {
      alert('Vui lòng nhập tên giáo viên và môn học');
      return;
    }
    onSave({
      teacher: teacher.trim(),
      subject: subject.trim(),
      className,
      sessionsPerWeek: Number(sessions)
    });
    // Reset form slightly but keep context if entering multiple
    setTeacher('');
    // setSubject(''); // Keep subject as user might enter same subject for diff class
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden transform transition-all">
        <div className="bg-primary px-6 py-4 flex justify-between items-center">
          <h3 className="text-lg font-bold text-white">Thêm phân công mới</h3>
          <button onClick={onClose} className="text-white hover:text-gray-200">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          
          {/* Teacher Input with Datalist */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tên giáo viên</label>
            <input
              list="teacher-suggestions"
              type="text"
              value={teacher}
              onChange={(e) => setTeacher(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded focus:ring-primary focus:border-primary"
              placeholder="Nhập tên giáo viên..."
              autoFocus
            />
            <datalist id="teacher-suggestions">
              {existingTeachers.map(t => <option key={t} value={t} />)}
            </datalist>
          </div>

          {/* Subject Input with Datalist */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Môn học</label>
            <input
              list="subject-suggestions"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded focus:ring-primary focus:border-primary"
              placeholder="Nhập môn học (Toán, Văn...)"
            />
            <datalist id="subject-suggestions">
              {existingSubjects.map(s => <option key={s} value={s} />)}
            </datalist>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Class Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lớp</label>
              <select
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded focus:ring-primary focus:border-primary"
              >
                {CLASSES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Sessions Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Số tiết / tuần</label>
              <input
                type="number"
                min="1"
                max="10"
                value={sessions}
                onChange={(e) => setSessions(parseInt(e.target.value))}
                className="w-full p-2 border border-gray-300 rounded focus:ring-primary focus:border-primary"
              />
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-white bg-primary rounded hover:bg-teal-800 flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
              Lưu & Tiếp tục
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddAssignmentModal;
