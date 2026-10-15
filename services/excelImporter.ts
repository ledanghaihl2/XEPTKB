import { InputRow, TimetableGrid, ExcelImportResult } from '../types';
import { CLASSES, DAYS, PERIODS } from '../constants';

declare global {
  interface Window {
    XLSX: any;
  }
}

/**
 * Tách nội dung một ô thời khóa biểu thành Môn học và Giáo viên.
 * Hỗ trợ các định dạng:
 * - "Toán\n(Dũng)"
 * - "Toán (Dũng)"
 * - "KHTN-sinh (Hà)"
 * - "Văn\nTrang"
 * - "Tin học - Nam"
 * - "Chào cờ"
 */
export function parseCellSubjectTeacher(cellVal: any): { subject: string; teacher: string } {
  let text = String(cellVal || '').replace(/\u00A0/g, ' ').trim();
  if (!text) return { subject: '', teacher: '' };

  // Xóa dấu '=' nếu là công thức Excel
  if (text.startsWith('=')) {
    text = text.slice(1).trim();
  }

  // Trường hợp 1: Có dấu ngoặc đơn () hoặc []
  // Ví dụ: "Toán\n(Dũng)", "Toán (Dũng)", "KHTN-sinh (V. Chung)"
  const parenMatch = text.match(/^([\s\S]+?)\s*[\(\[]\s*([^\)\]]+)\s*[\)\]]$/);
  if (parenMatch) {
    return {
      subject: parenMatch[1].replace(/[\r\n]+/g, ' ').trim(),
      teacher: parenMatch[2].replace(/[\r\n]+/g, ' ').trim()
    };
  }

  // Trường hợp 2: Có xuống dòng nhiều dòng (Dòng 1: Môn, Dòng 2..: Giáo viên)
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length >= 2) {
    const subject = lines[0];
    const teacher = lines.slice(1).join(' ').replace(/^[\(\[]|[\)\]]$/g, '').trim();
    return { subject, teacher };
  }

  // Trường hợp 3: Ngăn cách bởi dấu gạch ngang, hai chấm hoặc gạch chéo: "Toán - Dũng", "Toán: Dũng"
  const splitMatch = text.match(/^([^\-\–\:\/]+)\s*[\-\–\:\/]\s*([^\-\–\:\/]+)$/);
  if (splitMatch) {
    return {
      subject: splitMatch[1].trim(),
      teacher: splitMatch[2].trim()
    };
  }

  // Trường hợp 4: Chỉ có tên môn hoặc nội dung đơn
  return {
    subject: text.trim(),
    teacher: ''
  };
}

/**
 * Nhận diện chỉ số Thứ trong tuần (0-based: 0=Thứ 2 ... 4=Thứ 6).
 */
export function parseDayIndex(val: any): number {
  if (!val) return -1;
  const s = String(val).toLowerCase().replace(/\u00A0/g, ' ').trim();
  if (s.includes('2') || s.includes('hai') || s.includes('mon')) return 0;
  if (s.includes('3') || s.includes('ba') || s.includes('tue')) return 1;
  if (s.includes('4') || s.includes('tư') || s.includes('tu') || s.includes('wed')) return 2;
  if (s.includes('5') || s.includes('năm') || s.includes('nam') || s.includes('thu')) return 3;
  if (s.includes('6') || s.includes('sáu') || s.includes('sau') || s.includes('fri')) return 4;
  return -1;
}

/**
 * Nhận diện chỉ số Tiết trong ngày (0-based: 0-4 Sáng 1-5, 5-7 Chiều 1-3).
 */
