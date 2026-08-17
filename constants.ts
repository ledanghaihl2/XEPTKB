import { InputRow } from './types';

export const DAYS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6'];
export const PERIODS = [
  'Sáng 1', 'Sáng 2', 'Sáng 3', 'Sáng 4', 'Sáng 5',
  'Chiều 1', 'Chiều 2', 'Chiều 3'
];

export const isValidSlot = (dayIdx: number, periodIdx: number) => {
  if (dayIdx === 0 || dayIdx === 1) { // Thứ 2, Thứ 3
    if (periodIdx === 4) return false; // Sáng 5
    return true;
  } else { // Thứ 4, 5, 6
    if (periodIdx >= 5) return false; // Chiều 1, 2, 3
    return true;
  }
};

export const CLASSES = ['6A', '6B', '6C', '7A', '7B', '7C', '8A', '8B', '8C', '9A', '9B'];

// Helper to generate data from the provided list
const generateSampleData = (): InputRow[] => {
  let idCounter = 1;
  const rows: InputRow[] = [];

  const add = (teacher: string, subject: string, className: string, sessions: number) => {
    rows.push({
      id: idCounter++,
      teacher,
      subject,
      className,
      sessionsPerWeek: sessions
    });
  };

  const addMulti = (teacher: string, subject: string, classes: string[], sessions: number) => {
    classes.forEach(c => add(teacher, subject, c, sessions));
  };

  const ALL_CLASSES = CLASSES; // 6A -> 9B

  // --- Data from Image ---
  
  // 1-2. Dương
  add('Dương', 'Công nghệ', '8A', 1);
  add('Dương', 'Công nghệ', '8B', 1);

  // 3. Hà
  add('Hà', 'KHTN-sinh', '7A', 3);

  // 4-8. V. Chung
  add('V. Chung', 'GDTC', '7A', 2);
  add('V. Chung', 'GDTC', '7B', 2);
  add('V. Chung', 'GDTC', '8B', 2);
  add('V. Chung', 'GDTC', '9A', 2);
  add('V. Chung', 'GDTC', '9B', 2);

  // 9-14. Thiệu
  add('Thiệu', 'GDTC', '6A', 2);
  add('Thiệu', 'GDTC', '6B', 2);
  add('Thiệu', 'GDTC', '6C', 2);
  add('Thiệu', 'GDTC', '8B', 2); // Lưu ý: Lớp 8B có 2 giáo viên GDTC (V.Chung & Thiệu) như trong ảnh
  add('Thiệu', 'GDTC', '8C', 2);
  add('Thiệu', 'GDTC', '7C', 2);

  // 15-26. L. Trung
  addMulti('L. Trung', 'Âm nhạc', ALL_CLASSES, 1);
  add('L. Trung', 'Công nghệ', '9B', 1);

  // 27-38. Nguyên
  addMulti('Nguyên', 'Mĩ thuật', ALL_CLASSES, 1);
  add('Nguyên', 'Công nghệ', '7C', 1);

  // 39-45. Phương
  addMulti('Phương', 'T Anh', ['9A', '8A', '8B', '8C', '6A', '6B', '6C'], 3);

  // 46-49. Huế
  addMulti('Huế', 'T Anh', ['7A', '7B', '7C', '9B'], 3);

  // 50-54. Vinh
  addMulti('Vinh', 'KHTN-SINH', ['6B', '6C', '7B', '7C'], 3);
  add('Vinh', 'KHTN-SINH', '8C', 2);

  // 55-59. Sen
  addMulti('Sen', 'KHTN-HÓA', ['9A', '9B', '8A', '8B'], 2);
  add('Sen', 'KHTN-HÓA', '6A', 3);

  // 60-64. Ngơi (Updated from Ngợi)
  addMulti('Ngơi', 'Ngữ văn', ['6B', '6C', '9B'], 4);
  addMulti('Ngơi', 'Sử', ['6B', '6C'], 2);

  // 65-74. Hoan
  addMulti('Hoan', 'Ngữ văn', ['8B', '8C'], 4);
  addMulti('Hoan', 'GDCD', ['6A', '6B', '6C', '8A', '8B', '8C', '7B', '7C'], 1);

  // 75-79. Lan
  addMulti('Lan', 'Ngữ văn', ['8A', '9A'], 4);
  addMulti('Lan', 'GDCD', ['9A', '9B', '7A'], 1);

  // 80-86. Hiếu
  addMulti('Hiếu', 'Ngữ văn', ['6A', '7A'], 4);
  addMulti('Hiếu', 'Sử', ['9A', '9B', '7A', '7B', '7C'], 1);

  // 87-91. Trí
  add('Trí', 'Toán', '8A', 4);
  add('Trí', 'Toán', '7C', 4);
  addMulti('Trí', 'KHTN-LÍ', ['8A', '8B', '8C'], 2);

  // 92-96. Thực
  add('Thực', 'Toán', '6C', 4);
  add('Thực', 'Toán', '9B', 4);
  addMulti('Thực', 'KHTN-LÍ', ['7A', '7B', '7C'], 1);

  // 97-103. Dũng
  add('Dũng', 'Toán', '6A', 4);
  add('Dũng', 'Toán', '8C', 4);
  addMulti('Dũng', 'KHTN-LÍ', ['6A', '6B', '6C'], 1);
  addMulti('Dũng', 'KHTN-LÍ', ['9A', '9B'], 2);

  // 104-115. Đặng
  add('Đặng', 'Toán', '6B', 4);
  addMulti('Đặng', 'Tin', ALL_CLASSES, 1);

  // 116-126. Hoa
  addMulti('Hoa', 'Địa', ALL_CLASSES, 1);

  // 127-128. Thành
  add('Thành', 'Toán', '9A', 4);
  add('Thành', 'Toán', '8B', 4);

  // 129-132. Yến
  addMulti('Yến', 'Sử', ['8A', '8B', '8C', '6A'], 2);

  // 133-135. Đạt
  add('Đạt', 'Toán', '7A', 4);
  add('Đạt', 'Toán', '7B', 4);
  add('Đạt', 'Công nghệ', '8C', 1);

  // 136-143. Thảo
  add('Thảo', 'Ngữ văn', '7B', 4);
  add('Thảo', 'Ngữ văn', '7C', 4);
  addMulti('Thảo', 'Công nghệ', ['6A', '6B', '6C', '7A', '7B', '9A'], 1);

  return rows;
};

export const SAMPLE_DATA: InputRow[] = generateSampleData();