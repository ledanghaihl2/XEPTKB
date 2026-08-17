import React, { useState, useEffect } from 'react';
import { getSupabaseCredentials, setSupabaseCredentials, isSupabaseConfigured } from '../services/supabaseClient';

interface SupabaseConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnectedSuccess: () => void;
}

export const SupabaseConfigModal: React.FC<SupabaseConfigModalProps> = ({
  isOpen,
  onClose,
  onConnectedSuccess
}) => {
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const creds = getSupabaseCredentials();
      setUrl(creds.url);
      setKey(creds.key);
      setStatusMsg('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || !key.trim()) {
      setStatusMsg('Vui lòng nhập đầy đủ Supabase URL và Anon Key.');
      return;
    }

    if (!url.includes('supabase.co')) {
      setStatusMsg('Supabase URL phải có dạng https://<project-id>.supabase.co');
      return;
    }

    setIsTesting(true);
    setSupabaseCredentials(url, key);

    setTimeout(() => {
      setIsTesting(false);
      setStatusMsg('✅ Kết nối thành công với Supabase Database!');
      onConnectedSuccess();
      setTimeout(() => {
        onClose();
      }, 1000);
    }, 500);
  };

  const handleClear = () => {
    setSupabaseCredentials('', '');
    setUrl('');
    setKey('');
    setStatusMsg('Đã xóa cấu hình Supabase. Ứng dụng sẽ dùng LocalStorage.');
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-fade-in">
        <div className="bg-emerald-800 text-white p-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <svg className="w-6 h-6 text-emerald-300" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11.5 2L2 13.5h9L9.5 22 19 10.5h-9L11.5 2z"/>
            </svg>
            <h2 className="text-lg font-bold">Cấu Hình Kết Nối Supabase Database</h2>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white font-bold"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-800">
            <p className="font-semibold mb-1">💡 Hướng dẫn cấu hình:</p>
            <p>Vào trang quản trị <strong>Supabase Project Settings &rarr; API</strong> để copy <code>Project URL</code> và <code>anon / public key</code> dán vào đây.</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
              Supabase Project URL:
            </label>
            <input
              type="text"
              placeholder="https://your-project-id.supabase.co"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-emerald-500 focus:outline-none text-sm font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
              Supabase Anon Key (Public Key):
            </label>
            <textarea
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              value={key}
              onChange={(e) => setKey(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-emerald-500 focus:outline-none text-xs font-mono"
            />
          </div>

          {statusMsg && (
            <div className={`p-3 rounded text-xs font-medium ${statusMsg.includes('✅') ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
              {statusMsg}
            </div>
          )}

          <div className="flex justify-between items-center pt-2">
            <button
              type="button"
              onClick={handleClear}
              className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs rounded"
            >
              Xóa cấu hình
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-medium rounded"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={isTesting}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold rounded shadow transition-colors flex items-center gap-1.5"
              >
                {isTesting ? 'Đang lưu...' : 'Lưu kết nối'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
