import React, { useState, useRef } from 'react';
import { TimetableVersion, InputRow, Constraint, TimetableGrid } from '../types';

interface VersionManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  versions: TimetableVersion[];
  onSaveCurrentVersion: (name: string) => void;
  onLoadVersion: (version: TimetableVersion) => void;
  onDeleteVersion: (id: string) => void;
  onRenameVersion: (id: string, newName: string) => void;
  onImportVersions: (importedVersions: TimetableVersion[]) => void;
  currentData: InputRow[];
  currentConstraints: Constraint[];
  currentSchedule: TimetableGrid;
}

export const VersionManagerModal: React.FC<VersionManagerModalProps> = ({
  isOpen,
  onClose,
  versions,
  onSaveCurrentVersion,
  onLoadVersion,
  onDeleteVersion,
  onRenameVersion,
  onImportVersions,
  currentData,
  currentConstraints,
  currentSchedule
}) => {
  const [newVersionName, setNewVersionName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const nameToSave = newVersionName.trim() || `Phiên bản TKB - ${new Date().toLocaleString('vi-VN')}`;
    onSaveCurrentVersion(nameToSave);
    setNewVersionName('');
  };

  const handleStartRename = (v: TimetableVersion) => {
    setEditingId(v.id);
    setEditingName(v.name);
  };

  const handleConfirmRename = (id: string) => {
    if (editingName.trim()) {
      onRenameVersion(id, editingName.trim());
    }
    setEditingId(null);
  };

  const handleExportVersionJSON = (version: TimetableVersion) => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(version, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `TKB_${version.name.replace(/[^a-zA-Z0-9_\-]/g, '_')}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);
        
        let newItems: TimetableVersion[] = [];
        if (Array.isArray(parsed)) {
          newItems = parsed;
        } else if (parsed && parsed.id && parsed.data) {
          newItems = [parsed];
        } else if (parsed && parsed.data) {
          // Backup file format without version wrapper
          newItems = [{
            id: 'imported_' + Date.now(),
            name: `Phiên bản nhập (${new Date().toLocaleDateString('vi-VN')})`,
            createdAt: new Date().toLocaleString('vi-VN'),
            data: parsed.data || [],
            constraints: parsed.constraints || [],
            schedule: parsed.schedule || {}
          }];
        }

        if (newItems.length > 0) {
          onImportVersions(newItems);
          alert(`Đã nhập thành công ${newItems.length} phiên bản TKB!`);
        } else {
          alert('File JSON không đúng định dạng dữ liệu TKB.');
        }
      } catch (err) {
        alert('Lỗi khi đọc file JSON: ' + err);
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh] animate-fade-in">
        
        {/* Header */}
        <div className="bg-primary text-white p-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="9"/></svg>
            <h2 className="text-lg font-bold">Quản Lý Lịch Sử & Phiên Bản Thời Khóa Biểu</h2>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white font-bold transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-grow space-y-6">

          {/* Form Save Current State */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 shadow-sm">
            <h3 className="text-sm font-bold text-emerald-900 mb-2 flex items-center gap-1.5">
              <span>💾</span> Lưu trạng thái hiện tại thành phiên bản mới
            </h3>
            <form onSubmit={handleSave} className="flex gap-2">
              <input
                type="text"
                placeholder="Nhập tên phiên bản (VD: Bản TKB Tuần 1, TKB Dự phòng A...)"
                value={newVersionName}
                onChange={(e) => setNewVersionName(e.target.value)}
                className="flex-grow px-3.5 py-2 border border-emerald-300 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-medium text-sm rounded shadow transition-colors whitespace-nowrap"
              >
                Lưu phiên bản
              </button>
            </form>
          </div>

          {/* Version List */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-base font-bold text-gray-800 flex items-center gap-1.5">
                <span>📚</span> Danh sách các phiên bản đã lưu ({versions.length})
              </h3>
              
              <div className="flex gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".json"
                  className="hidden"
                  onChange={handleImportFileChange}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-semibold rounded flex items-center gap-1 transition-colors"
                >
                  <span>📥</span> Nhập file (.json)
                </button>
              </div>
            </div>

            {versions.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-300 text-gray-500">
                <p className="text-sm">Chưa có phiên bản nào được lưu.</p>
                <p className="text-xs text-gray-400 mt-1">Hãy nhập tên phiên bản ở trên và bấm "Lưu phiên bản" để bắt đầu theo dõi lịch sử.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {versions.map((v) => {
                  const classCount = Object.keys(v.schedule || {}).length;
                  const isEditing = editingId === v.id;
                  const isAutoSnapshot = v.name.includes('[Tự động sao lưu]');
                  const displayName = isAutoSnapshot ? v.name.replace('[Tự động sao lưu]', '').trim() : v.name;

                  return (
                    <div 
                      key={v.id} 
                      className={`border rounded-lg p-4 shadow-sm hover:shadow transition-all flex flex-col md:flex-row justify-between items-start md:items-center gap-3 ${
                        isAutoSnapshot 
                          ? 'bg-indigo-50/40 border-indigo-200/80 hover:border-indigo-400' 
                          : 'bg-white border-gray-200 hover:border-primary/50'
                      }`}
                    >
                      <div className="flex-grow">
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              className="px-2 py-1 text-sm border border-blue-400 rounded focus:outline-none"
                              autoFocus
                            />
                            <button
                              onClick={() => handleConfirmRename(v.id)}
                              className="px-2 py-1 bg-blue-600 text-white text-xs rounded"
                            >
                              Lưu
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 flex-wrap">
                            {isAutoSnapshot && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-200">
                                <span>🛡️</span> Tự động sao lưu
                              </span>
                            )}
                            <h4 className="font-bold text-gray-900 text-sm">{displayName}</h4>
                            <button
                              onClick={() => handleStartRename(v)}
                              className="text-gray-400 hover:text-gray-600 text-xs"
                              title="Đổi tên phiên bản"
                            >
                              ✏️
                            </button>
                          </div>
                        )}
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <span>🕒</span> {v.createdAt}
                          </span>
                          <span>•</span>
                          <span className="bg-gray-100 px-2 py-0.5 rounded text-gray-700 font-medium">
                            {v.data?.length || 0} phân công
                          </span>
                          <span>•</span>
                          <span className="bg-teal-50 text-teal-700 px-2 py-0.5 rounded font-medium">
                            {classCount} lớp học
                          </span>
                          <span>•</span>
                          <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded font-medium">
                            {v.constraints?.length || 0} ràng buộc
                          </span>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 w-full md:w-auto justify-end border-t md:border-t-0 pt-2 md:pt-0 border-gray-100">
                        <button
                          onClick={() => {
                            if (window.confirm(`Chuyển sang làm việc với phiên bản "${v.name}"? Dữ liệu hiện tại sẽ được thay thế.`)) {
                              onLoadVersion(v);
                              onClose();
                            }
                          }}
                          className="px-3 py-1.5 bg-primary hover:bg-teal-800 text-white text-xs font-semibold rounded shadow-sm transition-colors flex items-center gap-1"
                        >
                          ⚡ Sử dụng bản này
                        </button>

                        <button
                          onClick={() => handleExportVersionJSON(v)}
                          className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded transition-colors"
                          title="Tải file JSON dự phòng bản này"
                        >
                          💾 Tải file
                        </button>

                        <button
                          onClick={() => {
                            if (window.confirm(`Bạn có chắc chắn muốn xóa phiên bản "${v.name}"?`)) {
                              onDeleteVersion(v.id);
                            }
                          }}
                          className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 text-xs font-medium rounded transition-colors"
                          title="Xóa phiên bản"
                        >
                          🗑️ Xóa
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-gray-50 border-t border-gray-200 p-4 flex justify-between items-center text-xs text-gray-500">
          <p>Tất cả phiên bản được tự động bảo toàn trong LocalStorage của máy tính.</p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-medium rounded transition-colors"
          >
            Đóng
          </button>
        </div>

      </div>
    </div>
  );
};
