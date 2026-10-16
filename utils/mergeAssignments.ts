import { InputRow, TimetableGrid } from '../types';

/**
 * Gộp danh sách phân công môn học cũ và mới:
 * - Nếu phân công (className, subject, teacher) đã tồn tại: Cập nhật số tiết theo dữ liệu mới từ Excel.
 * - Nếu là lớp mới, môn mới hoặc giáo viên mới: Tự động bổ sung thêm vào danh sách với ID duy nhất.
 */
export function mergeAssignments(existingList: InputRow[], incomingList: InputRow[]): InputRow[] {
  const merged: InputRow[] = existingList.map(r => ({ ...r }));
  
  let maxId = 0;
  for (const r of merged) {
    const numId = typeof r.id === 'number' ? r.id : parseInt(String(r.id), 10);
    if (!isNaN(numId) && numId > maxId) maxId = numId;
  }

  for (const newRow of incomingList) {
    const clsNorm = (newRow.className || '').trim().toLowerCase();
    const subNorm = (newRow.subject || '').trim().toLowerCase();
    const tchNorm = (newRow.teacher || '').trim().toLowerCase();

    if (!clsNorm || !subNorm) continue;

    const existingIndex = merged.findIndex(r => 
      (r.className || '').trim().toLowerCase() === clsNorm &&
      (r.subject || '').trim().toLowerCase() === subNorm &&
      (r.teacher || '').trim().toLowerCase() === tchNorm
    );

    if (existingIndex >= 0) {
      merged[existingIndex].sessionsPerWeek = newRow.sessionsPerWeek || 1;
    } else {
      maxId++;
      merged.push({
        id: maxId,
        teacher: (newRow.teacher || '').trim(),
        subject: (newRow.subject || '').trim(),
        className: (newRow.className || '').trim(),
        sessionsPerWeek: newRow.sessionsPerWeek || 1
      });
    }
  }

  return merged;
}

/**
 * Gộp ma trận Thời khóa biểu cũ và mới:
 * - Các lớp trong incomingSchedule sẽ được bổ sung vào mergedSchedule (hoặc cập nhật lớp tương ứng).
 * - Các lớp cũ không có trong tệp mới vẫn được bảo toàn nguyên vẹn 100%.
 */
export function mergeSchedules(existingSchedule: TimetableGrid, incomingSchedule: TimetableGrid): TimetableGrid {
  const merged: TimetableGrid = { ...existingSchedule };

  for (const cls of Object.keys(incomingSchedule)) {
    merged[cls] = incomingSchedule[cls];
  }

  return merged;
}
