import { InputRow } from '../types';

declare global {
  interface Window {
    XLSX: any;
  }
}

export const parseExcelData = async (file: File): Promise<InputRow[]> => {
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
        
        // Assume data is in the first sheet
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        
        const processedData: InputRow[] = [];
        let idCounter = 1;

        jsonData.forEach((row: any) => {
           // Helper to find column value case-insensitively
           const getVal = (keys: string[]) => {
             for (const k of keys) {
               // Find key in row that matches one of the expected keys
               const foundKey = Object.keys(row).find(rk => rk.toLowerCase().trim() === k.toLowerCase());
               if (foundKey !== undefined) return row[foundKey];
             }
             return null;
           };

           // Mapping logic based on likely Vietnamese headers
           const className = getVal(['Lớp', 'Lop', 'Class', 'Lớp học']);
           const subject = getVal(['Môn', 'Mon', 'Subject', 'Môn học', 'Tên môn']);
           const teacher = getVal(['Giáo viên', 'Giao vien', 'Teacher', 'GV', 'Họ tên', 'Tên giáo viên']);
           const sessions = getVal(['Số tiết', 'So tiet', 'Sessions', 'Tiết', 'ST', 'Tổng tiết']);

           // Only add if valid row
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

        if (processedData.length === 0) {
            reject('Không tìm thấy dữ liệu hợp lệ trong file. Vui lòng kiểm tra tên cột (Lớp, Môn, Giáo viên, Số tiết).');
        } else {
            resolve(processedData);
        }
      } catch (err) {
        console.error(err);
        reject('Lỗi khi đọc file Excel. Vui lòng đảm bảo file đúng định dạng.');
      }
    };
    
    reader.onerror = (err) => reject('Lỗi khi đọc file.');
    reader.readAsArrayBuffer(file);
  });
};