export function parsePeriodIndex(val: any): number {
  if (!val) return -1;
  const s = String(val).toLowerCase().replace(/\u00A0/g, ' ').trim();

  const isAfternoon = s.includes('chiều') || s.includes('chieu') || s.startsWith('c') || s.includes('ch');
  const isMorning = s.includes('sáng') || s.includes('sang') || s.startsWith('s');

  const matchNum = s.match(/\d+/);
  if (matchNum) {
    const n = parseInt(matchNum[0], 10);
    if (isAfternoon) {
      if (n >= 1 && n <= 3) return 4 + n; // 1->5 (Chiều 1), 2->6 (Chiều 2), 3->7 (Chiều 3)
      if (n >= 6 && n <= 8) return n - 1; // 6->5, 7->6, 8->7
    } else if (isMorning) {
      if (n >= 1 && n <= 5) return n - 1; // 1->0 ... 5->4
    } else {
      if (n >= 1 && n <= 8) return n - 1;
    }
  }

  const foundIdx = PERIODS.findIndex(p => p.toLowerCase() === s);
  if (foundIdx !== -1) return foundIdx;

  return -1;
}

/**
 * Hàm phân tích file Excel thông minh:
 * - Chế độ 1: Ma trận Thời khóa biểu (Sheet "TKB Lớp" hoặc bảng có cột Thứ, Tiết, Lớp)
 * - Chế độ 2: Bảng danh sách phân công môn học (Cột Lớp, Môn, Giáo viên, Số tiết)
 */
