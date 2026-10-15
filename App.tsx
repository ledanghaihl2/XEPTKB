import React, { useState, useEffect, useMemo, useRef } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { InputRow, TimetableGrid, ScheduleResult, Constraint, TimetableVersion } from './types';
import { SAMPLE_DATA } from './constants';
import { generateSchedule } from './services/schedulerEngine';
import { exportScheduleToExcel } from './services/excelExporter';
import { parseExcelData } from './services/excelImporter';
import TimetableGridDisplay from './components/TimetableGrid';
import TeacherTimetable from './components/TeacherTimetable';
import ClassTimetable from './components/ClassTimetable';
import Reports from './components/Reports';
import ConstraintsEditor from './components/ConstraintsEditor';
import AddAssignmentModal from './components/AddAssignmentModal';
import { VersionManagerModal } from './components/VersionManagerModal';
import { SupabaseConfigModal } from './components/SupabaseConfigModal';
import { GeminiAssistantModal } from './components/GeminiAssistantModal';
import { isSupabaseConfigured } from './services/supabaseClient';
import { isGeminiConfigured, getGeminiModel } from './services/geminiService';
import {
  fetchAssignmentsSupabase,
  saveAssignmentsSupabase,
  fetchConstraintsSupabase,
  saveConstraintsSupabase,
  fetchVersionsSupabase,
  saveVersionSupabase,
  deleteVersionSupabase
} from './services/supabaseService';

// Icons
const IconTable = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h18v18H3zM21 9H3M21 15H3M12 3v18"/></svg>;
const IconReport = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>;
const IconRefresh = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>;
const IconPrint = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>;
const IconExcel = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M8 13h8"/><path d="M8 17h8"/><path d="M10 9h4"/></svg>;
const IconImport = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>;
const IconSettings = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
const IconPlus = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
const IconZip = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8v13H3V3h13l5 5z"/><path d="M12 12v6"/><path d="M9 15h6"/><path d="M9 3v5h6"/></svg>;

const STORAGE_KEY_DATA = 'scheduler_input_data';
const STORAGE_KEY_CONSTRAINTS = 'scheduler_constraints';
const STORAGE_KEY_SCHEDULE = 'scheduler_saved_schedule';
const STORAGE_KEY_VERSIONS = 'scheduler_saved_versions';

