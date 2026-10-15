import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Constraint, InputRow } from '../types';
import { DAYS } from '../constants';

interface Props {
  classes: string[];
  constraints: Constraint[];
  data: InputRow[];
  onUpdateClassShift?: (className: string, morningDays: number[], afternoonDays: number[]) => void;
  onBatchUpdateClassShifts?: (classes: string[], morningDays: number[], afternoonDays: number[]) => void;
}

export const SchoolShiftMatrix: React.FC<Props> = ({
  classes,
  constraints,
  data,
  onUpdateClassShift,
  onBatchUpdateClassShifts
}) => {
  const [selectedGrade, setSelectedGrade] = useState<string>('ALL');
  
  // State quản lý Dropdown menu áp dụng nhanh theo khối
  const [openBatchGrade, setOpenBatchGrade] = useState<string | null>(null);
  const [batchMorningDays, setBatchMorningDays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [batchAfternoonDays, setBatchAfternoonDays] = useState<number[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Tự động đóng dropdown khi nhấp chuột ra ngoài
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpenBatchGrade(null);
      }
    };
    if (openBatchGrade) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [openBatchGrade]);

  // Trích xuất danh sách Khối lớp tự động từ tên các lớp
  const availableGrades = useMemo(() => {
    const gradeSet = new Set<string>();
    classes.forEach(cls => {
      const match = cls.match(/^(\d+)/);
      if (match) {
        gradeSet.add(match[1]);
      }
    });
    const list = Array.from(gradeSet).sort((a, b) => parseInt(a) - parseInt(b));
    return list.length > 0 ? list : ['6', '7', '8', '9'];
  }, [classes]);

  // Lọc lớp theo khối đang chọn hiển thị
  const filteredClasses = useMemo(() => {
    if (selectedGrade === 'ALL') return classes;
    return classes.filter(cls => cls.startsWith(selectedGrade));
  }, [classes, selectedGrade]);

  // Lấy danh sách lớp mục tiêu cho một khối bất kỳ
  const getTargetClassesForGrade = (gr: string) => {
    if (gr === 'ALL') return classes;
    return classes.filter(cls => cls.startsWith(gr));
  };

  // Ràng buộc ca học Toàn trường nếu có
  const schoolWideConstraint = useMemo(() => {
    return constraints.find(item => 
      item.type === 'SCHOOL_SHIFT' || 
      (item.type === 'CLASS_SHIFT' && (!item.className || item.className === 'ALL' || item.className === 'TOAN_TRUONG'))
    );
  }, [constraints]);

  // Phân tích cấu hình ca học của từng lớp từ danh sách ràng buộc
  const classShiftMap = useMemo(() => {
    const map = new Map<string, { morningDays: number[]; afternoonDays: number[]; constraintId?: string; isSchoolWide?: boolean }>();

    // 1. Phân tích cấu hình mặc định toàn trường (nếu có)
    let defaultMorningDays = [0, 1, 2, 3, 4];
    let defaultAfternoonDays = [0, 1, 2, 3, 4];
    if (schoolWideConstraint) {
      if (schoolWideConstraint.morningDays !== undefined || schoolWideConstraint.afternoonDays !== undefined) {
        defaultMorningDays = schoolWideConstraint.morningDays || [];
        defaultAfternoonDays = schoolWideConstraint.afternoonDays || [];
      } else if (schoolWideConstraint.shift === 'MORNING') {
        defaultMorningDays = [0, 1, 2, 3, 4];
        defaultAfternoonDays = [];
      } else if (schoolWideConstraint.shift === 'AFTERNOON') {
        defaultMorningDays = [];
        defaultAfternoonDays = [0, 1, 2, 3, 4];
      }
    }

    // 2. Gán cho từng lớp: ưu tiên ràng buộc riêng, nếu không có thì kế thừa toàn trường
    classes.forEach(cls => {
      const c = constraints.find(item => item.type === 'CLASS_SHIFT' && item.className === cls);
      if (c) {
        let mDays: number[] = [];
        let aDays: number[] = [];

        if (c.morningDays !== undefined || c.afternoonDays !== undefined) {
          mDays = c.morningDays || [];
          aDays = c.afternoonDays || [];
        } else if (c.shift === 'MORNING') {
          mDays = [0, 1, 2, 3, 4];
          aDays = [];
        } else if (c.shift === 'AFTERNOON') {
          mDays = [];
          aDays = [0, 1, 2, 3, 4];
        } else {
          mDays = [0, 1, 2, 3, 4];
          aDays = [0, 1, 2, 3, 4];
        }

        map.set(cls, { morningDays: mDays, afternoonDays: aDays, constraintId: c.id, isSchoolWide: false });
      } else {
        // Kế thừa từ cấu hình Toàn trường (hoặc mặc định cả tuần)
        map.set(cls, { 
          morningDays: [...defaultMorningDays], 
          afternoonDays: [...defaultAfternoonDays],
          constraintId: schoolWideConstraint?.id,
          isSchoolWide: !!schoolWideConstraint 
        });
      }
    });

    return map;
  }, [classes, constraints, schoolWideConstraint]);

  // Tính số tiết phân công của từng lớp
  const classSessionsMap = useMemo(() => {
    const map = new Map<string, number>();
    classes.forEach(cls => {
      const total = data.filter(r => r.className === cls).reduce((sum, r) => sum + r.sessionsPerWeek, 0);
      map.set(cls, total);
    });
    return map;
  }, [classes, data]);

  // Xử lý bật/tắt nhanh ca học khi click vào ô ma trận
  const handleToggleSlot = (cls: string, dayIdx: number, isMorning: boolean) => {
    if (!onUpdateClassShift) return;
    const current = classShiftMap.get(cls) || { morningDays: [0, 1, 2, 3, 4], afternoonDays: [0, 1, 2, 3, 4] };
    
    let newMorningDays = [...current.morningDays];
    let newAfternoonDays = [...current.afternoonDays];

    if (isMorning) {
      if (newMorningDays.includes(dayIdx)) {
        newMorningDays = newMorningDays.filter(d => d !== dayIdx);
      } else {
        newMorningDays = [...newMorningDays, dayIdx].sort();
      }
    } else {
      if (newAfternoonDays.includes(dayIdx)) {
        newAfternoonDays = newAfternoonDays.filter(d => d !== dayIdx);
      } else {
        newAfternoonDays = [...newAfternoonDays, dayIdx].sort();
      }
    }

    onUpdateClassShift(cls, newMorningDays, newAfternoonDays);
  };

  // Mở menu áp dụng nhanh cho khối
  const handleOpenBatchMenu = (gr: string) => {
    if (openBatchGrade === gr) {
      setOpenBatchGrade(null);
    } else {
      setOpenBatchGrade(gr);
      // Mặc định chọn Sáng T2-T6
      setBatchMorningDays([0, 1, 2, 3, 4]);
      setBatchAfternoonDays([]);
    }
  };

  // Bật/tắt thứ trong bộ chọn nhanh
  const toggleBatchMorningDay = (dayIdx: number) => {
    setBatchMorningDays(prev => 
      prev.includes(dayIdx) ? prev.filter(d => d !== dayIdx) : [...prev, dayIdx].sort()
    );
  };

  const toggleBatchAfternoonDay = (dayIdx: number) => {
    setBatchAfternoonDays(prev => 
      prev.includes(dayIdx) ? prev.filter(d => d !== dayIdx) : [...prev, dayIdx].sort()
    );
  };

  // Áp dụng mẫu nhanh (Preset)
  const applyPreset = (type: 'MORNING_ALL' | 'AFTERNOON_ALL' | 'FULL_DAY' | 'MORNING_AFTERNOON_2') => {
    if (type === 'MORNING_ALL') {
      setBatchMorningDays([0, 1, 2, 3, 4]);
      setBatchAfternoonDays([]);
    } else if (type === 'AFTERNOON_ALL') {
      setBatchMorningDays([]);
      setBatchAfternoonDays([0, 1, 2, 3, 4]);
    } else if (type === 'FULL_DAY') {
      setBatchMorningDays([0, 1, 2, 3, 4]);
      setBatchAfternoonDays([0, 1, 2, 3, 4]);
    } else if (type === 'MORNING_AFTERNOON_2') {
      setBatchMorningDays([0, 1, 2, 3, 4]);
      setBatchAfternoonDays([1, 3]); // Chiều T3, T5
    }
  };

  // Thực hiện áp dụng hàng loạt cho toàn khối
  const handleExecuteBatchApply = (gr: string) => {
    const targetClasses = getTargetClassesForGrade(gr);
    if (targetClasses.length === 0) return;

    if (onBatchUpdateClassShifts) {
      onBatchUpdateClassShifts(targetClasses, batchMorningDays, batchAfternoonDays);
    } else if (onUpdateClassShift) {
      targetClasses.forEach(cls => onUpdateClassShift(cls, batchMorningDays, batchAfternoonDays));
    }

    const gradeLabel = gr === 'ALL' ? 'Toàn trường' : `Khối ${gr}`;
    setToastMessage(`Đã áp dụng mẫu ca học thành công cho ${targetClasses.length} lớp thuộc ${gradeLabel}!`);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);

    setOpenBatchGrade(null);
  };

  // Thống kê tổng số lớp học theo từng buổi cho mỗi thứ
  const shiftStats = useMemo(() => {
    const morningCount: number[] = [0, 0, 0, 0, 0];
    const afternoonCount: number[] = [0, 0, 0, 0, 0];

    classes.forEach(cls => {
      const config = classShiftMap.get(cls);
      if (!config) return;
      for (let d = 0; d < 5; d++) {
        if (config.morningDays.includes(d)) morningCount[d]++;
        if (config.afternoonDays.includes(d)) afternoonCount[d]++;
      }
    });

    return { morningCount, afternoonCount };
  }, [classes, classShiftMap]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden relative">
      {/* Toast thông báo kết quả */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 bg-slate-900 text-white rounded-xl shadow-2xl border border-teal-500/50 text-sm animate-fade-in">
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-teal-500 text-white font-bold text-xs">✓</span>
          <span className="font-medium">{toastMessage}</span>
        </div>
      )}

      {/* Header của Bảng Ma Trận */}
      <div className="p-4 md:p-5 border-b border-gray-200 bg-gradient-to-r from-teal-50/70 via-slate-50 to-blue-50/50">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-teal-600 text-white font-bold text-sm shadow-sm">
                📊
              </span>
              <h3 className="text-base font-bold text-gray-900 uppercase tracking-tight">
                Bảng Ma Trận Ca Học Toàn Trường (School Shift Matrix)
              </h3>
            </div>
            <p className="text-xs text-gray-600 mt-1">
              Theo dõi lịch học ca Sáng & Chiều. Click trực tiếp vào ô để <strong className="text-teal-900">Bật / Tắt nhanh</strong> hoặc bấm <strong className="text-amber-800">⚡▾</strong> tại từng khối để <strong className="text-teal-900">Áp dụng mẫu ca học nhanh</strong> cho toàn khối!
            </p>
            {schoolWideConstraint && (
              <div className="inline-flex items-center gap-2 mt-2 px-3 py-1 rounded-lg bg-teal-100/90 border border-teal-300 text-teal-950 text-xs font-semibold shadow-xs flex-wrap">
                <span className="font-extrabold text-teal-900">🏫 Ca học Toàn trường:</span>
                <span>🌅 Sáng [{schoolWideConstraint.morningDays && schoolWideConstraint.morningDays.length > 0 ? schoolWideConstraint.morningDays.map(d => DAYS[d]).join(', ') : 'Nghỉ'}]</span>
                <span className="text-teal-400 font-normal">|</span>
                <span>🌇 Chiều [{schoolWideConstraint.afternoonDays && schoolWideConstraint.afternoonDays.length > 0 ? schoolWideConstraint.afternoonDays.map(d => DAYS[d]).join(', ') : 'Nghỉ'}]</span>
              </div>
            )}
          </div>

          {/* Bộ lọc Khối lớp kèm Dropdown thao tác nhanh trực tiếp & Nút in */}
          <div className="flex items-center gap-2 flex-wrap" ref={dropdownRef}>
            <span className="text-xs font-semibold text-gray-500">Khối:</span>
            
            <div className="flex bg-white p-0.5 rounded-lg border border-gray-200 shadow-xs relative">
              {['ALL', ...availableGrades].map(gr => {
                const label = gr === 'ALL' ? `Tất cả (${classes.length})` : `Khối ${gr}`;
                const active = selectedGrade === gr;
                const isDropdownOpen = openBatchGrade === gr;

                return (
                  <div key={gr} className="relative inline-flex items-center">
                    {/* Nút lọc khối */}
                    <button
                      type="button"
                      onClick={() => setSelectedGrade(gr)}
                      className={`px-2.5 py-1 text-xs font-medium transition-all ${
                        active
                          ? 'bg-primary text-white shadow-xs font-bold rounded-l-md'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-l-md'
                      }`}
                    >
                      {label}
                    </button>

                    {/* Nút Dropdown thao tác nhanh trực tiếp trên Khối */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenBatchMenu(gr);
                      }}
                      className={`px-1.5 py-1 text-[11px] font-bold border-l transition-colors rounded-r-md ${
                        active
                          ? 'bg-primary/95 text-amber-300 hover:bg-primary border-white/20'
                          : 'text-amber-600 hover:text-amber-800 hover:bg-amber-50 border-gray-200'
                      } ${isDropdownOpen ? 'bg-amber-100 text-amber-900 ring-2 ring-amber-400' : ''}`}
                      title={`⚡ Áp dụng mẫu ca học nhanh cho ${gr === 'ALL' ? 'Toàn trường' : 'Khối ' + gr}`}
                    >
                      ⚡▾
                    </button>

                    {/* Menu Dropdown Thao Tác Nhanh (Gắn trực tiếp vào nút khối) */}
                    {isDropdownOpen && (
                      <div className="absolute top-full right-0 sm:left-0 sm:right-auto mt-2 z-50 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-gray-200 p-4 text-left">
                        {/* Header Dropdown */}
                        <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-gray-100">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-amber-500 text-sm">⚡</span>
                              <h4 className="font-bold text-gray-900 text-xs uppercase">
                                Áp dụng ca học cho: {gr === 'ALL' ? 'Toàn trường' : `Khối ${gr}`}
                              </h4>
                            </div>
                            <p className="text-[11px] text-gray-500 mt-0.5">
                              Đồng bộ cấu hình cho <strong>{getTargetClassesForGrade(gr).length} lớp</strong> ({getTargetClassesForGrade(gr).slice(0, 4).join(', ')}{getTargetClassesForGrade(gr).length > 4 ? '...' : ''})
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setOpenBatchGrade(null)}
                            className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"
                          >
                            ✕
                          </button>
                        </div>

                        {/* Mẫu nhanh 1-chạm (Presets) */}
                        <div className="mb-3">
                          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Mẫu nhanh có sẵn:</label>
                          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                            <button
                              type="button"
                              onClick={() => applyPreset('MORNING_ALL')}
                              className="px-2 py-1 rounded-md bg-teal-50 border border-teal-200 text-teal-800 font-medium hover:bg-teal-100 text-left transition-colors"
                            >
                              🌅 Chỉ học Sáng (T2-T6)
                            </button>
                            <button
                              type="button"
                              onClick={() => applyPreset('AFTERNOON_ALL')}
                              className="px-2 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-800 font-medium hover:bg-amber-100 text-left transition-colors"
                            >
                              🌇 Chỉ học Chiều (T2-T6)
                            </button>
                            <button
                              type="button"
                              onClick={() => applyPreset('MORNING_AFTERNOON_2')}
                              className="px-2 py-1 rounded-md bg-blue-50 border border-blue-200 text-blue-800 font-medium hover:bg-blue-100 text-left transition-colors"
                            >
                              ✨ Sáng T2-T6 + Chiều T3, T5
                            </button>
                            <button
                              type="button"
                              onClick={() => applyPreset('FULL_DAY')}
                              className="px-2 py-1 rounded-md bg-gray-50 border border-gray-200 text-gray-700 font-medium hover:bg-gray-100 text-left transition-colors"
                            >
                              🔄 Cả ngày (T2-T6)
                            </button>
                          </div>
                        </div>

                        {/* Bảng chọn Thứ Sáng & Chiều tùy chỉnh */}
                        <div className="space-y-2.5 bg-gray-50 p-3 rounded-xl border border-gray-200 mb-3.5">
                          {/* Buổi Sáng */}
                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-[11px] font-bold text-teal-900 flex items-center gap-1">
                                <span>🌅</span> Buổi Sáng (Tiết 1-5)
                              </span>
                              <div className="flex items-center gap-1.5 text-[10px]">
                                <button
                                  type="button"
                                  onClick={() => setBatchMorningDays([0, 1, 2, 3, 4])}
                                  className="text-teal-700 hover:underline"
                                >
                                  T2-T6
                                </button>
                                <span className="text-gray-300">|</span>
                                <button
                                  type="button"
                                  onClick={() => setBatchMorningDays([])}
                                  className="text-gray-500 hover:underline"
                                >
                                  Nghỉ
                                </button>
                              </div>
                            </div>
                            <div className="grid grid-cols-5 gap-1">
                              {[0, 1, 2, 3, 4].map(d => {
                                const active = batchMorningDays.includes(d);
                                return (
                                  <button
                                    type="button"
                                    key={d}
                                    onClick={() => toggleBatchMorningDay(d)}
                                    className={`py-1.5 rounded-lg text-xs font-bold transition-all ${
                                      active
                                        ? 'bg-teal-600 text-white shadow-xs scale-102'
                                        : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-100'
                                    }`}
                                  >
                                    {DAYS[d]}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Buổi Chiều */}
                          <div className="pt-2 border-t border-gray-200/80">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-[11px] font-bold text-amber-900 flex items-center gap-1">
                                <span>🌇</span> Buổi Chiều (Tiết 1-3)
                              </span>
                              <div className="flex items-center gap-1.5 text-[10px]">
                                <button
                                  type="button"
                                  onClick={() => setBatchAfternoonDays([0, 1, 2, 3, 4])}
                                  className="text-amber-700 hover:underline"
                                >
                                  T2-T6
                                </button>
                                <span className="text-gray-300">|</span>
                                <button
                                  type="button"
                                  onClick={() => setBatchAfternoonDays([])}
                                  className="text-gray-500 hover:underline"
                                >
                                  Nghỉ
                                </button>
                              </div>
                            </div>
                            <div className="grid grid-cols-5 gap-1">
                              {[0, 1, 2, 3, 4].map(d => {
                                const active = batchAfternoonDays.includes(d);
                                return (
                                  <button
                                    type="button"
                                    key={d}
                                    onClick={() => toggleBatchAfternoonDay(d)}
                                    className={`py-1.5 rounded-lg text-xs font-bold transition-all ${
                                      active
                                        ? 'bg-amber-600 text-white shadow-xs scale-102'
                                        : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-100'
                                    }`}
                                  >
                                    {DAYS[d]}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        {/* Sức chứa và Nút Áp dụng */}
                        <div className="flex items-center justify-between pt-1">
                          <div className="text-[11px] text-gray-600">
                            Sức chứa: <strong className="text-teal-900">{batchMorningDays.length * 5 + batchAfternoonDays.length * 3} tiết</strong> / tuần
                          </div>
                          <button
                            type="button"
                            onClick={() => handleExecuteBatchApply(gr)}
                            className="px-3.5 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 active:scale-95"
                          >
                            <span>⚡ Áp dụng cho {getTargetClassesForGrade(gr).length} lớp</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Nút In Ma trận */}
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-medium shadow-xs flex items-center gap-1.5 transition-colors"
              title="In hoặc xuất PDF Bảng ma trận ca học"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
              In Ma trận
            </button>
          </div>
        </div>

        {/* Chú giải (Legend) */}
        <div className="flex items-center gap-4 mt-3 pt-2.5 border-t border-gray-200/60 text-[11px] text-gray-600 flex-wrap">
          <span className="font-semibold text-gray-700">Chú giải:</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded bg-teal-100 border border-teal-300 inline-block text-center text-[10px] text-teal-800 font-bold leading-3">✓</span>
            <span>Học ca Sáng (Tiết 1-5)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded bg-amber-100 border border-amber-300 inline-block text-center text-[10px] text-amber-800 font-bold leading-3">✓</span>
            <span>Học ca Chiều (Tiết 1-3)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded bg-gray-100 border border-dashed border-gray-300 inline-block text-center text-[10px] text-gray-400 font-bold leading-3">-</span>
            <span>Nghỉ ca học</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Đủ sức chứa tiết</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
            <span>Thiếu sức chứa (Quá tải)</span>
          </span>
        </div>
      </div>

      {/* Bảng Ma Trận Cuộn Ngang */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100 border-b border-gray-200 text-gray-800 text-center font-bold">
              <th rowSpan={2} className="p-3 border-r border-gray-200 sticky left-0 bg-slate-100 z-10 w-20 min-w-[80px]">
                Lớp
              </th>
              <th rowSpan={2} className="p-3 border-r border-gray-200 w-36 min-w-[140px] text-left">
                Phân công / Sức chứa
              </th>
              {DAYS.map(day => (
                <th key={day} colSpan={2} className="p-2 border-r border-gray-200 border-b min-w-[120px] bg-slate-50/80">
                  {day}
                </th>
              ))}
            </tr>
            <tr className="bg-slate-50 border-b border-gray-200 text-center text-[11px] text-gray-600 font-semibold">
              {DAYS.map(day => (
                <React.Fragment key={day}>
                  <th className="py-1 px-2 border-r border-teal-100/60 bg-teal-50/30 text-teal-800">
                    🌅 Sáng
                  </th>
                  <th className="py-1 px-2 border-r border-gray-200 bg-amber-50/30 text-amber-800">
                    🌇 Chiều
                  </th>
                </React.Fragment>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {filteredClasses.length === 0 ? (
              <tr>
                <td colSpan={12} className="p-8 text-center text-gray-400 italic">
                  Không tìm thấy lớp nào phù hợp với bộ lọc khối đã chọn.
                </td>
              </tr>
            ) : (
              filteredClasses.map((cls, idx) => {
                const config = classShiftMap.get(cls) || { morningDays: [0, 1, 2, 3, 4], afternoonDays: [0, 1, 2, 3, 4] };
                const morningDays = config.morningDays;
                const afternoonDays = config.afternoonDays;

                const assignedSessions = classSessionsMap.get(cls) || 0;
                const capacity = (morningDays.length * 5) + (afternoonDays.length * 3);
                const isOverloaded = assignedSessions > capacity;
                const isTight = capacity - assignedSessions <= 2 && !isOverloaded;

                return (
                  <tr 
                    key={cls}
                    className={`hover:bg-teal-50/20 transition-colors ${idx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'}`}
                  >
                    {/* Tên Lớp */}
                    <td className="p-2.5 font-bold text-gray-900 border-r border-gray-200 sticky left-0 bg-inherit z-10 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <span>{cls}</span>
                        {isOverloaded && (
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" title="Cảnh báo: Thiếu sức chứa ca học!" />
                        )}
                      </div>
                    </td>

                    {/* Sức chứa và Phân công */}
                    <td className="p-2.5 border-r border-gray-200">
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="font-semibold text-gray-700">
                          {assignedSessions} / {capacity} tiết
                        </span>
                        {isOverloaded ? (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">
                            Thiếu {assignedSessions - capacity}t
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            Đủ
                          </span>
                        )}
                      </div>

                      {/* Thanh tỷ lệ sức chứa */}
                      <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-300 ${
                            isOverloaded 
                              ? 'bg-red-500' 
                              : isTight 
                              ? 'bg-amber-500' 
                              : 'bg-emerald-500'
                          }`}
                          style={{ width: `${Math.min(100, capacity > 0 ? (assignedSessions / capacity) * 100 : 100)}%` }}
                        />
                      </div>
                    </td>

                    {/* 5 Ngày trong tuần (Thứ 2 -> Thứ 6) */}
                    {[0, 1, 2, 3, 4].map(dayIdx => {
                      const isMorningActive = morningDays.includes(dayIdx);
                      const isAfternoonActive = afternoonDays.includes(dayIdx);

                      return (
                        <React.Fragment key={dayIdx}>
                          {/* Ô Sáng */}
                          <td 
                            onClick={() => handleToggleSlot(cls, dayIdx, true)}
                            className={`p-2 border-r border-teal-100/50 text-center cursor-pointer select-none transition-colors ${
                              isMorningActive 
                                ? 'bg-teal-50/80 hover:bg-teal-100/80' 
                                : 'bg-transparent hover:bg-gray-100/60'
                            }`}
                            title={`Click để ${isMorningActive ? 'Tắt' : 'Bật'} ca Sáng ${DAYS[dayIdx]} cho lớp ${cls}`}
                          >
                            {isMorningActive ? (
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-teal-600 text-white font-bold text-xs shadow-2xs">
                                ✓
                              </span>
                            ) : (
                              <span className="text-gray-300 hover:text-gray-400 font-bold text-xs">—</span>
                            )}
                          </td>

                          {/* Ô Chiều */}
                          <td 
                            onClick={() => handleToggleSlot(cls, dayIdx, false)}
                            className={`p-2 border-r border-gray-200 text-center cursor-pointer select-none transition-colors ${
                              isAfternoonActive 
                                ? 'bg-amber-50/80 hover:bg-amber-100/80' 
                                : 'bg-transparent hover:bg-gray-100/60'
                            }`}
                            title={`Click để ${isAfternoonActive ? 'Tắt' : 'Bật'} ca Chiều ${DAYS[dayIdx]} cho lớp ${cls}`}
                          >
                            {isAfternoonActive ? (
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-amber-600 text-white font-bold text-xs shadow-2xs">
                                ✓
                              </span>
                            ) : (
                              <span className="text-gray-300 hover:text-gray-400 font-bold text-xs">—</span>
                            )}
                          </td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>

          {/* Hàng Tổng Kết Tải Trọng Ca Học Toàn Trường */}
          <tfoot>
            <tr className="bg-slate-100/90 font-bold text-gray-800 border-t-2 border-gray-300">
              <td className="p-3 border-r border-gray-200 sticky left-0 bg-slate-100 z-10 text-center text-xs uppercase tracking-wide">
                Tổng cộng
              </td>
              <td className="p-3 border-r border-gray-200 text-xs text-gray-600">
                {classes.length} lớp toàn trường
              </td>
              {[0, 1, 2, 3, 4].map(dayIdx => (
                <React.Fragment key={dayIdx}>
                  <td className="p-2 border-r border-teal-100 text-center text-xs text-teal-900 bg-teal-50/50">
                    <span className="font-extrabold">{shiftStats.morningCount[dayIdx]}</span>
                    <span className="text-[10px] font-normal text-teal-700 block">lớp sáng</span>
                  </td>
                  <td className="p-2 border-r border-gray-200 text-center text-xs text-amber-900 bg-amber-50/50">
                    <span className="font-extrabold">{shiftStats.afternoonCount[dayIdx]}</span>
                    <span className="text-[10px] font-normal text-amber-700 block">lớp chiều</span>
                  </td>
                </React.Fragment>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default SchoolShiftMatrix;
