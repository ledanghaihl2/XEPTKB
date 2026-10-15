import React, { useState, useMemo } from 'react';
import { Constraint, InputRow } from '../types';
import { DAYS } from '../constants';

interface Props {
  classes: string[];
  constraints: Constraint[];
  data: InputRow[];
  onUpdateClassShift?: (className: string, morningDays: number[], afternoonDays: number[]) => void;
}

export const SchoolShiftMatrix: React.FC<Props> = ({
  classes,
  constraints,
  data,
  onUpdateClassShift
}) => {
  const [selectedGrade, setSelectedGrade] = useState<string>('ALL');

  // Lọc lớp theo khối
  const filteredClasses = useMemo(() => {
    if (selectedGrade === 'ALL') return classes;
    return classes.filter(cls => cls.startsWith(selectedGrade));
  }, [classes, selectedGrade]);

  // Phân tích cấu hình ca học của từng lớp từ danh sách ràng buộc
  const classShiftMap = useMemo(() => {
    const map = new Map<string, { morningDays: number[]; afternoonDays: number[]; constraintId?: string }>();

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

        map.set(cls, { morningDays: mDays, afternoonDays: aDays, constraintId: c.id });
      } else {
        // Mặc định: Nếu chưa thiết lập ràng buộc thì lớp học cả ngày (T2-T6)
        map.set(cls, { morningDays: [0, 1, 2, 3, 4], afternoonDays: [0, 1, 2, 3, 4] });
      }
    });

    return map;
  }, [classes, constraints]);

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
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
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
              Theo dõi lịch học ca Sáng & Chiều của toàn bộ các lớp trong tuần. Click trực tiếp vào ô để <strong className="text-teal-900">Bật / Tắt nhanh</strong> ca học!
            </p>
          </div>

          {/* Bộ lọc Khối lớp & Nút in */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-gray-500">Khối:</span>
            <div className="flex bg-white p-0.5 rounded-lg border border-gray-200 shadow-xs">
              {['ALL', '6', '7', '8', '9'].map(gr => {
                const label = gr === 'ALL' ? `Tất cả (${classes.length})` : `Khối ${gr}`;
                const active = selectedGrade === gr;
                return (
                  <button
                    key={gr}
                    onClick={() => setSelectedGrade(gr)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                      active
                        ? 'bg-primary text-white shadow-xs font-bold'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <button
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
              {DAYS.map((dayName) => (
                <th key={dayName} colSpan={2} className="p-2 border-r border-gray-200 last:border-r-0 uppercase tracking-wide">
                  {dayName}
                </th>
              ))}
            </tr>
            <tr className="bg-slate-50 border-b border-gray-200 text-center font-semibold text-[11px]">
              {DAYS.map((dayName, dIdx) => (
                <React.Fragment key={`sub_${dIdx}`}>
                  <th className="py-1 px-1.5 border-r border-gray-200 text-teal-800 bg-teal-50/40 w-16 min-w-[64px]">
                    🌅 Sáng
                  </th>
                  <th className="py-1 px-1.5 border-r border-gray-200 last:border-r-0 text-amber-800 bg-amber-50/40 w-16 min-w-[64px]">
                    🌇 Chiều
                  </th>
                </React.Fragment>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {filteredClasses.length === 0 ? (
              <tr>
                <td colSpan={12} className="p-6 text-center text-gray-500 italic">
                  Không tìm thấy lớp học nào thuộc khối {selectedGrade}.
                </td>
              </tr>
            ) : (
              filteredClasses.map(cls => {
                const config = classShiftMap.get(cls) || { morningDays: [0, 1, 2, 3, 4], afternoonDays: [0, 1, 2, 3, 4] };
                const neededSessions = classSessionsMap.get(cls) || 0;
                const capacity = (config.morningDays.length * 5) + (config.afternoonDays.length * 3);
                const isOverloaded = neededSessions > capacity;

                return (
                  <tr key={cls} className="hover:bg-teal-50/20 transition-colors">
                    {/* Cột Tên Lớp */}
                    <td className="p-2.5 font-bold text-center border-r border-gray-200 sticky left-0 bg-white z-10 text-primary">
                      {cls}
                    </td>

                    {/* Cột Phân công / Sức chứa */}
                    <td className="p-2.5 border-r border-gray-200">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-gray-500">Cần: <strong>{neededSessions}</strong> tiết</span>
                          <span className={`font-bold px-1.5 py-0.2 rounded text-[10px] ${
                            isOverloaded 
                              ? 'bg-red-100 text-red-800 border border-red-200' 
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}>
                            {capacity} tối đa
                          </span>
                        </div>
                        {/* Thanh tỷ lệ sức chứa */}
                        <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all ${
                              isOverloaded ? 'bg-red-500' : 'bg-teal-600'
                            }`}
                            style={{ width: `${Math.min(100, Math.round((neededSessions / (capacity || 1)) * 100))}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* 10 Ô Ca học (5 ngày x 2 ca) */}
                    {DAYS.map((_, dIdx) => {
                      const isMorning = config.morningDays.includes(dIdx);
                      const isAfternoon = config.afternoonDays.includes(dIdx);

                      return (
                        <React.Fragment key={`cell_${cls}_${dIdx}`}>
                          {/* Ca Sáng */}
                          <td className="p-1 border-r border-gray-100 text-center bg-teal-50/10">
                            <button
                              type="button"
                              onClick={() => handleToggleSlot(cls, dIdx, true)}
                              className={`w-full py-1.5 px-1 rounded-md text-xs font-bold transition-all border flex items-center justify-center gap-1 ${
                                isMorning
                                  ? 'bg-teal-600 text-white border-teal-600 shadow-xs hover:bg-teal-700 scale-[0.98] active:scale-95'
                                  : 'bg-white text-gray-400 border-dashed border-gray-200 hover:bg-teal-50 hover:text-teal-700 hover:border-teal-300'
                              }`}
                              title={`Click để ${isMorning ? 'TẮT' : 'BẬT'} ca Sáng ngày ${DAYS[dIdx]} cho lớp ${cls}`}
                            >
                              <span>{isMorning ? '✓' : '-'}</span>
                              <span className="hidden sm:inline text-[10px]">{isMorning ? 'Sáng' : 'Nghỉ'}</span>
                            </button>
                          </td>

                          {/* Ca Chiều */}
                          <td className="p-1 border-r border-gray-200 last:border-r-0 text-center bg-amber-50/10">
                            <button
                              type="button"
                              onClick={() => handleToggleSlot(cls, dIdx, false)}
                              className={`w-full py-1.5 px-1 rounded-md text-xs font-bold transition-all border flex items-center justify-center gap-1 ${
                                isAfternoon
                                  ? 'bg-amber-600 text-white border-amber-600 shadow-xs hover:bg-amber-700 scale-[0.98] active:scale-95'
                                  : 'bg-white text-gray-400 border-dashed border-gray-200 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-300'
                              }`}
                              title={`Click để ${isAfternoon ? 'TẮT' : 'BẬT'} ca Chiều ngày ${DAYS[dIdx]} cho lớp ${cls}`}
                            >
                              <span>{isAfternoon ? '✓' : '-'}</span>
                              <span className="hidden sm:inline text-[10px]">{isAfternoon ? 'Chiều' : 'Nghỉ'}</span>
                            </button>
                          </td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>

          {/* Dòng Tổng kết Thống kê theo Ca (Footer) */}
          <tfoot>
            {/* Tổng số lớp học Buổi Sáng */}
            <tr className="bg-teal-50/80 border-t-2 border-teal-200 text-teal-950 font-bold text-center">
              <td className="p-2.5 border-r border-teal-200 sticky left-0 bg-teal-50 z-10 text-left" colSpan={2}>
                <div className="flex items-center gap-1.5">
                  <span>🌅</span>
                  <span>Tổng lớp học Buổi Sáng:</span>
                </div>
              </td>
              {DAYS.map((_, dIdx) => (
                <React.Fragment key={`sum_m_${dIdx}`}>
                  <td className="p-2 border-r border-teal-200 text-teal-900 font-extrabold bg-teal-100/50">
                    {shiftStats.morningCount[dIdx]} <span className="text-[10px] font-normal text-teal-700">lớp</span>
                  </td>
                  <td className="p-2 border-r border-gray-200 last:border-r-0 text-gray-300 bg-gray-50/50">
                    -
                  </td>
                </React.Fragment>
              ))}
            </tr>

            {/* Tổng số lớp học Buổi Chiều */}
            <tr className="bg-amber-50/80 border-t border-amber-200 text-amber-950 font-bold text-center">
              <td className="p-2.5 border-r border-amber-200 sticky left-0 bg-amber-50 z-10 text-left" colSpan={2}>
                <div className="flex items-center gap-1.5">
                  <span>🌇</span>
                  <span>Tổng lớp học Buổi Chiều:</span>
                </div>
              </td>
              {DAYS.map((_, dIdx) => (
                <React.Fragment key={`sum_a_${dIdx}`}>
                  <td className="p-2 border-r border-gray-200 text-gray-300 bg-gray-50/50">
                    -
                  </td>
                  <td className="p-2 border-r border-amber-200 last:border-r-0 text-amber-900 font-extrabold bg-amber-100/50">
                    {shiftStats.afternoonCount[dIdx]} <span className="text-[10px] font-normal text-amber-700">lớp</span>
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
