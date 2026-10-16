import React from 'react';
import { ExcelImportResult } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  importResult: ExcelImportResult | null;
  existingClasses: string[];
  existingTeachers: string[];
  isSampleData: boolean;
  onConfirmMerge: () => void;
  onConfirmReplace: () => void;
}

export const ImportConfirmModal: React.FC<Props> = ({
  isOpen,
  onClose,
  fileName,
  importResult,
  existingClasses,
  existingTeachers,
  isSampleData,
  onConfirmMerge,
  onConfirmReplace,
}) => {
  if (!isOpen || !importResult) return null;

  const detectedClasses = importResult.detectedClasses || [];
  const detectedTeachers = importResult.detectedTeachers || [];

  const newClasses = detectedClasses.filter(c => !existingClasses.includes(c));
  const newTeachers = detectedTeachers.filter(t => !existingTeachers.includes(t));
  const matchedClasses = detectedClasses.filter(c => existingClasses.includes(c));
  const matchedTeachers = detectedTeachers.filter(t => existingTeachers.includes(t));

  const isGridMode = importResult.mode === 'TIMETABLE_GRID';

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 transform transition-all">
        {/* Header */}
        <div className="bg-gradient-to-r from-teal-700 via-teal-800 to-slate-800 px-6 py-4 text-white flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-2xl shadow-inner">
              📥
            </div>
            <div>
              <h3 className="text-lg font-bold">Xác nhận nạp dữ liệu từ Excel</h3>
              <p className="text-xs text-teal-200 line-clamp-1">
                Tệp: <span className="font-semibold text-white">{fileName}</span> ({isGridMode ? 'Ma trận Thời khóa biểu' : 'Bảng phân công môn học'})
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
            title="Đóng"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Thông báo dữ liệu mẫu nếu có */}
          {isSampleData && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex items-start gap-2.5">
              <span className="text-base shrink-0">💡</span>
              <p>
                <strong>Gợi ý:</strong> Hệ thống nhận thấy Thầy/Cô đang mở dữ liệu mẫu ban đầu. Nếu đây là tệp Excel chính thức của nhà trường, Thầy/Cô nên chọn <strong>"Thay thế toàn bộ"</strong> để tránh trộn lẫn lớp mẫu với dữ liệu thật.
              </p>
            </div>
          )}

          {/* Thống kê phát hiện từ file Excel */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Kết quả phân tích từ tệp Excel
              </span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 border border-teal-200">
                {importResult.data.length} phân công môn học
              </span>
            </div>

            {/* Mục Lớp học */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-semibold text-slate-700">Lớp học phát hiện ({detectedClasses.length} lớp):</span>
                {newClasses.length > 0 ? (
                  <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                    +{newClasses.length} lớp mới
                  </span>
                ) : (
                  <span className="text-slate-500 font-medium">Toàn bộ đã có trong hệ thống</span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1.5 bg-white rounded-lg border border-slate-200">
                {newClasses.map(cls => (
                  <span key={cls} className="px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded text-xs font-bold flex items-center gap-1 shadow-2xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                    {cls} (Mới)
                  </span>
                ))}
                {matchedClasses.map(cls => (
                  <span key={cls} className="px-2 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 rounded text-xs">
                    {cls}
                  </span>
                ))}
              </div>
            </div>

            {/* Mục Giáo viên */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-semibold text-slate-700">Giáo viên phát hiện ({detectedTeachers.length} GV):</span>
                {newTeachers.length > 0 ? (
                  <span className="text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                    +{newTeachers.length} giáo viên mới
                  </span>
                ) : (
                  <span className="text-slate-500 font-medium">Toàn bộ đã có trong hệ thống</span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1.5 bg-white rounded-lg border border-slate-200">
                {newTeachers.map(tch => (
                  <span key={tch} className="px-2 py-0.5 bg-blue-100 text-blue-800 border border-blue-300 rounded text-xs font-bold flex items-center gap-1 shadow-2xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                    {tch} (Mới)
                  </span>
                ))}
                {matchedTeachers.map(tch => (
                  <span key={tch} className="px-2 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 rounded text-xs">
                    {tch}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Lựa chọn hành động */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Thầy/Cô vui lòng chọn cách nạp dữ liệu:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {/* Option 1: Bổ sung thêm (Gộp dữ liệu) */}
              <button
                type="button"
                onClick={onConfirmMerge}
                className="p-4 rounded-xl border-2 border-emerald-500 bg-emerald-50/50 hover:bg-emerald-100/70 text-left transition-all group flex flex-col justify-between shadow-sm hover:shadow cursor-pointer relative"
              >
                <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-black uppercase tracking-wider">
                  Khuyến nghị
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xl">➕</span>
                    <span className="font-bold text-emerald-900 text-sm group-hover:text-emerald-950">
                      Bổ sung thêm (Ghép dữ liệu)
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Giữ nguyên phân công và TKB hiện có, tự động <strong>bổ sung thêm {newClasses.length} lớp mới</strong>, <strong>{newTeachers.length} giáo viên mới</strong> và phân công mới từ tệp Excel.
                  </p>
                </div>
                <div className="mt-3 flex items-center text-xs font-bold text-emerald-700 group-hover:translate-x-1 transition-transform">
                  <span>Chọn bổ sung thêm &rarr;</span>
                </div>
              </button>

              {/* Option 2: Thay thế toàn bộ */}
              <button
                type="button"
                onClick={onConfirmReplace}
                className="p-4 rounded-xl border-2 border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50 text-left transition-all group flex flex-col justify-between shadow-sm hover:shadow cursor-pointer"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xl">🔄</span>
                    <span className="font-bold text-slate-800 text-sm group-hover:text-slate-950">
                      Thay thế toàn bộ (Ghi đè)
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Xóa bỏ toàn bộ dữ liệu hiện tại trong hệ thống, chỉ sử dụng danh sách lớp, giáo viên và phân công từ tệp Excel này.
                  </p>
                </div>
                <div className="mt-3 flex items-center text-xs font-bold text-slate-600 group-hover:translate-x-1 transition-transform">
                  <span>Chọn thay thế toàn bộ &rarr;</span>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex justify-end items-center">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-bold transition-colors cursor-pointer"
          >
            Hủy thao tác
          </button>
        </div>
      </div>
    </div>
  );
};
