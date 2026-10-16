import { InputRow, Constraint, TimetableGrid, BottleneckStats } from '../types';

const STORAGE_KEY_GEMINI_KEY = 'GEMINI_API_KEY';
const STORAGE_KEY_GEMINI_MODEL = 'GEMINI_MODEL';

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-pro';

export const getGeminiApiKey = (): string => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_KEY_GEMINI_KEY);
    if (saved && saved.trim()) return saved.trim();
  }
  return (import.meta as any).env?.VITE_GEMINI_API_KEY || (typeof process !== 'undefined' ? (process.env?.GEMINI_API_KEY || process.env?.API_KEY) : '') || '';
};

export const setGeminiApiKey = (key: string): void => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_GEMINI_KEY, key.trim());
  }
};

export const getGeminiModel = (): string => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_KEY_GEMINI_MODEL);
    if (saved && saved.trim()) return saved.trim();
  }
  return DEFAULT_GEMINI_MODEL;
};

export const setGeminiModel = (model: string): void => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_GEMINI_MODEL, model.trim());
  }
};

export const isGeminiConfigured = (): boolean => {
  return Boolean(getGeminiApiKey());
};

// Generic caller for Google AI Studio Gemini API
export const callGeminiApi = async ({
  prompt,
  systemInstruction,
  responseMimeType,
  overrideKey,
  overrideModel
}: {
  prompt: string;
  systemInstruction?: string;
  responseMimeType?: string;
  overrideKey?: string;
  overrideModel?: string;
}): Promise<string> => {
  const apiKey = overrideKey || getGeminiApiKey();
  const model = overrideModel || getGeminiModel();

  if (!apiKey) {
    throw new Error('Chưa cấu hình API Key Google AI Studio. Thầy/Cô vui lòng nhập API Key để sử dụng tính năng này.');
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const payload: any = {
    contents: [
      {
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      temperature: 0.2
    }
  };

  if (systemInstruction) {
    payload.systemInstruction = {
      parts: [{ text: systemInstruction }]
    };
  }

  if (responseMimeType) {
    payload.generationConfig.responseMimeType = responseMimeType;
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const errMsg = errorData?.error?.message || `Lỗi HTTP ${response.status}: ${response.statusText}`;

      if (response.status === 400 || response.status === 403) {
        throw new Error(`Khóa API Key không hợp lệ hoặc dự án Google AI Studio chưa bật quyền: ${errMsg}`);
      } else if (response.status === 429) {
        throw new Error(`Đã đạt giới hạn yêu cầu (Rate Limit) của model ${model}. Thầy/Cô có thể thử lại sau giây lát hoặc chuyển sang model gemini-2.5-flash.`);
      }
      throw new Error(`Google AI Studio phản hồi lỗi: ${errMsg}`);
    }

    const data = await response.json();
    const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!candidateText) {
      throw new Error('Google AI Studio không trả về nội dung hợp lệ.');
    }

    return candidateText;
  } catch (err: any) {
    console.error('[Gemini API Error]', err);
    throw new Error(err.message || 'Không thể kết nối với máy chủ Google AI Studio. Vui lòng kiểm tra kết nối mạng Internet.');
  }
};

// 1. Natural Language Parser (Trích xuất phân công & ràng buộc từ câu nói/văn bản)
export interface ParsedScheduleData {
  assignments: Array<{
    className: string;
    subject: string;
    teacher: string;
    sessionsPerWeek: number;
  }>;
  constraints: Array<{
    type: 'TEACHER_BUSY' | 'FIXED_SESSION';
    teacher?: string;
    className?: string;
    subject?: string;
    day: number; // 0 (T2) -> 4 (T6)
    period: number; // 0 (Tiết 1) -> 4 (Tiết 5)
    description?: string;
  }>;
  summary: string;
}

