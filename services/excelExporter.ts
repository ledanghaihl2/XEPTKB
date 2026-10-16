import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { TimetableGrid, InputRow, ShiftType, Constraint } from '../types';
import { CLASSES, DAYS, PERIODS, isValidSlot, isSlotValidForClass, isPeriodInShift } from '../constants';
import { validateOpenXmlArchive } from './openXmlValidator';

// Declare XLSX globally as it is loaded via script tag
declare global {
  interface Window {
    XLSX: any;
  }
}

export const exportScheduleToExcel = async (
  schedule: TimetableGrid, 
  rawData: InputRow[], 
  selectedShift: ShiftType = 'ALL',
  constraints?: Constraint[],
  classes?: string[]
) => {
  try {
    if (!(window as any).XLSX) {
      alert('Thư viện xuất Excel chưa sẵn sàng. Vui lòng thử lại sau giây lát.');
      return;
    }
    const XLSX = (window as any).XLSX;
    const wb = XLSX.utils.book_new();

    const targetClasses = classes && classes.length > 0 ? classes : (
      rawData.length > 0 ? Array.from(new Set(rawData.map(r => r.className))).sort((a,b) => a.localeCompare(b, 'vi', {numeric: true})) : (
        Object.keys(schedule).length > 0 ? Object.keys(schedule).sort((a,b) => a.localeCompare(b, 'vi', {numeric: true})) : CLASSES
      )
    );

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
  wsDataTKB.push(['Thứ', 'Tiết', ...targetClasses]);

  const mainTkbBorders = new Set<number>();
  let currentRowIdx = 0; // Header is row 0

  // Lưu vị trí hàng (1-based Excel row number) của từng (day, period) trong sheet "TKB Lớp"
  const slotRowMap: Record<number, Record<number, number>> = {};

  DAYS.forEach((day, dIdx) => {
    slotRowMap[dIdx] = {};
    let dayPrinted = false;
    let validPeriodsCount = PERIODS.filter((_, pIdx) => isValidSlot(dIdx, pIdx, constraints) && isPeriodInShift(pIdx, selectedShift)).length;
    let periodsPrinted = 0;

    PERIODS.forEach((period, pIdx) => {
      if (!isPeriodInShift(pIdx, selectedShift)) return;
      if (!isValidSlot(dIdx, pIdx, constraints)) return;

      const row: (string | number)[] = [!dayPrinted ? day : '', period];
      dayPrinted = true;
      periodsPrinted++;
      currentRowIdx++;

      // Lưu dòng Excel chính xác (Dòng 1 là Tiêu đề, các tiết bắt đầu từ dòng 2)
      slotRowMap[dIdx][pIdx] = currentRowIdx + 1;

      if (periodsPrinted === validPeriodsCount) {
         mainTkbBorders.add(currentRowIdx);
      }

      targetClasses.forEach(cls => {
        const session = schedule[cls]?.[dIdx]?.[pIdx];
        // Combine Subject and Teacher into one cell (chuẩn hóa tên giáo viên)
        row.push(session ? `${session.subject}\n(${session.teacher ? session.teacher.trim() : ''})` : '');
      });
      wsDataTKB.push(row);
    });
  });

  const wsTKB = XLSX.utils.aoa_to_sheet(wsDataTKB);
  
  // Basic formatting hints (widening columns slightly)
  const wscols = [{ wch: 10 }, { wch: 12 }];
  targetClasses.forEach(() => wscols.push({ wch: 20 }));
  wsTKB['!cols'] = wscols;
  applySheetStyles(wsTKB, mainTkbBorders);

  XLSX.utils.book_append_sheet(wb, wsTKB, "TKB Lớp");

  // Các dải ô chuẩn trong sheet 'TKB Lớp' để làm công thức liên kết động
  const firstClassCol = XLSX.utils.encode_col(2); // Cột C (Lớp đầu tiên)
  const lastClassCol = XLSX.utils.encode_col(2 + targetClasses.length - 1); // Cột lớp cuối cùng
  const classHeaderRange = `'TKB Lớp'!$${firstClassCol}$1:$${lastClassCol}$1`;
  const maxTkbRow = currentRowIdx + 1;
  const fullTkbGridRange = `'TKB Lớp'!$${firstClassCol}$2:$${lastClassCol}$${maxTkbRow}`;

  // Tìm tất cả giáo viên từ phân công gốc và thời khóa biểu thực tế
  const teacherSet = new Set<string>();
  rawData.forEach(r => { if (r.teacher && r.teacher.trim()) teacherSet.add(r.teacher.trim()); });
  targetClasses.forEach(cls => {
    schedule[cls]?.forEach(day => {
      day?.forEach(session => {
        if (session?.teacher && session.teacher.trim()) {
          teacherSet.add(session.teacher.trim());
        }
      });
    });
  });
  const allTeachers = Array.from(teacherSet).sort((a, b) => a.localeCompare(b, 'vi'));

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
    
    PERIODS.forEach((period, pIdx) => {
      if (!isPeriodInShift(pIdx, selectedShift)) return;
      const row: any[] = [period];
      DAYS.forEach((day, dIdx) => {
        if (!isValidSlot(dIdx, pIdx, constraints)) {
            row.push('--'); // BLOCKED SLOT
            return;
        }

        const matchedClasses: { cls: string; subject: string }[] = [];
        for (const cls of targetClasses) {
          const session = schedule[cls]?.[dIdx]?.[pIdx];
          if (session && session.teacher && session.teacher.trim().toLowerCase() === teacher.trim().toLowerCase()) {
             matchedClasses.push({ cls, subject: session.subject });
          }
        }

        let found = '';
        if (matchedClasses.length === 1) {
          found = `${matchedClasses[0].cls}\n(${matchedClasses[0].subject})`;
        } else if (matchedClasses.length > 1) {
          found = `⚠️ TRÙNG ${matchedClasses.length} LỚP!`;
        }

        const targetRow = slotRowMap[dIdx]?.[pIdx];
        if (targetRow) {
          const rowRange = `'TKB Lớp'!$${firstClassCol}$${targetRow}:$${lastClassCol}$${targetRow}`;
          // Công thức Excel: Dò tìm cột lớp trong dòng tiết tương ứng của 'TKB Lớp' chứa tên giáo viên này.
          // Sử dụng "*(" & teacher & ")*" để so khớp chính xác tên trong ngoặc đơn (tránh nhầm "Hoa" với "Hoan", "Khoa"...)
          // Tự động kiểm tra nếu giáo viên bị xếp trùng từ 2 lớp trở lên trong cùng 1 tiết sẽ hiện cảnh báo TRÙNG.
          const matchPattern = `"*(${teacher.trim()})*"`;
          const conflictCount = `COUNTIF(${rowRange}, ${matchPattern})`;
          const baseFormula = `INDEX(${classHeaderRange}, MATCH(${matchPattern}, ${rowRange}, 0)) & CHAR(10) & "(" & TRIM(CLEAN(LEFT(INDEX(${rowRange}, MATCH(${matchPattern}, ${rowRange}, 0)), SEARCH("(", INDEX(${rowRange}, MATCH(${matchPattern}, ${rowRange}, 0)) & "(") - 1))) & ")"`;
          const formula = `IF(${conflictCount}=0, "", IF(${conflictCount}>1, "⚠️ TRÙNG " & ${conflictCount} & " LỚP!", ${baseFormula}))`;

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

  targetClasses.forEach((cls) => {
    const startRow = wsDataTKB_Class.length;
    wsDataTKB_Class.push([`LỚP: ${cls}`]);
    mergesC.push({ s: { r: startRow, c: 0 }, e: { r: startRow, c: DAYS.length } });
    
    wsDataTKB_Class.push(['Tiết / Thứ', ...DAYS]);
    
    // Cột của lớp này trong sheet 'TKB Lớp'
    const clsColLetter = XLSX.utils.encode_col(2 + targetClasses.indexOf(cls));

    PERIODS.forEach((period, pIdx) => {
      const isRowValid = DAYS.some((_, dIdx) => isSlotValidForClass(cls, dIdx, pIdx, constraints));
      if (!isRowValid) return;

      const row: any[] = [period];
      DAYS.forEach((day, dIdx) => {
        if (!isSlotValidForClass(cls, dIdx, pIdx, constraints)) {
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
    const tName = row.teacher ? row.teacher.trim() : '';
    if (!tName) return;
    if (!statsTeacher[tName]) {
      statsTeacher[tName] = { subjects: new Set(), total: 0, classes: new Set() };
    }
    statsTeacher[tName].subjects.add(row.subject);
    statsTeacher[tName].total += row.sessionsPerWeek;
    statsTeacher[tName].classes.add(row.className);
  });

  // Đảm bảo mọi giáo viên có trong TKB đều được thống kê
  allTeachers.forEach(tName => {
    if (!statsTeacher[tName]) {
      let totalAssigned = 0;
      const subjects = new Set<string>();
      const classes = new Set<string>();
      targetClasses.forEach(cls => {
        schedule[cls]?.forEach(day => {
          day?.forEach(session => {
            if (session && session.teacher && session.teacher.trim().toLowerCase() === tName.toLowerCase()) {
              totalAssigned++;
              subjects.add(session.subject);
              classes.add(cls);
            }
          });
        });
      });
      statsTeacher[tName] = { subjects, total: totalAssigned, classes };
    }
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
        f: `COUNTIF(${fullTkbGridRange}, "*(${name.trim()})*")`
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
  targetClasses.forEach((cls, idx) => {
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
  const wsClass = XLSX.utils.aoa_to_sheet(wsDataClass);
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

  // --- SHEET 5: DANH MỤC CHỌN (DÙNG CHO DANH SÁCH THẢ XUỐNG DATA VALIDATION) ---
  const classDropdownOptions: Record<string, string[]> = {};
  let maxDropdownRows = allTeachers.length;

  targetClasses.forEach(cls => {
    const assignmentSet = new Set<string>();
    rawData.filter(r => r.className === cls).forEach(r => {
      if (r.subject && r.teacher) {
        assignmentSet.add(`${r.subject.trim()} (${r.teacher.trim()})`);
      }
    });
    schedule[cls]?.forEach(day => {
      day?.forEach(session => {
        if (session && session.subject && session.teacher) {
          assignmentSet.add(`${session.subject.trim()} (${session.teacher.trim()})`);
        }
      });
    });

    const options = [
      ...Array.from(assignmentSet),
      'Chào cờ',
      'Sinh hoạt',
      '(Trống)'
    ];
    classDropdownOptions[cls] = options;
    if (options.length > maxDropdownRows) {
      maxDropdownRows = options.length;
    }
  });

  const wsDataDropdown: (string)[][] = [];
  const headerRowDropdown: string[] = ['Tất Cả Giáo Viên', ''];
  targetClasses.forEach(cls => headerRowDropdown.push(`Lớp ${cls}`));
  wsDataDropdown.push(headerRowDropdown);

  for (let r = 0; r < maxDropdownRows; r++) {
    const row: string[] = [
      allTeachers[r] || '',
      ''
    ];
    targetClasses.forEach(cls => {
      row.push(classDropdownOptions[cls]?.[r] || '');
    });
    wsDataDropdown.push(row);
  }

  const wsDropdown = XLSX.utils.aoa_to_sheet(wsDataDropdown);
  applySheetStyles(wsDropdown);
  const wscolsDropdown = [{ wch: 20 }, { wch: 5 }];
  targetClasses.forEach(() => wscolsDropdown.push({ wch: 22 }));
  wsDropdown['!cols'] = wscolsDropdown;
  XLSX.utils.book_append_sheet(wb, wsDropdown, "Danh Mục Chọn");

  // --- XUẤT FILE EXCEL VỚI ĐỊNH DẠNG TÔ MÀU CẢNH BÁO TRÙNG LỊCH & DANH SÁCH CHỌN THẢ XUỐNG (DROPDOWN) ---
  const shiftSuffix = selectedShift === 'MORNING' ? '-BuoiSang' : selectedShift === 'AFTERNOON' ? '-BuoiChieu' : '';
  const fileName = `ThoiKhoaBieu-tuan-1-2025${shiftSuffix}.xlsx`;

  try {
    // 1. Tạo buffer file Excel dạng binary array từ XLSX
    const u8 = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    
    // 2. Sử dụng JSZip để can thiệp vào cấu trúc OpenXML của file .xlsx
    const zip = await JSZip.loadAsync(u8);
    let sheet1Xml = await zip.file('xl/worksheets/sheet1.xml')?.async('string');
    let sheet2Xml = await zip.file('xl/worksheets/sheet2.xml')?.async('string');
    let stylesXml = await zip.file('xl/styles.xml')?.async('string');

    if (sheet1Xml && stylesXml) {
      // 3. Khai báo kiểu định dạng cảnh báo lỗi dxf trong styles.xml tuân thủ nghiêm ngặt chuẩn OpenXML ECMA-376:
      // Trong <font>: <b/> phải đứng trước <color>
      // Trong <border>: thứ tự bắt buộc là left, right, top, bottom
      const dxfXml = '<dxfs count="1"><dxf><font><b/><color rgb="FF9C0006"/></font><fill><patternFill patternType="solid"><fgColor rgb="FFFFC7CE"/><bgColor indexed="64"/></patternFill></fill><border><left style="thin"><color rgb="FF9C0006"/></left><right style="thin"><color rgb="FF9C0006"/></right><top style="thin"><color rgb="FF9C0006"/></top><bottom style="thin"><color rgb="FF9C0006"/></bottom></border></dxf></dxfs>';
      
      stylesXml = stylesXml.replace(/<dxfs[\s\S]*?<\/dxfs>|<dxfs\s*count="0"\s*\/>/, dxfXml);
      zip.file('xl/styles.xml', stylesXml);

      // Hàm chèn thẻ đúng thứ tự lược đồ (XML Schema sequence) của ECMA-376:
      // conditionalFormatting & dataValidations phải đứng trước hyperlinks, pageMargins, ignoredErrors
      const insertBeforeSchemaTags = (xml: string, content: string) => {
        const candidates = ['<hyperlinks', '<printOptions', '<pageMargins', '<pageSetup', '<headerFooter', '<ignoredErrors', '</worksheet>'];
        for (const tag of candidates) {
          if (xml.includes(tag)) {
            return xml.replace(tag, content + tag);
          }
        }
        return xml.replace('</worksheet>', content + '</worksheet>');
      };

      // 4. Áp dụng Conditional Formatting cho Sheet 1 ("TKB Lớp"):
      // Quét toàn bộ các ô phân công từ C2 đến cột lớp cuối cùng hàng cuối cùng.
      const cfSqref = `${firstClassCol}2:${lastClassCol}${maxTkbRow}`;
      const cfFormula1 = `AND(${firstClassCol}2&lt;&gt;&quot;&quot;,COUNTIF($${firstClassCol}2:$${lastClassCol}2,&quot;*(&quot;&amp;MID(${firstClassCol}2,SEARCH(&quot;(&quot;,${firstClassCol}2&amp;&quot;(&quot;)+1,SEARCH(&quot;)&quot;,${firstClassCol}2&amp;&quot;)&quot;)-SEARCH(&quot;(&quot;,${firstClassCol}2&amp;&quot;(&quot;)-1)&amp;&quot;)*&quot;)&gt;1)`;
      const cfXml1 = `<conditionalFormatting sqref="${cfSqref}"><cfRule type="expression" dxfId="0" priority="1"><formula>${cfFormula1}</formula></cfRule></conditionalFormatting>`;

      // 5. Áp dụng Data Validation (Danh sách chọn thả xuống Dropdown List) cho từng cột Lớp trong Sheet 1 ("TKB Lớp"):
      const dvTags = targetClasses.map((cls, idx) => {
        const colLetter = XLSX.utils.encode_col(2 + idx);
        const endRow = 1 + (classDropdownOptions[cls]?.length || 1);
        return `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" sqref="${colLetter}2:${colLetter}${maxTkbRow}"><formula1>&apos;Danh Mục Chọn&apos;!$${colLetter}$2:$${colLetter}$${endRow}</formula1></dataValidation>`;
      }).join('');
      const dvXml = `<dataValidations count="${targetClasses.length}">${dvTags}</dataValidations>`;

      const combinedSheet1Xml = cfXml1 + dvXml;
      sheet1Xml = insertBeforeSchemaTags(sheet1Xml, combinedSheet1Xml);
      zip.file('xl/worksheets/sheet1.xml', sheet1Xml);

      // 5. Áp dụng Conditional Formatting cho Sheet 2 ("TKB Giáo viên"):
      // Tự động tô đỏ bất kỳ ô nào có chữ "TRÙNG"
      if (sheet2Xml) {
        const cfXml2 = `<conditionalFormatting sqref="B2:F${wsDataTKB_Teacher.length}"><cfRule type="expression" dxfId="0" priority="1"><formula>NOT(ISERROR(SEARCH(&quot;TRÙNG&quot;,B2)))</formula></cfRule></conditionalFormatting>`;
        sheet2Xml = insertBeforeSchemaTags(sheet2Xml, cfXml2);
        zip.file('xl/worksheets/sheet2.xml', sheet2Xml);
      }

      // 6. Cấu hình tự động tính toán lại toàn bộ công thức (Automatic Calculation)
      // Bắt buộc Microsoft Excel phải tự động tính lại liên kết Sheet khi người dùng chỉnh sửa bất kỳ ô nào
      let wbXml = await zip.file('xl/workbook.xml')?.async('string');
      if (wbXml) {
        const calcPrXml = '<calcPr calcId="191029" fullCalcOnLoad="1" forceFullCalc="1"/>';
        if (wbXml.includes('<calcPr')) {
          wbXml = wbXml.replace(/<calcPr[^>]*\/>/, calcPrXml);
        } else if (wbXml.includes('</workbook>')) {
          wbXml = wbXml.replace('</workbook>', calcPrXml + '</workbook>');
        }
        zip.file('xl/workbook.xml', wbXml);
      }
      if (zip.file('xl/calcChain.xml')) {
        zip.remove('xl/calcChain.xml');
      }

      // 7. Thẩm định tính toàn vẹn của tệp OpenXML (In-browser File Validator)
      // Tự động kiểm tra tính hợp lệ của mọi file XML bên trong trước khi tải xuống
      const report = await validateOpenXmlArchive(zip);
      console.log(`[OpenXML Validator] Đã kiểm định ${report.checkedFilesCount} tệp trong ${report.durationMs}ms:`, report);

      if (!report.isValid) {
        console.warn('⚠️ Phát hiện vi phạm cấu trúc OpenXML, kích hoạt chế độ xuất chuẩn an toàn bảo toàn 100% dữ liệu:', report.errors);
        XLSX.writeFile(wb, fileName);
        return;
      }

      // 8. Đóng gói lại thành Blob và kích hoạt tải về
      const blob = await zip.generateAsync({
        type: 'blob',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      saveAs(blob, fileName);
      return;
    }
  } catch (err) {
    console.warn('Lỗi chèn Conditional Formatting OpenXML, kích hoạt xuất XLSX chuẩn dự phòng:', err);
  }

  // Phương án dự phòng chuẩn
  XLSX.writeFile(wb, fileName);
  } catch (error: any) {
    console.error('Lỗi khi xuất file Excel:', error);
    alert('Không thể xuất file Excel: ' + (error?.message || error));
  }
};