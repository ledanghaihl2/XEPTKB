import React, { useState, useEffect } from 'react';
import { InputRow, Constraint, TimetableGrid } from '../types';
import {
  getGeminiApiKey,
  setGeminiApiKey,
  getGeminiModel,
  setGeminiModel,
  isGeminiConfigured,
  testGeminiApiKey,
  analyzeScheduleWithGemini,
  parseNaturalLanguageToSchedule,
  ParsedScheduleData,
  DEFAULT_GEMINI_MODEL
} from '../services/geminiService';

interface GeminiAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  timetable: TimetableGrid;
  unassigned: InputRow[];
  constraints: Constraint[];
  rawData: InputRow[];
  existingTeachers: string[];
  existingClasses: string[];
  existingSubjects: string[];
  onApplyParsedData: (newAssignments: InputRow[], newConstraints: Constraint[]) => void;
  onApiKeyUpdated: () => void;
}

export const GeminiAssistantModal: React.FC<GeminiAssistantModalProps> = ({
  isOpen,
  onClose,
  timetable,
  unassigned,
  constraints,
  rawData,
  existingTeachers,
  existingClasses,
  existingSubjects,
  onApplyParsedData,
  onApiKeyUpdated
}) => {
  const [activeTab, setActiveTab] = useState<'analyze' | 'nlp' | 'settings'>('analyze');

  // Settings State
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(DEFAULT_GEMINI_MODEL);
  const [showKey, setShowKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<{ success: boolean; message: string } | null>(null);

  // Analyze State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string>('');
  const [analyzeError, setAnalyzeError] = useState<string>('');

  // Natural Language State
  const [nlpInput, setNlpInput] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedScheduleData | null>(null);
  const [nlpError, setNlpError] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setApiKey(getGeminiApiKey());
      setModel(getGeminiModel());
      setTestStatus(null);
      setAnalyzeError('');
      setNlpError('');
      
      // Auto-switch to settings tab if key not configured
      if (!isGeminiConfigured()) {
        setActiveTab('settings');
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Handle Save API Settings
  const handleSaveSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!apiKey.trim()) {
      setTestStatus({ success: false, message: 'Vui lòng nhập API Key từ Google AI Studio.' });
      return;
    }

    setIsTesting(true);
    setTestStatus(null);

    try {
      const isValid = await testGeminiApiKey(apiKey.trim(), model);
      if (isValid) {
        setGeminiApiKey(apiKey.trim());
        setGeminiModel(model);
        setTestStatus({ success: true, message: `✅ Kết nối thành công tới Google AI Studio với mô hình ${model}!` });
        onApiKeyUpdated();
        setTimeout(() => {
          setActiveTab('analyze');
        }, 800);
      } else {
        setTestStatus({ success: false, message: 'Khóa API Key không hợp lệ hoặc không có quyền truy cập.' });
      }
    } catch (err: any) {
      setTestStatus({ success: false, message: `Lỗi kết nối: ${err.message}` });
    } finally {
      setIsTesting(false);
    }
  };

  // Handle Analyze Schedule
  const handleRunAnalysis = async () => {
    if (!isGeminiConfigured()) {
      setActiveTab('settings');
      return;
    }

    setIsAnalyzing(true);
    setAnalyzeError('');
    setAnalysisResult('');

    try {
      const result = await analyzeScheduleWithGemini({
        timetable,
        unassigned,
        constraints,
        rawData
      });
      setAnalysisResult(result);
    } catch (err: any) {
      setAnalyzeError(err.message || 'Lỗi khi phân tích thời khóa biểu.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Handle Natural Language Parse
  const handleRunNlp = async () => {
    if (!nlpInput.trim()) {
      setNlpError('Vui lòng nhập hoặc chọn một câu yêu cầu phân công / ràng buộc.');
      return;
    }

    if (!isGeminiConfigured()) {
      setActiveTab('settings');
      return;
    }

    setIsParsing(true);
    setNlpError('');
    setParsedData(null);

    try {
      const data = await parseNaturalLanguageToSchedule(nlpInput, {
        existingTeachers,
        existingClasses,
        existingSubjects
      });
      setParsedData(data);
    } catch (err: any) {
      setNlpError(err.message || 'Lỗi khi trích xuất dữ liệu từ câu văn.');
    } finally {
      setIsParsing(false);
    }
  };

  // Handle Apply Parsed Data into Timetable
  const handleApplyData = () => {
    if (!parsedData) return;

    const newAssignments: InputRow[] = parsedData.assignments.map(a => ({
      id: Date.now() + Math.random(),
      className: a.className,
      subject: a.subject,
      teacher: a.teacher,
      sessionsPerWeek: Number(a.sessionsPerWeek) || 1
    }));

    const newConstraints: Constraint[] = parsedData.constraints.map(c => ({
      id: 'ai_' + Math.random().toString(36).substr(2, 9),
      type: c.type,
      teacher: c.teacher,
      className: c.className,
      subject: c.subject,
      day: c.day,
      period: c.period
    }));

    onApplyParsedData(newAssignments, newConstraints);
    alert(`Đã nạp thành công ${newAssignments.length} phân công và ${newConstraints.length} ràng buộc do Gemini trích xuất!`);
    onClose();
  };

  const samplePrompts = [
    'Thầy Tuấn dạy Toán lớp 6A 4 tiết, 6B 4 tiết. Cô Lan dạy Văn 6A 4 tiết.',
    'Thầy Hùng bận họp vào sáng thứ 2 (các tiết 1, 2) và chiều thứ 4.',
    'Cố định môn Chào cờ vào Tiết 1 sáng Thứ 2 cho tất cả các lớp.',
    'Lớp 7A xếp 2 tiết Tin học của Thầy Bình vào buổi sáng Thứ 3.'
  ];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh] animate-fade-in border border-indigo-100">
        
        {/* Header with Google AI Studio Gradient */}
        <div className="bg-gradient-to-r from-teal-700 via-indigo-700 to-purple-800 text-white p-5 flex justify-between items-center shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-md flex items-center justify-center text-xl shadow-inner border border-white/20">
              ✨
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight">Trợ Lý AI Gemini</h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-white/20 text-indigo-100 border border-white/30">
                  Google AI Studio
                </span>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-400 text-gray-900">
                  {model}
                </span>
              </div>
              <p className="text-xs text-indigo-100/80 mt-0.5">
                Cố vấn sư phạm, phân tích xung đột & bóc tách ngôn ngữ tự nhiên thông minh
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center text-white font-bold transition-all text-sm"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-200 bg-gray-50/70 px-6 pt-2">
          <button
            onClick={() => setActiveTab('analyze')}
            className={`py-3 px-4 font-semibold text-sm border-b-2 flex items-center gap-2 transition-all ${
              activeTab === 'analyze'
                ? 'border-indigo-600 text-indigo-700 bg-white rounded-t-lg shadow-sm'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <span>🔍</span>
            Phân Tích & Gỡ Rối Xung Đột
            {unassigned.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-rose-500 text-white text-xs rounded-full">
                {unassigned.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('nlp')}
            className={`py-3 px-4 font-semibold text-sm border-b-2 flex items-center gap-2 transition-all ${
              activeTab === 'nlp'
                ? 'border-indigo-600 text-indigo-700 bg-white rounded-t-lg shadow-sm'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <span>✍️</span>
            Nhập Liệu Ngôn Ngữ Tự Nhiên
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`py-3 px-4 font-semibold text-sm border-b-2 flex items-center gap-2 transition-all ${
              activeTab === 'settings'
                ? 'border-indigo-600 text-indigo-700 bg-white rounded-t-lg shadow-sm'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <span>⚙️</span>
            Cấu Hình API Key
            {!isGeminiConfigured() && (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
            )}
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-grow space-y-6">

          {/* TAB 1: PHÂN TÍCH & GỠ RỐI XUNG ĐỘT */}
          {activeTab === 'analyze' && (
            <div className="space-y-4">
              {/* Status Header Banner */}
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center p-4 rounded-xl border bg-gradient-to-r from-slate-50 to-indigo-50/40 gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-800 text-sm">Hiện trạng Thời khóa biểu:</span>
                    {unassigned.length === 0 ? (
                      <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                        <span>✅</span> Xếp thành công 100% không xung đột
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 flex items-center gap-1">
                        <span>⚠️</span> Có {unassigned.length} tiết bị kẹt xung đột
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Gemini 2.5 Pro sẽ quét toàn bộ ma trận thời khóa biểu, tìm nguyên nhân nghẽn và đưa ra giải pháp đổi tiết cụ thể.
                  </p>
                </div>

                <button
                  onClick={handleRunAnalysis}
                  disabled={isAnalyzing}
                  className="px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold text-sm rounded-lg shadow-md transition-all flex items-center gap-2 disabled:opacity-50 whitespace-nowrap"
                >
                  {isAnalyzing ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                      </svg>
                      Gemini đang tư duy & phân tích...
                    </>
                  ) : (
                    <>
                      <span>✨</span> Phân Tích & Gỡ Rối Ngay
                    </>
                  )}
                </button>
              </div>

              {/* Error Alert */}
              {analyzeError && (
                <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-sm flex items-start gap-2">
                  <span>❌</span>
                  <div className="flex-grow">
                    <p className="font-semibold">Lỗi phân tích:</p>
                    <p className="text-xs mt-0.5">{analyzeError}</p>
                    {analyzeError.includes('API Key') && (
                      <button
                        onClick={() => setActiveTab('settings')}
                        className="mt-2 text-xs font-bold underline text-indigo-700"
                      >
                        Chuyển đến tab Cấu hình API Key &rarr;
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Analysis Result Output */}
              {analysisResult ? (
                <div className="bg-white border border-indigo-200 rounded-xl p-5 shadow-sm space-y-3">
                  <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                    <div className="flex items-center gap-2 text-indigo-900 font-bold text-sm">
                      <span>🤖</span> Kết quả Thẩm định & Cố vấn từ Gemini 2.5 Pro:
                    </div>
                    <button
                      onClick={() => navigator.clipboard.writeText(analysisResult)}
                      className="px-2.5 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors"
                      title="Sao chép nội dung"
                    >
                      📋 Sao chép
                    </button>
                  </div>
                  <div className="prose prose-sm max-w-none text-gray-800 whitespace-pre-wrap leading-relaxed text-sm bg-slate-50/50 p-4 rounded-lg font-sans">
                    {analysisResult}
                  </div>
                </div>
              ) : (
                !isAnalyzing && (
                  <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-200 text-gray-500">
                    <div className="text-3xl mb-2">💡</div>
                    <p className="font-medium text-sm">Chưa có kết quả phân tích nào.</p>
                    <p className="text-xs text-gray-400 mt-1">Bấm nút "Phân Tích & Gỡ Rối Ngay" ở trên để AI thẩm định chuyên môn thời khóa biểu.</p>
                  </div>
                )
              )}
            </div>
          )}

          {/* TAB 2: NHẬP LIỆU NGÔN NGỮ TỰ NHIÊN */}
          {activeTab === 'nlp' && (
            <div className="space-y-4">
              <div className="bg-indigo-50/60 border border-indigo-200 rounded-xl p-4">
                <h3 className="text-sm font-bold text-indigo-950 flex items-center gap-1.5 mb-1">
                  <span>💬</span> Nhập yêu cầu bằng tiếng Việt tự nhiên
                </h3>
                <p className="text-xs text-indigo-800/80 mb-3">
                  Thầy/Cô có thể gõ câu nói thông thường hoặc dán biên bản phân công. Gemini sẽ tự động nhận diện đâu là phân công môn học, đâu là ngày bận của giáo viên.
                </p>

                {/* Sample prompt chips */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  <span className="text-xs text-gray-500 font-medium py-1">Gợi ý mẫu:</span>
                  {samplePrompts.map((s, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setNlpInput(s)}
                      className="text-xs px-2.5 py-1 bg-white hover:bg-indigo-100/70 border border-indigo-200 text-indigo-900 rounded-full transition-colors truncate max-w-xs"
                      title={s}
                    >
                      "{s}"
                    </button>
                  ))}
                </div>

                <textarea
                  rows={4}
                  value={nlpInput}
                  onChange={(e) => setNlpInput(e.target.value)}
                  placeholder="Ví dụ: Thầy Hùng bận sáng thứ 2 và thứ 4. Xếp môn Toán 6A 4 tiết do Thầy Tuấn dạy. Cố định Chào cờ tiết 1 thứ 2..."
                  className="w-full px-3.5 py-2.5 bg-white border border-indigo-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-800 shadow-sm"
                />

                <div className="flex justify-end mt-2">
                  <button
                    onClick={handleRunNlp}
                    disabled={isParsing || !nlpInput.trim()}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm rounded-lg shadow transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    {isParsing ? (
                      <>
                        <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                        </svg>
                        Gemini đang bóc tách dữ liệu...
                      </>
                    ) : (
                      <>
                        <span>✨</span> Trích Xuất Dữ Liệu Tự Động
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Error Alert */}
              {nlpError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs">
                  {nlpError}
                </div>
              )}

              {/* Preview Parsed Data */}
              {parsedData && (
                <div className="bg-white border border-emerald-300 rounded-xl p-5 shadow-sm space-y-4 animate-fade-in">
                  <div className="flex items-center justify-between pb-2 border-b border-emerald-100">
                    <div>
                      <h4 className="font-bold text-emerald-900 text-sm flex items-center gap-1.5">
                        <span>🎯</span> Kết quả trích xuất thành công:
                      </h4>
                      <p className="text-xs text-gray-600 mt-0.5">{parsedData.summary}</p>
                    </div>
                    <button
                      onClick={handleApplyData}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow transition-all flex items-center gap-1.5"
                    >
                      <span>📥</span> Nạp Vào Hệ Thống & Xếp Lại
                    </button>
                  </div>

                  {/* Assignments Table Preview */}
                  {parsedData.assignments.length > 0 && (
                    <div>
                      <h5 className="text-xs font-bold text-gray-700 uppercase mb-2">
                        Phân công trích xuất được ({parsedData.assignments.length}):
                      </h5>
                      <div className="overflow-x-auto max-h-40 border border-gray-200 rounded-lg">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-gray-50 text-gray-600 font-semibold">
                            <tr>
                              <th className="p-2">Lớp</th>
                              <th className="p-2">Môn</th>
                              <th className="p-2">Giáo viên</th>
                              <th className="p-2">Số tiết/tuần</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {parsedData.assignments.map((a, i) => (
                              <tr key={i} className="hover:bg-gray-50">
                                <td className="p-2 font-bold">{a.className}</td>
                                <td className="p-2 text-primary font-medium">{a.subject}</td>
                                <td className="p-2">{a.teacher}</td>
                                <td className="p-2">{a.sessionsPerWeek} tiết</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Constraints Preview */}
                  {parsedData.constraints.length > 0 && (
                    <div>
                      <h5 className="text-xs font-bold text-gray-700 uppercase mb-2">
                        Điều kiện ràng buộc trích xuất được ({parsedData.constraints.length}):
                      </h5>
                      <div className="space-y-1.5 max-h-36 overflow-y-auto">
                        {parsedData.constraints.map((c, i) => (
                          <div key={i} className="p-2 bg-amber-50/80 border border-amber-200 rounded text-xs text-amber-900 flex items-center justify-between">
                            <span>
                              <strong>{c.type === 'TEACHER_BUSY' ? `[GV BẬN]` : `[TIẾT CỐ ĐỊNH]`}</strong> {c.teacher ? `Giáo viên ${c.teacher}` : `Lớp ${c.className} (${c.subject})`} - Thứ {c.day + 2}, Tiết {c.period + 1}
                            </span>
                            {c.description && <span className="text-gray-500 italic text-[11px]">{c.description}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: CẤU HÌNH API KEY GOOGLE AI STUDIO */}
          {activeTab === 'settings' && (
            <form onSubmit={handleSaveSettings} className="space-y-5">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 leading-relaxed">
                <p className="font-bold text-sm mb-1 flex items-center gap-1.5">
                  <span>🔑</span> Cách lấy Google AI Studio API Key hoàn toàn miễn phí:
                </p>
                <ol className="list-decimal list-inside space-y-1 mt-1 text-gray-700">
                  <li>Truy cập vào trang quản trị Google AI Studio: <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-indigo-600 font-semibold underline">aistudio.google.com/app/apikey</a></li>
                  <li>Đăng nhập bằng tài khoản Google bất kỳ.</li>
                  <li>Nhấp nút <strong>"Create API Key"</strong> &rarr; Sao chép mã khóa và dán vào ô bên dưới.</li>
                </ol>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">
                  Google AI Studio API Key:
                </label>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="AIzaSy..."
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none pr-20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 text-xs text-gray-500 hover:text-gray-700 font-medium"
                  >
                    {showKey ? 'Ẩn' : 'Hiện'}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">
                  Lựa chọn Mô hình Gemini:
                </label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="gemini-2.5-pro">gemini-2.5-pro (Được chọn - Khả năng suy luận logic chuyên sâu phức tạp nhất)</option>
                  <option value="gemini-2.5-flash">gemini-2.5-flash (Tốc độ phản hồi cực nhanh, tối ưu hạn mức gọi)</option>
                </select>
                <p className="text-[11px] text-gray-500 mt-1">
                  Mô hình <strong>gemini-2.5-pro</strong> có khả năng phát hiện mâu thuẫn ràng buộc và giải toán logic cao cấp nhất hiện nay.
                </p>
              </div>

              {testStatus && (
                <div className={`p-3.5 rounded-lg text-xs font-medium ${testStatus.success ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                  {testStatus.message}
                </div>
              )}

              <div className="flex justify-between items-center pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => {
                    setGeminiApiKey('');
                    setApiKey('');
                    setTestStatus({ success: true, message: 'Đã xóa API Key khỏi bộ nhớ trình duyệt.' });
                    onApiKeyUpdated();
                  }}
                  className="px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 rounded transition-colors"
                >
                  Xóa Khóa API
                </button>

                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={isTesting}
                    className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold text-sm rounded-lg shadow transition-all flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isTesting ? 'Đang kiểm tra kết nối...' : 'Lưu & Kiểm Tra Kết Nối'}
                  </button>
                </div>
              </div>
            </form>
          )}

        </div>

        {/* Footer */}
        <div className="bg-gray-50 border-t border-gray-200 p-4 px-6 flex justify-between items-center text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <span>Trạng thái AI:</span>
            {isGeminiConfigured() ? (
              <span className="text-emerald-700 font-bold flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Đã kích hoạt ({getGeminiModel()})
              </span>
            ) : (
              <span className="text-amber-700 font-semibold flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span> Chưa cài đặt API Key
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors"
          >
            Đóng
          </button>
        </div>

      </div>
    </div>
  );
};