export const parseNaturalLanguageToSchedule = async (
  userInput: string,
  context?: { existingTeachers: string[]; existingClasses: string[]; existingSubjects: string[] }
): Promise<ParsedScheduleData> => {
  const systemInstruction = `Bạn là một trợ lý AI thông minh chuyên về nghiệp vụ xếp thời khóa biểu trường học tại Việt Nam.
Nhiệm vụ của bạn là đọc các câu văn bản, yêu cầu hoặc ghi chú phân công chuyên môn và trích xuất thành dữ liệu cấu trúc JSON chuẩn xác.

Quy ước:
- Thứ trong tuần (day): 0 = Thứ 2, 1 = Thứ 3, 2 = Thứ 4, 3 = Thứ 5, 4 = Thứ 6.
- Tiết trong ngày (period): 0 = Tiết 1, 1 = Tiết 2, 2 = Tiết 3, 3 = Tiết 4, 4 = Tiết 5.
- Loại ràng buộc:
  + TEACHER_BUSY: Giáo viên bận / không thể dạy vào ngày hoặc tiết cụ thể.
  + FIXED_SESSION: Tiết cố định (Ví dụ: Chào cờ sáng T2 tiết 1, Sinh hoạt cuối tuần T6 tiết 5, hoặc môn học cố định của lớp).
- Nếu người dùng nhập "sáng thứ X", có thể hiểu là các tiết 0, 1, 2, 3, 4 hoặc tiết cụ thể nếu có nhắc đến.
- Trả về định dạng JSON thuần túy theo cấu trúc:
{
  "assignments": [
    { "className": "6A", "subject": "Toán", "teacher": "Thầy Tuấn", "sessionsPerWeek": 4 }
  ],
  "constraints": [
    { "type": "TEACHER_BUSY", "teacher": "Thầy Tuấn", "day": 0, "period": 0, "description": "Bận họp sáng T2" }
  ],
  "summary": "Tóm tắt ngắn gọn những gì AI đã trích xuất được bằng tiếng Việt"
}`;

  const prompt = `Dưới đây là ghi chú / yêu cầu từ người dùng:
"""
${userInput}
"""

${context ? `Gợi ý danh sách có sẵn trong hệ thống:
- Lớp: ${context.existingClasses.join(', ')}
- Môn: ${context.existingSubjects.join(', ')}
- Giáo viên: ${context.existingTeachers.join(', ')}` : ''}

Hãy trích xuất chính xác ra JSON:`;

  const jsonString = await callGeminiApi({
    prompt,
    systemInstruction,
    responseMimeType: 'application/json'
  });

  return JSON.parse(jsonString);
};

// 2. Conflict Resolver & Pedagogical Audit (Phân tích gỡ rối xung đột & thẩm định chất lượng TKB)
export const analyzeScheduleWithGemini = async ({
  timetable,
  unassigned,
  constraints,
  rawData
}: {
  timetable: TimetableGrid;
  unassigned: InputRow[];
  constraints: Constraint[];
  rawData: InputRow[];
}): Promise<string> => {
  const systemInstruction = `Bạn là Chuyên gia Cố vấn Sư phạm & Tối ưu hóa Thời khóa biểu cấp cao của Bộ Giáo dục.
Bạn phân tích dữ liệu xếp lịch, phát hiện các điểm nghẽn (bottlenecks) và đưa ra giải pháp gỡ rối cụ thể, mang tính thực tiễn cao cho giáo viên và ban giám hiệu nhà trường.
Ngôn ngữ trả lời: Tiếng Việt, định dạng Markdown rõ ràng, dùng các icon sinh động, chuyên nghiệp.`;

  // Build condensed summary of the current schedule
  const totalSlots = Object.values(timetable).reduce((acc, days) => {
    return acc + days.reduce((dAcc, periods) => dAcc + periods.filter(Boolean).length, 0);
  }, 0);

  const classes = Object.keys(timetable);
  const unassignedSummary = unassigned.map(u => `- Lớp ${u.className}: Môn ${u.subject} (GV: ${u.teacher}) - Còn thiếu ${u.sessionsPerWeek} tiết`).join('\n');
  const constraintsSummary = constraints.map(c => `- ${c.type === 'TEACHER_BUSY' ? `GV ${c.teacher} bận` : `Lớp ${c.className} cố định môn ${c.subject}`} vào Thứ ${c.day + 2}, Tiết ${c.period + 1}`).join('\n');

  const prompt = `Phân tích tình trạng Thời khóa biểu hiện tại của trường:
1. Tổng số lớp: ${classes.length} (${classes.join(', ')})
2. Tổng số tiết đã xếp thành công: ${totalSlots}
3. Các tiết BỊ KẸT CHƯA THỂ XẾP (${unassigned.length} tiết):
${unassignedSummary || 'Không có (Đã xếp thành công 100%)'}

4. Danh sách các ràng buộc cứng đang áp dụng (${constraints.length} ràng buộc):
${constraintsSummary || 'Không có ràng buộc nào'}

Hãy đưa ra đánh giá chuyên sâu gồm các phần:
### 1. 🔍 Chẩn đoán Nguyên nhân Xung đột (Tại sao các tiết bị kẹt?)
Phân tích nguyên nhân cụ thể vì sao giáo viên đó hoặc lớp đó không thể tìm được ô trống (do giáo viên trùng lịch hay lớp đã kín lịch).

### 2. 💡 Đề xuất Giải pháp Gỡ rối Cụ thể (Từng bước tháo gỡ)
Chỉ rõ nên đổi tiết nào của lớp nào sang thứ mấy để nhường chỗ cho tiết bị kẹt.

### 3. 🎯 Đánh giá Tiêu chuẩn Sư phạm
- Độ phân bổ môn học nặng/nhẹ (Toán, Văn, KHTN vs GDTC, Âm nhạc)
- Tình trạng tiết trống/tiết lủng của giáo viên trong tuần
- Cho điểm chất lượng thời khóa biểu trên thang điểm 100.`;

  return await callGeminiApi({
    prompt,
    systemInstruction
  });
};