function App() {
  const [activeTab, setActiveTab] = useState<'schedule' | 'class_schedule' | 'teacher_schedule' | 'reports' | 'constraints'>('schedule');
  
  // Load data from LocalStorage if present
  const [data, setData] = useState<InputRow[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_DATA);
      return saved ? JSON.parse(saved) : SAMPLE_DATA;
    } catch {
      return SAMPLE_DATA;
    }
  });

  const [constraints, setConstraints] = useState<Constraint[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CONSTRAINTS);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [schedule, setSchedule] = useState<TimetableGrid>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SCHEDULE);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [versions, setVersions] = useState<TimetableVersion[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_VERSIONS);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [unassigned, setUnassigned] = useState<InputRow[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [showSupabaseModal, setShowSupabaseModal] = useState(false);
  const [showGeminiModal, setShowGeminiModal] = useState(false);
  const [isHasSupabase, setIsHasSupabase] = useState<boolean>(() => isSupabaseConfigured());
  const [isHasGemini, setIsHasGemini] = useState<boolean>(() => isGeminiConfigured());
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleApplyParsedData = (newAssignments: InputRow[], newConstraints: Constraint[]) => {
    let updatedData = [...data];
    if (newAssignments.length > 0) {
      updatedData = [...updatedData, ...newAssignments];
      setData(updatedData);
    }
    let updatedConstraints = [...constraints];
    if (newConstraints.length > 0) {
      updatedConstraints = [...updatedConstraints, ...newConstraints];
      setConstraints(updatedConstraints);
    }
    handleGenerate(updatedData);
  };

  // Auto-sync state with Supabase Cloud DB on mount if configured
  useEffect(() => {
    const syncFromSupabase = async () => {
      if (!isSupabaseConfigured()) return;
      console.log('⚡ Đang đồng bộ dữ liệu từ Supabase Cloud Database...');
      const cloudAssignments = await fetchAssignmentsSupabase();
      if (cloudAssignments && cloudAssignments.length > 0) {
        setData(cloudAssignments);
      }

      const cloudConstraints = await fetchConstraintsSupabase();
      if (cloudConstraints) {
        setConstraints(cloudConstraints);
      }

      const cloudVersions = await fetchVersionsSupabase();
      if (cloudVersions) {
        setVersions(cloudVersions);
      }
    };

    syncFromSupabase();
  }, [isHasSupabase]);

  // Auto-save state to LocalStorage & Supabase DB
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_DATA, JSON.stringify(data));
      if (isSupabaseConfigured()) {
        saveAssignmentsSupabase(data);
      }
    } catch (err) {
      console.warn('Lỗi khi lưu dữ liệu phân công:', err);
    }
  }, [data]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_CONSTRAINTS, JSON.stringify(constraints));
      if (isSupabaseConfigured()) {
        saveConstraintsSupabase(constraints);
      }
    } catch (err) {
      console.warn('Lỗi khi lưu dữ liệu ràng buộc:', err);
    }
  }, [constraints]);

  useEffect(() => {
    try {
      if (Object.keys(schedule).length > 0) {
        localStorage.setItem(STORAGE_KEY_SCHEDULE, JSON.stringify(schedule));
      }
    } catch (err) {
      console.warn('Lỗi khi lưu thời khóa biểu:', err);
    }
  }, [schedule]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_VERSIONS, JSON.stringify(versions));
    } catch (err) {
      console.warn('Lỗi khi lưu lịch sử phiên bản:', err);
    }
  }, [versions]);

  // Handlers for Version Management
  const handleSaveCurrentVersion = (name: string) => {
    const newVer: TimetableVersion = {
      id: 'ver_' + Date.now(),
      name,
      createdAt: new Date().toLocaleString('vi-VN'),
      data: [...data],
      constraints: [...constraints],
      schedule: { ...schedule },
      unassigned: [...unassigned]
    };
    const updated = [newVer, ...versions];
    setVersions(updated);
    if (isSupabaseConfigured()) {
      saveVersionSupabase(newVer);
    }
    alert(`Đã lưu thành công phiên bản "${name}" vào ${isSupabaseConfigured() ? 'Supabase Database & LocalStorage' : 'LocalStorage'}!`);
  };

  const handleLoadVersion = (version: TimetableVersion) => {
    setData(version.data || []);
    setConstraints(version.constraints || []);
    setSchedule(version.schedule || {});
    setUnassigned(version.unassigned || []);
    alert(`Đã kích hoạt phiên bản "${version.name}"!`);
  };

  const handleDeleteVersion = (id: string) => {
    setVersions(prev => prev.filter(v => v.id !== id));
    if (isSupabaseConfigured()) {
      deleteVersionSupabase(id);
    }
  };

  const handleRenameVersion = (id: string, newName: string) => {
    setVersions(prev => prev.map(v => v.id === id ? { ...v, name: newName } : v));
  };

  const handleImportVersions = (newItems: TimetableVersion[]) => {
    setVersions(prev => [...newItems, ...prev]);
  };

  // Listen to network status change
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Derived unique lists for dropdowns
  const uniqueTeachers = useMemo(() => Array.from(new Set(data.map(r => r.teacher))).sort(), [data]);
  const uniqueClasses = useMemo(() => Array.from(new Set(data.map(r => r.className))).sort(), [data]);
  const uniqueSubjects = useMemo(() => Array.from(new Set(data.map(r => r.subject))).sort(), [data]);

  const handleGenerate = (currentData = data) => {
    setIsGenerating(true);
    // Timeout to allow UI to render loading state
    setTimeout(() => {
      const result: ScheduleResult = generateSchedule(currentData, constraints);
      setSchedule(result.timetable);
      setUnassigned(result.unassigned);
      setIsGenerating(false);
      
      // Auto switch to schedule tab if on settings
      if (activeTab === 'constraints') setActiveTab('schedule');
    }, 100);
  };

  useEffect(() => {
    // Generate schedule on initial load if no saved schedule
    if (Object.keys(schedule).length === 0) {
      handleGenerate(data);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  const handleResetSampleData = () => {
    if (window.confirm('Thầy/Cô có chắc chắn muốn khôi phục lại dữ liệu mẫu ban đầu? Toàn bộ phân công và ràng buộc đã nhập sẽ được đặt lại.')) {
      setData(SAMPLE_DATA);
      setConstraints([]);
      localStorage.removeItem(STORAGE_KEY_DATA);
      localStorage.removeItem(STORAGE_KEY_CONSTRAINTS);
      localStorage.removeItem(STORAGE_KEY_SCHEDULE);
      handleGenerate(SAMPLE_DATA);
    }
  };

  const handleAddConstraint = (c: Omit<Constraint, 'id'>) => {
    const newConstraint = { ...c, id: Math.random().toString(36).substr(2, 9) };
    setConstraints([...constraints, newConstraint]);
  };

  const handleRemoveConstraint = (id: string) => {
    setConstraints(constraints.filter(c => c.id !== id));
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportExcel = () => {
    exportScheduleToExcel(schedule, data);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsGenerating(true);
      const result = await parseExcelData(file);

      // Reset input để có thể chọn lại cùng 1 file nếu cần
      if (fileInputRef.current) fileInputRef.current.value = '';

      if (result.mode === 'TIMETABLE_GRID' && result.schedule) {
        setSchedule(result.schedule);
        setData(result.data);
        setUnassigned(result.unassigned || []);
        setIsGenerating(false);
        setActiveTab('schedule');

        if (result.conflicts && result.conflicts.length > 0) {
          const conflictPreview = result.conflicts.slice(0, 4).join('\n• ');
          const extra = result.conflicts.length > 4 ? `\n... và ${result.conflicts.length - 4} vị trí trùng khác.` : '';
          alert(`✅ Đã nhập thành công Thời khóa biểu từ Excel!\n📊 Tổng cộng: ${result.data.length} nhóm môn học được tự động tính toán và đồng bộ.\n\n⚠️ CẢNH BÁO TRÙNG LỊCH GIÁO VIÊN (${result.conflicts.length} tiết):\n• ${conflictPreview}${extra}\n\nThầy/Cô vui lòng kiểm tra và điều chỉnh các tiết bị trùng.`);
        } else {
          alert(`✅ Đã nhập thành công toàn bộ Thời khóa biểu đã chỉnh sửa từ Excel!\n📊 Tổng cộng: ${result.data.length} phân công chuyên môn đã được tự động tính toán và đồng bộ vào hệ thống.`);
        }
      } else {
        setData(result.data);
        alert(`✅ Đã nhập thành công ${result.data.length} dòng dữ liệu phân công! Đang tự động xếp thời khóa biểu tối ưu...`);
        handleGenerate(result.data);
      }
    } catch (err: any) {
      alert(typeof err === 'string' ? err : (err?.message || 'Lỗi khi đọc file Excel.'));
      setIsGenerating(false);
    }
  };

  const handleSaveManualAssignment = (newRow: Omit<InputRow, 'id'>) => {
    const newItem: InputRow = {
      ...newRow,
      id: Date.now() + Math.random() // simple unique ID
    };
    const newData = [...data, newItem];
    setData(newData);
    handleGenerate(newData);
    setShowAddModal(false);
  };

  const handleExportZip = () => {
    // Tải xuống file mã nguồn đã được tạo sẵn trên máy chủ (public/source_code.zip)
    const link = document.createElement("a");
    link.href = "/source_code.zip";
    link.download = "source_code.zip";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      {/* Header */}
      <header className="bg-primary text-white p-4 shadow-md sticky top-0 z-50 print:hidden">
        <div className="container mx-auto flex flex-col md:flex-row justify-between items-center">
          <div className="flex items-center gap-3 mb-4 md:mb-0">
            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-primary font-bold text-xl">
              S
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold leading-tight">Smart Scheduler Pro</h1>
                {isOnline ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-200 border border-emerald-400/30" title="Ứng dụng đang kết nối Internet">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    Trực tuyến
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-200 border border-amber-400/30" title="Ứng dụng đang chạy hoàn toàn Ngoại tuyến">
                    <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                    Ngoại tuyến (Sẵn sàng)
                  </span>
                )}
                {isHasSupabase && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-teal-400/20 text-teal-200 border border-teal-300/30" title="Đã kết nối Supabase Cloud Database">
                    ⚡ Supabase DB
                  </span>
                )}
                {isHasGemini && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-purple-500/25 text-purple-200 border border-purple-400/30" title={`Google AI Studio (${getGeminiModel()}) sẵn sàng`}>
                    ✨ Gemini AI
                  </span>
                )}
              </div>
              <p className="text-xs text-blue-100 opacity-80">Hệ thống xếp thời khóa biểu thông minh (Google Gemini AI + Supabase Cloud + Offline PWA)</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 flex-wrap justify-center">
             <button 
              onClick={() => setShowGeminiModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-purple-600 via-indigo-600 to-teal-600 hover:from-purple-700 hover:to-teal-700 text-white rounded shadow-md transition-all text-sm font-bold border border-white/20 animate-pulse hover:animate-none"
              title="Mở Trợ lý AI Gemini 2.5 Pro (Cố vấn sư phạm, gỡ rối xung đột & bóc tách ngôn ngữ)"
            >
              <span className="text-base">✨</span>
              Trợ lý AI Gemini
              {unassigned.length > 0 && (
                <span className="ml-1 bg-rose-500 text-white text-xs px-1.5 py-0.2 rounded-full font-bold">
                  {unassigned.length} kẹt
                </span>
              )}
            </button>

             <button 
              onClick={() => setShowSupabaseModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-800 hover:bg-emerald-900 border border-emerald-500/30 text-emerald-100 rounded shadow transition-colors text-sm font-medium"
              title="Cấu hình thông số kết nối Supabase Database"
            >
              <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="currentColor"><path d="M11.5 2L2 13.5h9L9.5 22 19 10.5h-9L11.5 2z"/></svg>
              Cấu hình Supabase
            </button>

             <button 
              onClick={() => setShowVersionModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded shadow transition-colors text-sm font-medium"
              title="Quản lý lịch sử và các bản TKB đã lưu"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="9"/></svg>
              Quản lý phiên bản
              {versions.length > 0 && (
                <span className="ml-1 bg-white/20 text-white text-xs px-1.5 py-0.2 rounded-full font-bold">
                  {versions.length}
                </span>
              )}
            </button>

             <button 
              onClick={() => handleGenerate(data)}
              className="flex items-center gap-2 px-3 py-2 bg-secondary hover:bg-yellow-600 text-white rounded shadow transition-colors text-sm font-medium"
              disabled={isGenerating}
            >
              <IconRefresh />
              {isGenerating ? 'Đang xếp...' : 'Xếp lại'}
            </button>

            <button 
              onClick={handleResetSampleData}
              className="flex items-center gap-1.5 px-3 py-2 bg-rose-700/80 hover:bg-rose-700 text-white rounded shadow transition-colors text-sm font-medium"
              title="Đặt lại phân công và thời khóa biểu về dữ liệu mẫu ban đầu"
            >
              Khôi phục dữ liệu mẫu
            </button>
            
            <button 
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded shadow transition-colors text-sm font-medium"
            >
              <IconPlus />
              Thêm phân công
            </button>

            {/* Hidden Input for Import */}
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept=".xlsx, .xls"
              onChange={handleFileChange}
            />
            <button 
              onClick={handleImportClick}
              className="flex items-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded shadow transition-colors text-sm font-medium"
              title="Nhập file Excel: Tự động nhận diện file Thời khóa biểu đã chỉnh sửa (Sheet TKB Lớp) hoặc Bảng phân công môn học"
            >
              <IconImport />
              Nhập Excel (TKB / Phân công)
            </button>
            <button
              onClick={() => {
                const XLSX = (window as any).XLSX;
                if (!XLSX) return;
                
                const exportData = data.length > 0 ? data.map(row => ({
                  'Lớp': row.className,
                  'Môn': row.subject,
                  'Giáo viên': row.teacher,
                  'Số tiết': row.sessionsPerWeek
                })) : [
                  { 'Lớp': '6A', 'Môn': 'Toán', 'Giáo viên': 'Thầy A', 'Số tiết': 4 },
                  { 'Lớp': '6A', 'Môn': 'Văn', 'Giáo viên': 'Cô B', 'Số tiết': 4 }
                ];

                const wsPhanCong = XLSX.utils.json_to_sheet(exportData);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, wsPhanCong, "PhanCong");

                const uniqueClasses = Array.from(new Set(data.map(d => d.className))).sort();
                const uniqueSubjects = Array.from(new Set(data.map(d => d.subject))).sort();
                const uniqueTeachers = Array.from(new Set(data.map(d => d.teacher))).sort();
                
                const maxLen = Math.max(uniqueClasses.length, uniqueSubjects.length, uniqueTeachers.length);
                const listData = [];
                for (let i = 0; i < maxLen; i++) {
                  listData.push({
                    'Danh sách Lớp': uniqueClasses[i] || '',
                    'Danh sách Môn': uniqueSubjects[i] || '',
                    'Danh sách Giáo viên': uniqueTeachers[i] || ''
                  });
                }
                
                if (listData.length > 0) {
                  const wsDanhSach = XLSX.utils.json_to_sheet(listData);
                  XLSX.utils.book_append_sheet(wb, wsDanhSach, "DanhSach");
                }

                XLSX.writeFile(wb, "FileMau_PhanCong.xlsx");
              }}
              className="flex items-center gap-2 px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded shadow transition-colors text-sm font-medium"
              title="Tải file Excel mẫu"
            >
              Tải file mẫu
            </button>

            <button 
              onClick={handleExportExcel}
              className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded shadow transition-colors text-sm font-medium"
            >
              <IconExcel />
              Xuất Excel
            </button>
            <button 
              onClick={handlePrint}
              className="flex items-center gap-2 px-3 py-2 bg-white/20 hover:bg-white/30 text-white rounded transition-colors text-sm font-medium"
            >
              <IconPrint />
              In/PDF
            </button>
            <button 
              onClick={handleExportZip}
              className="flex items-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded shadow transition-colors text-sm font-medium"
              title="Xuất lưu toàn bộ dự án"
            >
              <IconZip />
              Lưu dự án (ZIP)
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow container mx-auto p-4 md:p-6">
        
        {/* Unassigned Warning */}
        {unassigned.length > 0 && (
          <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded shadow-sm">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-700">
                  <span className="font-bold">Cảnh báo:</span> Có {unassigned.length} tiết chưa thể xếp do xung đột lịch biểu (Giáo viên bận hoặc Lớp kín lịch).
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-6 print:hidden">
          <button
            onClick={() => setActiveTab('schedule')}
            className={`flex items-center gap-2 py-4 px-6 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'schedule'
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <IconTable />
            TKB Tổng hợp
          </button>
          <button
            onClick={() => setActiveTab('class_schedule')}
            className={`flex items-center gap-2 py-4 px-6 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'class_schedule'
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <IconTable />
            TKB Từng lớp
          </button>
          <button
            onClick={() => setActiveTab('teacher_schedule')}
            className={`flex items-center gap-2 py-4 px-6 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'teacher_schedule'
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <IconTable />
            TKB Giáo viên
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            className={`flex items-center gap-2 py-4 px-6 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'reports'
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <IconReport />
            Báo cáo Tổng hợp
          </button>
          <button
            onClick={() => setActiveTab('constraints')}
            className={`flex items-center gap-2 py-4 px-6 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'constraints'
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <IconSettings />
            Cấu hình ràng buộc
          </button>
        </div>

        {/* Views */}
        <div className="animate-fade-in">
          {activeTab === 'schedule' && (
            <div id="print-schedule">
              <TimetableGridDisplay 
                data={schedule} 
                onEditCell={(className, day, period, subject, teacher) => {
                  setSchedule(prev => {
                    const newSchedule = { ...prev };
                    newSchedule[className] = [...prev[className]];
                    newSchedule[className][day] = [...prev[className][day]];
                    
                    if (!subject || subject.trim() === '') {
                      newSchedule[className][day][period] = null;
                    } else {
                      newSchedule[className][day][period] = {
                         day, period, subject, teacher
                      };
                    }
                    return newSchedule;
                  });
                }}
              />
            </div>
          )}

          {activeTab === 'teacher_schedule' && (
            <div id="print-teacher-schedule">
              <TeacherTimetable schedule={schedule} />
            </div>
          )}

          {activeTab === 'class_schedule' && (
            <div id="print-class-schedule">
              <ClassTimetable schedule={schedule} />
            </div>
          )}
          
          {activeTab === 'reports' && (
            <div id="print-reports">
              <Reports rawData={data} schedule={schedule} />
            </div>
          )}

          {activeTab === 'constraints' && (
            <ConstraintsEditor 
              constraints={constraints}
              onAdd={handleAddConstraint}
              onRemove={handleRemoveConstraint}
              teachers={uniqueTeachers}
              classes={uniqueClasses}
              subjects={uniqueSubjects}
            />
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 p-6 text-center text-sm text-gray-500 print:hidden">
        <p>&copy; 2025 Smart Scheduler Pro. Built with React & Tailwind.</p>
      </footer>

      {/* Modals */}
      <AddAssignmentModal 
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSave={handleSaveManualAssignment}
        existingTeachers={uniqueTeachers}
        existingSubjects={uniqueSubjects}
      />

      <VersionManagerModal
        isOpen={showVersionModal}
        onClose={() => setShowVersionModal(false)}
        versions={versions}
        onSaveCurrentVersion={handleSaveCurrentVersion}
        onLoadVersion={handleLoadVersion}
        onDeleteVersion={handleDeleteVersion}
        onRenameVersion={handleRenameVersion}
        onImportVersions={handleImportVersions}
        currentData={data}
        currentConstraints={constraints}
        currentSchedule={schedule}
      />

      <SupabaseConfigModal
        isOpen={showSupabaseModal}
        onClose={() => setShowSupabaseModal(false)}
        onConnectedSuccess={() => setIsHasSupabase(isSupabaseConfigured())}
      />

      <GeminiAssistantModal
        isOpen={showGeminiModal}
        onClose={() => setShowGeminiModal(false)}
        timetable={schedule}
        unassigned={unassigned}
        constraints={constraints}
        rawData={data}
        existingTeachers={uniqueTeachers}
        existingClasses={uniqueClasses}
        existingSubjects={uniqueSubjects}
        onApplyParsedData={handleApplyParsedData}
        onApiKeyUpdated={() => setIsHasGemini(isGeminiConfigured())}
      />
    </div>
  );
}

export default App;
