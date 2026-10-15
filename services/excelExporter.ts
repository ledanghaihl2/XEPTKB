import { TimetableGrid, InputRow } from '../types';
import { CLASSES, DAYS, PERIODS, isValidSlot } from '../constants';

// Declare XLSX globally as it is loaded via script tag
declare global {
  interface Window {
    XLSX: any;
  }
}

export const exportScheduleToExcel = (schedule: TimetableGrid, rawData: InputRow[]) => {
  if (!(window as any).XLSX) {
    alert('Thư viện xuất Excel chưa sẵn sàng. Vui lòng thử lại sau giây lát.');
    return;
  }
  const XLSX = (window as any).XLSX;
  const wb = XLSX.utils.book_new();

  const applySheetStyles = (ws: any, rowBorders: Set<number> = new Set()) => {
    if (!ws['!ref']) return;
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        let cell = ws[cellAddress];
        if (!cell) {
          cell = { t: 's', v: '' };
          ws[cellAddress] = cell;
        }
        if (!cell.s) cell.s = {};
        
        // Add borders
        let bottomStyle = 'thin';
        if (rowBorders.has(R)) {
          bottomStyle = 'medium';
        }
        
        cell.s.border = {
          top: { style: 'thin', color: { rgb: "000000" } },
          bottom: { style: bottomStyle, color: { rgb: "000000" } },
          left: { style: 'thin', color: { rgb: "000000" } },
          right: { style: 'thin', color: { rgb: "000000" } }
        };
        
        // Header styling
        if (R === 0) {
          cell.s.font = { bold: true, color: { rgb: "FFFFFF" } };
          cell.s.fill = { fgColor: { rgb: "0F766E" } }; // theme primary color
          cell.s.border.bottom = { style: 'medium', color: { rgb: "000000" } };
        }

        // Alignment
        cell.s.alignment = { vertical: 'center', horizontal: 'center', wrapText: true };
      }
    }
  };

  // --- SHEET 1: THỜI KHÓA BIỂU ---
  const wsDataTKB: (string | number)[][] = [];
  // Header Row
  wsDataTKB.push(['Thứ', 'Tiết', ...CLASSES]);

  const mainTkbBorders = new Set<number>();
  let currentRowIdx = 0; // Header is row 0

  // Lưu vị trí hàng (1-based Excel row number) của từng (day, period) trong sheet "TKB Lớp"
  const slotRowMap: Record<number, Record<number, number>> = {};

  DAYS.forEach((day, dIdx) => {
    slotRowMap[dIdx] = {};
    let dayPrinted = false;
    let validPeriodsCount = PERIODS.filter((_, pIdx) => isValidSlot(dIdx, pIdx)).length;
    let periodsPrinted = 0;

    PERIODS.forEach((period, pIdx) => {
      if (!isValidSlot(dIdx, pIdx)) return;

      const row: (string | number)[] = [!dayPrinted ? day : '', period];
      dayPrinted = true;
      periodsPrinted++;
      currentRowIdx++;

      // Lưu dòng Excel chính xác (Dòng 1 là Tiêu đề, các tiết bắt đầu từ dòng 2)
      slotRowMap[dIdx][pIdx] = currentRowIdx + 1;

      if (periodsPrinted === validPeriodsCount) {
         mainTkbBorders.add(currentRowIdx);
      }

      CLASSES.forEach(cls => {
        const session = schedule[cls]?.[dIdx]?.[pIdx];
        // Combine Subject and Teacher into one cell
        row.push(session ? `${session.subject}\n(${session.teacher})` : '');
      });
      wsDataTKB.push(row);
    });
  });

  const wsTKB = XLSX.utils.aoa_to_sheet(wsDataTKB);
  
  // Basic formatting hints (widening columns slightly)
  const wscols = [{ wch: 10 }, { wch: 12 }];
  CLASSES.forEach(() => wscols.push({ wch: 20 }));
  wsTKB['!cols'] = wscols;
  applySheetStyles(wsTKB, mainTkbBorders);

  XLSX.utils.book_append_sheet(wb, wsTKB, "TKB Lớp");

  // Các dải ô chuẩn trong sheet 'TKB Lớp' để làm công thức liên kết động
  const firstClassCol = XLSX.utils.encode_col(2); // Cột C (Lớp đầu tiên)
  const lastClassCol = XLSX.utils.encode_col(2 + CLASSES.length - 1); // Cột lớp cuối cùng
  const classHeaderRange = `'TKB Lớp'!$${firstClassCol}$1:$${lastClassCol}$1`;
  const maxTkbRow = currentRowIdx + 1;
  const fullTkbGridRange = `'TKB Lớp'!$${firstClassCol}$2:$${lastClassCol}$${maxTkbRow}`;

  // Find all unique teachers
  const allTeachers = Array.from(new Set(rawData.map(r => r.teacher))).sort();

  // --- SHEET 2: TKB GIÁO VIÊN ---
  const wsDataTKB_Teacher: any[][] = [];

  const mergesT: any[] = [];

  allTeachers.forEach((teacher) => {
    // Determine the current row index
    const startRow = wsDataTKB_Teacher.length;

    // Header for the teacher
    wsDataTKB_Teacher.push([`GIÁO VIÊN: ${teacher}`]);
    
    // Add merge for the header (span across all days)
    mergesT.push({ s: { r: startRow, c: 0 }, e: { r: startRow, c: DAYS.length } });

    wsDataTKB_Teacher.push(['Tiết / Thứ', ...DAYS]);
    
    PERIODS.forEach((period, pIdx) => {      const row: any[] = [period];
      DAYS.forEach((day, dIdx) => {
        if (!isValidSlot(dIdx, pIdx)) {
            row.push('--'); // BLOCKED SLOT
            return;
        }

        let found = '';
        for (const cls of CLASSES) {
          const session = schedule[cls]?.[dIdx]?.[pIdx];
          if (session && session.teacher === teacher) {
             found = `${cls}\n(${session.subject})`;
             break;
          }
        }

        const targetRow = slotRowMap[dIdx]?.[pIdx];
        if (targetRow) {
          const rowRange = `'TKB Lớp'!$${firstClassCol}$${targetRow}:$${lastClassCol}$${targetRow}`;
          // Công thức Excel: Dò tìm cột lớp trong dòng tiết tương ứng của 'TKB Lớp' chứa tên giáo viên này.
          // Tự động cập nhật Tên lớp & Môn học khi Thầy/Cô chỉnh sửa ô tại sheet 'TKB Lớp'.
          const formula = `IFERROR(INDEX(${classHeaderRange}, MATCH("*${teacher}*", ${rowRange}, 0)) & CHAR(10) & "(" & TRIM(LEFT(INDEX(${rowRange}, MATCH("*${teacher}*", ${rowRange}, 0)), SEARCH("(", INDEX(${rowRange}, MATCH("*${teacher}*", ${rowRange}, 0)) & "(") - 1)) & ")", "")`;
          row.push({
            t: 's',
            v: found,
            f: formula
          });
        } else {
          row.push(found);
        }
      });
      wsDataTKB_Teacher.push(row);
    });
    // Empty row separator
    wsDataTKB_Teacher.push([]);
  });

  const wsTKB_Teacher = XLSX.utils.aoa_to_sheet(wsDataTKB_Teacher);
  wsTKB_Teacher['!merges'] = mergesT;
  
  const wscolsT = [{ wch: 10 }];
  DAYS.forEach(() => wscolsT.push({ wch: 15 }));
  wsTKB_Teacher['!cols'] = wscolsT;
  
  // Custom styling for Teacher TKB
  if (wsTKB_Teacher['!ref']) {
    const range = XLSX.utils.decode_range(wsTKB_Teacher['!ref']);
    for (let R = range.s.r; R <= range.e.r; ++R) {
      // Check what kind of row this is
      const firstCellAddress = XLSX.utils.encode_cell({ r: R, c: 0 });
      const firstCell = wsTKB_Teacher[firstCellAddress];
      const isTeacherHeader = firstCell && firstCell.v && String(firstCell.v).startsWith('GIÁO VIÊN:');
      const isColsHeader = firstCell && firstCell.v === 'Tiết / Thứ';
      const isEmptyRow = !firstCell || !firstCell.v;
      
      if (isEmptyRow) continue; // skip styling empty rows

      // Assume it's a grid row if it has "Tiết X" in first column, or if we want borders up to DAYS.length
      const numCols = DAYS.length + 1;
      
      for (let C = 0; C < numCols; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        let cell = wsTKB_Teacher[cellAddress];
        if (!cell) {
          cell = { t: 's', v: '' };
          wsTKB_Teacher[cellAddress] = cell;
        }
        if (!cell.s) cell.s = {};
        
        if (isTeacherHeader) {
          if (C === 0) {
            cell.s.font = { bold: true, sz: 14, color: { rgb: "0F766E" } };
            cell.s.alignment = { vertical: 'center', horizontal: 'left' };
          }
          cell.s.border = {
            top: { style: 'thin', color: { rgb: "000000" } },
            bottom: { style: 'thin', color: { rgb: "000000" } },
            left: { style: 'thin', color: { rgb: "000000" } },
            right: { style: 'thin', color: { rgb: "000000" } }
          };
        } else {
          // Regular grid
          cell.s.border = {
            top: { style: 'thin', color: { rgb: "000000" } },
            bottom: { style: 'thin', color: { rgb: "000000" } },
            left: { style: 'thin', color: { rgb: "000000" } },
            right: { style: 'thin', color: { rgb: "000000" } }
          };
          cell.s.alignment = { vertical: 'center', horizontal: 'center', wrapText: true };
          
          if (isColsHeader) {
            cell.s.font = { bold: true, color: { rgb: "FFFFFF" } };
            cell.s.fill = { fgColor: { rgb: "0F766E" } }; 
          } else if (C === 0) {
             cell.s.font = { bold: true };
             cell.s.fill = { fgColor: { rgb: "F3F4F6" } };
          }
        }
      }
    }
  }

  XLSX.utils.book_append_sheet(wb, wsTKB_Teacher, "TKB Giáo viên");

  // --- SHEET 2.5: TKB TỪNG LỚP ---
  const wsDataTKB_Class: any[][] = [];
  const mergesC: any[] = [];

  CLASSES.forEach((cls) => {
    const startRow = wsDataTKB_Class.length;
    wsDataTKB_Class.push([`LỚP: ${cls}`]);
    mergesC.push({ s: { r: startRow, c: 0 }, e: { r: startRow, c: DAYS.length } });
    
    wsDataTKB_Class.push(['Tiết / Thứ', ...DAYS]);
    
    // Cột của lớp này trong sheet 'TKB Lớp'
    const clsColLetter = XLSX.utils.encode_col(2 + CLASSES.indexOf(cls));

    PERIODS.forEach((period, pIdx) => {
      const isRowValid = DAYS.some((_, dIdx) => isValidSlot(dIdx, pIdx));
      if (!isRowValid) return;

      const row: any[] = [period];
      DAYS.forEach((day, dIdx) => {
        if (!isValidSlot(dIdx, pIdx)) {
            row.push('--'); // BLOCKED SLOT
            return;
        }

        const session = schedule[cls]?.[dIdx]?.[pIdx];
        const initialVal = session ? `${session.subject}\n(${session.teacher})` : '';
        const targetRow = slotRowMap[dIdx]?.[pIdx];

        if (targetRow) {
          // Công thức Excel: Trực tiếp lấy ô tương ứng từ sheet 'TKB Lớp'
          // Khi Thầy/Cô chỉnh sửa ô ở 'TKB Lớp', ô tại 'TKB Từng lớp' sẽ tự động cập nhật ngay lập tức!
          row.push({
            t: 's',
            v: initialVal,
            f: `IF('TKB Lớp'!${clsColLetter}${targetRow}="","",'TKB Lớp'!${clsColLetter}${targetRow})`
          });
        } else {
          row.push(initialVal);
        }
      });
      wsDataTKB_Class.push(row);
    });
    wsDataTKB_Class.push([]); // separation
  });

  const wsTKB_Class = XLSX.utils.aoa_to_sheet(wsDataTKB_Class);
  wsTKB_Class['!merges'] = mergesC;
  wsTKB_Class['!cols'] = wscolsT;

  if (wsTKB_Class['!ref']) {
    const range = XLSX.utils.decode_range(wsTKB_Class['!ref']);
    for (let R = range.s.r; R <= range.e.r; ++R) {
      const firstCellAddress = XLSX.utils.encode_cell({ r: R, c: 0 });
      const firstCell = wsTKB_Class[firstCellAddress];
      const isClassHeader = firstCell && firstCell.v && String(firstCell.v).startsWith('LỚP:');
      const isColsHeader = firstCell && firstCell.v === 'Tiết / Thứ';
      const isEmptyRow = !firstCell || !firstCell.v;
      
      if (isEmptyRow) continue; 
      
      const numCols = DAYS.length + 1;
      
      for (let C = 0; C < numCols; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        let cell = wsTKB_Class[cellAddress];
        if (!cell) {
          cell = { t: 's', v: '' };
          wsTKB_Class[cellAddress] = cell;
        }
        if (!cell.s) cell.s = {};
        
        if (isClassHeader) {
          if (C === 0) {
            cell.s.font = { bold: true, sz: 14, color: { rgb: "0F766E" } };
            cell.s.alignment = { vertical: 'center', horizontal: 'left' };
          }
          cell.s.border = {
            top: { style: 'thin', color: { rgb: "000000" } },
            bottom: { style: 'thin', color: { rgb: "000000" } },
            left: { style: 'thin', color: { rgb: "000000" } },
            right: { style: 'thin', color: { rgb: "000000" } }
          };
        } else {
          cell.s.border = {
            top: { style: 'thin', color: { rgb: "000000" } },
            bottom: { style: 'thin', color: { rgb: "000000" } },
            left: { style: 'thin', color: { rgb: "000000" } },
            right: { style: 'thin', color: { rgb: "000000" } }
          };
          cell.s.alignment = { vertical: 'center', horizontal: 'center', wrapText: true };
          
          if (isColsHeader) {
            cell.s.font = { bold: true, color: { rgb: "FFFFFF" } };
            cell.s.fill = { fgColor: { rgb: "0F766E" } }; 
          } else if (C === 0) {
             cell.s.font = { bold: true };
             cell.s.fill = { fgColor: { rgb: "F3F4F6" } };
          }
        }
      }
    }
  }

  XLSX.utils.book_append_sheet(wb, wsTKB_Class, "TKB Từng lớp");

  // --- SHEET 3: THỐNG KÊ GIÁO VIÊN ---
  const statsTeacher: Record<string, { subjects: Set<string>, total: number, classes: Set<string> }> = {};
  rawData.forEach(row => {
    if (!statsTeacher[row.teacher]) {
      statsTeacher[row.teacher] = { subjects: new Set(), total: 0, classes: new Set() };
    }
    statsTeacher[row.teacher].subjects.add(row.subject);
    statsTeacher[row.teacher].total += row.sessionsPerWeek;
    statsTeacher[row.teacher].classes.add(row.className);
  });

  const wsDataTeacher: any[][] = [
    ['STT', 'Tên giáo viên', 'Môn', 'Tổng tiết/tuần', 'Số lớp dạy', 'Ghi chú']
  ];
  Object.entries(statsTeacher).forEach(([name, data], idx) => {
    wsDataTeacher.push([
      idx + 1,
      name,
      Array.from(data.subjects).join(', '),
      {
        t: 'n',
        v: data.total,
        f: `COUNTIF(${fullTkbGridRange}, "*${name}*")`
      },
      data.classes.size,
      ''
    ]);
  });
  const wsTeacher = XLSX.utils.aoa_to_sheet(wsDataTeacher);
  applySheetStyles(wsTeacher);
  wsTeacher['!cols'] = [{wch: 5}, {wch: 20}, {wch: 30}, {wch: 15}, {wch: 15}, {wch: 15}];
  XLSX.utils.book_append_sheet(wb, wsTeacher, "TK Giáo viên");

  // --- SHEET 3: THỐNG KÊ LỚP ---
  const wsDataClass: any[][] = [
    ['STT', 'Lớp', 'Tổng tiết/tuần', 'Số môn học', 'Ghi chú']
  ];
  CLASSES.forEach((cls, idx) => {
    let total = 0;
    const subjects = new Set<string>();
    if (schedule[cls]) {
      schedule[cls].forEach(day => {
        day.forEach(session => {
          if (session) {
            total++;
            subjects.add(session.subject);
          }
        });
      });
    }
    const clsColLetter = XLSX.utils.encode_col(2 + idx);
    wsDataClass.push([
      idx + 1,
      cls,
      {
        t: 'n',
        v: total,
        f: `COUNTIF('TKB Lớp'!$${clsColLetter}$2:$${clsColLetter}$${maxTkbRow}, "<>")`
      },
      subjects.size,
      total === 0 ? 'Chưa xếp' : ''
    ]);
  });
  applySheetStyles(wsClass);
  wsClass['!cols'] = [{wch: 5}, {wch: 15}, {wch: 15}, {wch: 15}, {wch: 15}];
  XLSX.utils.book_append_sheet(wb, wsClass, "TK Lớp");

  // --- SHEET 4: THỐNG KÊ MÔN HỌC ---
  const statsSubject: Record<string, { total: number, classes: Set<string> }> = {};
  rawData.forEach(row => {
    if (!statsSubject[row.subject]) {
      statsSubject[row.subject] = { total: 0, classes: new Set() };
    }
    statsSubject[row.subject].total += row.sessionsPerWeek;
    statsSubject[row.subject].classes.add(row.className);
  });
  
  const wsDataSubject: (string | number)[][] = [
    ['STT', 'Môn học', 'Tổng tiết/tuần', 'Số lớp áp dụng', 'Ghi chú']
  ];
  Object.entries(statsSubject).forEach(([name, data], idx) => {
    wsDataSubject.push([
      idx + 1,
      name,
      data.total,
      data.classes.size,
      ''
    ]);
  });
  const wsSubject = XLSX.utils.aoa_to_sheet(wsDataSubject);
  applySheetStyles(wsSubject);
  wsSubject['!cols'] = [{wch: 5}, {wch: 25}, {wch: 15}, {wch: 15}, {wch: 15}];
  XLSX.utils.book_append_sheet(wb, wsSubject, "TK Môn học");

  // Export
  XLSX.writeFile(wb, "ThoiKhoaBieu-tuan-1-2025.xlsx");
};