// 3. Test connection helper
export const testGeminiApiKey = async (apiKey: string, model: string): Promise<boolean> => {
  const result = await callGeminiApi({
    prompt: 'Xin chào, trả lời ngắn gọn một từ "OK" để xác nhận kết nối thành công.',
    overrideKey: apiKey,
    overrideModel: model
  });
  return Boolean(result && result.trim());
};

// 4. Cross-day Bottleneck Advisor (Cố vấn Điều phối Phân công Chuyên môn & Giải tỏa Điểm nghẽn Liên ngày)
export interface BottleneckAnalysisParams {
  timetable: TimetableGrid;
  unassigned: InputRow[];
  constraints: Constraint[];
  rawData: InputRow[];
  bottleneckStats: BottleneckStats;
}

export const analyzeCrossDayBottlenecksWithGemini = async ({
  timetable,
  unassigned,
  constraints,
  rawData,
  bottleneckStats
}: BottleneckAnalysisParams): Promise<string> => {
  const systemInstruction = `Bạn là Chuyên gia Cố vấn Phân công Chuyên môn & Tối ưu hóa Thời khóa biểu Cấp cao tại Việt Nam.
Nhiệm vụ của bạn là chẩn đoán sâu tình trạng "Nghẽn Lịch Liên Ngày" (Cross-day Bottleneck) khi trường học phải sử dụng cơ chế hoán đổi liên ngày quá nhiều để giải cứu ô Tiết 1.
Bạn cần chỉ ra các giáo viên đang gánh tải bất đối xứng (quá nhiều lớp, quá nhiều tiết sáng) và lập Bảng Đề xuất Điều phối Chuyên môn cụ thể (chuyển lớp giữa các giáo viên cùng bộ môn, chuyển ca) mang tính khả thi cao nhất cho Ban Giám Hiệu.
Quy tắc:
- Ngôn ngữ: Tiếng Việt, văn phong trang trọng, chuẩn mực sư phạm, dùng các icon sinh động, dễ đọc.
- Bắt buộc có Bảng đề xuất chi tiết gồm: Lớp, Môn, Giáo viên hiện tại, Giáo viên đề xuất nhận thay, Số tiết, Lý do.
- Đảm bảo tính khả thi thực tế của trường học phổ thông tại Việt Nam.`;

  // Nhóm giáo viên theo bộ môn để tìm người cùng môn có thể chia sẻ tải
  const subjectTeachersMap = new Map<string, Array<{ teacher: string; sessions: number; classes: string[] }>>();
  const teacherStatsMap = new Map<string, { totalSessions: number; subjects: Set<string>; classes: Set<string> }>();

  rawData.forEach(row => {
    if (!teacherStatsMap.has(row.teacher)) {
      teacherStatsMap.set(row.teacher, { totalSessions: 0, subjects: new Set(), classes: new Set() });
    }
    const tStat = teacherStatsMap.get(row.teacher)!;
    tStat.totalSessions += row.sessionsPerWeek;
    tStat.subjects.add(row.subject);
    tStat.classes.add(row.className);
  });

  rawData.forEach(row => {
    if (!subjectTeachersMap.has(row.subject)) {
      subjectTeachersMap.set(row.subject, []);
    }
    const list = subjectTeachersMap.get(row.subject)!;
    let entry = list.find(e => e.teacher === row.teacher);
    if (!entry) {
      entry = { teacher: row.teacher, sessions: 0, classes: [] };
      list.push(entry);
    }
    entry.sessions += row.sessionsPerWeek;
    if (!entry.classes.includes(row.className)) {
      entry.classes.push(row.className);
    }
  });

  // Xây dựng tóm tắt so sánh các tổ bộ môn có giáo viên trong top quá tải
  const topTeachers = bottleneckStats.highPressureTeachers || [];
  const topTeacherNames = new Set(topTeachers.map(t => t.teacher));

  const peerComparisonSummary: string[] = [];
  subjectTeachersMap.forEach((teachers, subject) => {
    const hasPressureTeacher = teachers.some(t => topTeacherNames.has(t.teacher));
    if (hasPressureTeacher && teachers.length > 1) {
      const peerList = teachers
        .map(t => `${t.teacher} (${t.sessions}t/${t.classes.length} lớp: ${t.classes.join(',')})`)
        .join(' vs ');
      peerComparisonSummary.push(`- Môn ${subject}: ${peerList}`);
    }
  });

  const prompt = `Dưới đây là Báo cáo Định lượng Xung đột Lịch của nhà trường:
1. Tổng số lớp: ${Object.keys(timetable).length} lớp
2. Tổng số tiết đã xếp: ${bottleneckStats.totalAssignedSlots} tiết
3. MẬT ĐỘ XUNG ĐỘT LIÊN NGÀY: ${bottleneckStats.crossDayConflictDensity}% (${bottleneckStats.crossDaySwapsCount} tiết phải hoán đổi ngày để cứu Tiết 1)
4. Tiết chưa thể xếp (Unassigned): ${unassigned.length} tiết

5. DANH SÁCH GIÁO VIÊN ĐANG LÀ NÚT THẮT CỔ CHAI (Top Bottleneck Teachers):
${topTeachers.map((t, idx) => `  ${idx + 1}. Thầy/Cô ${t.teacher}: Tổng ${t.totalSessions} tiết/tuần | Dồn ca sáng: ${t.morningLoad} tiết | Phụ trách ${t.assignedClasses.length} lớp (${t.assignedClasses.join(', ')}) | Bị kẹt/hoán đổi ngày: ${t.crossDayInvolvements} lần`).join('\n')}

6. SO SÁNH NĂNG ĐỊNH CÁC GIÁO VIÊN CÙNG TỔ CHUYÊN MÔN:
${peerComparisonSummary.length > 0 ? peerComparisonSummary.join('\n') : 'Chưa có đủ dữ liệu so sánh cùng bộ môn'}

Hãy đưa ra BÁO CÁO CỐ VẤN ĐIỀU PHỐI CHUYÊN MÔN gồm 4 phần:
### 1. 🔍 Chẩn đoán Nguyên nhân Gốc rễ Gây Nghẽn Lịch
Phân tích tại sao mật độ xung đột liên ngày lại cao (Do giáo viên nào đang phải gánh tải quá tập trung ở ca sáng? Lớp nào bị ảnh hưởng nặng nhất?).

### 2. 📋 Đề xuất Phương án Điều phối Chuyên môn Cụ thể (Actionable Reassignments)
Lập bảng biểu rõ ràng:
| STT | Lớp | Môn | Giáo viên hiện tại (Quá tải) | Giáo viên đề xuất nhận thay | Số tiết/tuần | Phân tích lý do & Lợi ích |
(Lưu ý: Chỉ đề xuất đổi giữa các giáo viên có chuyên môn phù hợp, ưu tiên chuyển bớt lớp từ người có tải ca sáng cao sang người có tải nhẹ hơn).

### 3. ⚖️ Đánh giá Cân bằng Sư phạm & Tác động Dự kiến
- Dự kiến giảm mật độ xung đột liên ngày như thế nào?
- Tiết 1 của học sinh sẽ được vào học đúng giờ ra sao?
- Sự công bằng và giảm áp lực kiệt sức (burnout) cho giáo viên.

### 4. 💡 Khuyến nghị Thực thi Nhanh cho Ban Giám Hiệu
Các bước trao đổi trong tổ bộ môn và cập nhật lại phân công để thời khóa biểu tự động thông thoáng nhất.`;

  return await callGeminiApi({
    prompt,
    systemInstruction
  });
};