export const parseExcelData = async (file: File): Promise<ExcelImportResult> => {
  return new Promise((resolve, reject) => {
    if (!(window as any).XLSX) {
      reject('Thư viện xử lý Excel chưa sẵn sàng. Vui lòng đợi giây lát hoặc tải lại trang.');
      return;
    }
    const XLSX = (window as any).XLSX;
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'array' });

        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
          reject('Tệp Excel không chứa bất kỳ bảng tính (sheet) nào.');
          return;
        }

        // =====================================================================
        // 1. KIỂM TRA CHẾ ĐỘ MA TRẬN THỜI KHÓA BIỂU (TIMETABLE GRID)
        // =====================================================================

        // Ưu tiên tìm sheet có tên "TKB Lớp", "TKB", "Thời khóa biểu"
        let matrixSheetName = workbook.SheetNames.find((name: string) => 
          /tkb.*l[ớo]p|thời\s*khóa\s*biểu|thoi\s*khoa\s*bieu|^tkb/i.test(name.trim())
        );

        let targetMatrixWs = matrixSheetName ? workbook.Sheets[matrixSheetName] : null;
        let detectedHeaderRowIdx = -1;
        let colDay = -1;
        let colPeriod = -1;
        let classColumns: { colIdx: number; className: string }[] = [];

        // Duyệt qua các sheet để kiểm tra cấu trúc bảng ma trận TKB
        const candidateSheetNames = matrixSheetName ? [matrixSheetName, ...workbook.SheetNames.filter((s: string) => s !== matrixSheetName)] : workbook.SheetNames;

        for (const sheetName of candidateSheetNames) {
          const ws = workbook.Sheets[sheetName];
          if (!ws) continue;

          const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
          if (!rows || rows.length < 3) continue;

          // Tìm hàng tiêu đề chứa Thứ, Tiết và các tên Lớp
          for (let r = 0; r < Math.min(rows.length, 10); r++) {
            const row = rows[r];
            if (!Array.isArray(row)) continue;

            let dayIdx = -1;
            let periodIdx = -1;
            const foundClasses: { colIdx: number; className: string }[] = [];

            row.forEach((cellVal, cIdx) => {
              const cellStr = String(cellVal || '').replace(/\u00A0/g, ' ').trim();
              if (/^(thứ|thu|day)$/i.test(cellStr)) {
                dayIdx = cIdx;
              } else if (/^(tiết|tiet|period|buổi\s*tiết)$/i.test(cellStr)) {
                periodIdx = cIdx;
              } else if (cellStr && cellStr.length <= 15 && !/^(stt|ghi\s*chú|note)$/i.test(cellStr)) {
                // Kiểm tra có khớp danh sách lớp đã biết hoặc quy tắc lớp học (ví dụ: 6A, 7B, 10A1...)
                if (CLASSES.includes(cellStr) || /^[0-9]{1,2}[A-Za-z0-9_]+$/.test(cellStr)) {
                  foundClasses.push({ colIdx: cIdx, className: cellStr });
                }
              }
            });

            // Nếu tìm thấy cột Thứ, cột Tiết và ít nhất 1 lớp học
            if (dayIdx !== -1 && periodIdx !== -1 && foundClasses.length > 0) {
              targetMatrixWs = ws;
              matrixSheetName = sheetName;
              detectedHeaderRowIdx = r;
              colDay = dayIdx;
              colPeriod = periodIdx;
              classColumns = foundClasses;
              break;
            }
          }

          if (detectedHeaderRowIdx !== -1) break;
        }

        // Nếu phát hiện ma trận thời khóa biểu
        if (targetMatrixWs && detectedHeaderRowIdx !== -1 && classColumns.length > 0) {
          const rows: any[][] = XLSX.utils.sheet_to_json(targetMatrixWs, { header: 1, defval: '' });
          
          // Khởi tạo lưới thời khóa biểu
          const grid: TimetableGrid = {};
          const detectedClassNames = classColumns.map(c => c.className);
          const allWorkingClasses = Array.from(new Set([...CLASSES, ...detectedClassNames]));

          allWorkingClasses.forEach(cls => {
            grid[cls] = Array(DAYS.length).fill(null).map(() => Array(PERIODS.length).fill(null));
          });

          let currentDayIdx = -1;

          for (let r = detectedHeaderRowIdx + 1; r < rows.length; r++) {
            const row = rows[r];
            if (!row || row.length === 0) continue;

            // Đọc ngày từ cột Thứ (nếu có, không có thì giữ nguyên ngày hiện tại)
            const dayCell = String(row[colDay] || '').trim();
            if (dayCell) {
              const parsedDay = parseDayIndex(dayCell);
              if (parsedDay !== -1) {
                currentDayIdx = parsedDay;
              }
            }

            if (currentDayIdx === -1 || currentDayIdx >= DAYS.length) continue;

            // Đọc tiết học từ cột Tiết
            const periodCell = String(row[colPeriod] || '').trim();
            if (!periodCell) continue;
            const periodIdx = parsePeriodIndex(periodCell);
            if (periodIdx === -1 || periodIdx >= PERIODS.length) continue;

            // Đọc từng lớp học
            for (const { colIdx, className } of classColumns) {
              const cellVal = row[colIdx];
              if (cellVal === undefined || cellVal === null || String(cellVal).trim() === '') {
                grid[className][currentDayIdx][periodIdx] = null;
                continue;
              }

              const { subject, teacher } = parseCellSubjectTeacher(cellVal);
              if (subject) {
                grid[className][currentDayIdx][periodIdx] = {
                  day: currentDayIdx,
                  period: periodIdx,
                  subject: subject,
                  teacher: teacher || 'Chưa phân công'
                };
              } else {
                grid[className][currentDayIdx][periodIdx] = null;
              }
            }
          }

          // Kiểm tra phát hiện xung đột lịch giáo viên (trùng tiết cùng lúc ở nhiều lớp)
          const conflicts: string[] = [];
          for (let d = 0; d < DAYS.length; d++) {
            for (let p = 0; p < PERIODS.length; p++) {
              const teacherAssignments = new Map<string, string[]>();

              allWorkingClasses.forEach(cls => {
                const session = grid[cls]?.[d]?.[p];
                if (session && session.teacher && session.teacher !== 'Chưa phân công') {
                  const t = session.teacher;
                  if (!teacherAssignments.has(t)) {
                    teacherAssignments.set(t, []);
                  }
                  teacherAssignments.get(t)!.push(cls);
                }
              });

              teacherAssignments.forEach((classes, teacher) => {
                if (classes.length > 1) {
                  conflicts.push(`Giáo viên "${teacher}" trùng giờ vào ${DAYS[d]}, ${PERIODS[p]} tại các lớp: ${classes.join(', ')}`);
                }
              });
            }
          }

          // Tổng hợp ngược thành danh sách phân công chuyên môn (InputRow[])
          const assignmentMap = new Map<string, { className: string; subject: string; teacher: string; count: number }>();
          
          allWorkingClasses.forEach(cls => {
            for (let d = 0; d < DAYS.length; d++) {
              for (let p = 0; p < PERIODS.length; p++) {
                const session = grid[cls]?.[d]?.[p];
                if (session && session.subject) {
                  const key = `${cls}___${session.subject}___${session.teacher}`;
                  if (!assignmentMap.has(key)) {
                    assignmentMap.set(key, {
                      className: cls,
                      subject: session.subject,
                      teacher: session.teacher,
                      count: 0
                    });
                  }
                  assignmentMap.get(key)!.count++;
                }
              }
            }
          });

          let idCounter = 1;
          const aggregatedData: InputRow[] = [];
          assignmentMap.forEach(item => {
            aggregatedData.push({
              id: idCounter++,
              className: item.className,
              subject: item.subject,
              teacher: item.teacher,
              sessionsPerWeek: item.count
            });
          });

          resolve({
            mode: 'TIMETABLE_GRID',
            schedule: grid,
            data: aggregatedData,
            conflicts,
            detectedClasses: detectedClassNames,
            message: `Đã đọc thành công ma trận Thời khóa biểu từ Sheet "${matrixSheetName}"`
          });
          return;
        }

        // =====================================================================
        // 2. CHẾ ĐỘ DANH SÁCH PHÂN CÔNG CHUYÊN MÔN (TRADITIONAL ASSIGNMENT LIST)
        // =====================================================================
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        const processedData: InputRow[] = [];
        let idCounter = 1;

        jsonData.forEach((row: any) => {
          const getVal = (keys: string[]) => {
            for (const k of keys) {
              const foundKey = Object.keys(row).find(rk => rk.toLowerCase().trim() === k.toLowerCase());
              if (foundKey !== undefined) return row[foundKey];
            }
            return null;
          };

          const className = getVal(['Lớp', 'Lop', 'Class', 'Lớp học']);
          const subject = getVal(['Môn', 'Mon', 'Subject', 'Môn học', 'Tên môn']);
          const teacher = getVal(['Giáo viên', 'Giao vien', 'Teacher', 'GV', 'Họ tên', 'Tên giáo viên']);
          const sessions = getVal(['Số tiết', 'So tiet', 'Sessions', 'Tiết', 'ST', 'Tổng tiết']);

          if (className && subject && teacher && sessions) {
            processedData.push({
              id: idCounter++,
              className: String(className).trim(),
              subject: String(subject).trim(),
              teacher: String(teacher).trim(),
              sessionsPerWeek: Number(sessions)
            });
          }
        });

        if (processedData.length > 0) {
          resolve({
            mode: 'ASSIGNMENT_LIST',
            data: processedData,
            message: `Đã đọc danh sách phân công gồm ${processedData.length} dòng.`
          });
          return;
        }

        reject(
          'Không tìm thấy dữ liệu hợp lệ trong file Excel.\n' +
          'Phần mềm hỗ trợ 2 định dạng file:\n' +
          '1. File Thời khóa biểu đã xuất từ phần mềm (Sheet "TKB Lớp" có cột Thứ, Tiết và các Lớp).\n' +
          '2. File Bảng phân công môn học (gồm các cột: Lớp, Môn, Giáo viên, Số tiết).'
        );

      } catch (err: any) {
        console.error(err);
        reject('Lỗi khi đọc file Excel: ' + (err?.message || 'Vui lòng kiểm tra định dạng file.'));
      }
    };

    reader.onerror = () => reject('Lỗi khi đọc file từ máy tính.');
    reader.readAsArrayBuffer(file);
  });
};

