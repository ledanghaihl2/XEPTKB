import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Constraint, InputRow } from '../types';
import { DAYS } from '../constants';

interface Props {
  classes: string[];
  constraints: Constraint[];
  data: InputRow[];
  onUpdateClassShift?: (className: string, morningDays: number[], afternoonDays: number[]) => void;
  onBatchUpdateClassShifts?: (classes: string[], morningDays: number[], afternoonDays: number[]) => void;
  onUpdateSchoolShift?: (morningDays: number[], afternoonDays: number[], resetIndividualClasses?: boolean) => void;
  onResetAllClassesToSchoolShift?: () => void;
  onBatchUpdateCustomClassShifts?: (
    updates: { className: string; morningDays: number[]; afternoonDays: number[] }[],
    schoolWideUpdate?: { morningDays: number[]; afternoonDays: number[] }
  ) => void;
}

export const SchoolShiftMatrix: React.FC<Props> = ({
  classes,
  constraints,
  data,
  onUpdateClassShift,
  onBatchUpdateClassShifts,
  onUpdateSchoolShift,
  onResetAllClassesToSchoolShift,
  onBatchUpdateCustomClassShifts
}) => {
  const [selectedGrade, setSelectedGrade] = useState<string>('ALL');
  
  // State quản lý Dropdown menu áp dụng nhanh theo khối
  const [openBatchGrade, setOpenBatchGrade] = useState<string | null>(null);
  const [batchMorningDays, setBatchMorningDays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [batchAfternoonDays, setBatchAfternoonDays] = useState<number[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // State quản lý Modal Áp Dụng Nhanh Ca Học Toàn Trường
  const [isSchoolModalOpen, setIsSchoolModalOpen] = useState<boolean>(false);
  const [modalMorningDays, setModalMorningDays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [modalAfternoonDays, setModalAfternoonDays] = useState<number[]>([]);
  const [resetOverrides, setResetOverrides] = useState<boolean>(true);

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Tự động đóng dropdown khi nhấp chuột ra ngoài
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpenBatchGrade(null);
      }
    };
    if (openBatchGrade) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [openBatchGrade]);

  // Tự động đóng modal ca học Toàn trường khi nhấn phím ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isSchoolModalOpen) {
        setIsSchoolModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSchoolModalOpen]);

  // Trích xuất danh sách Khối lớp tự động từ tên các lớp
  const availableGrades = useMemo(() => {
    const gradeSet = new Set<string>();
    classes.forEach(cls => {
      const match = cls.match(/^(\d+)/);
      if (match) {
        gradeSet.add(match[1]);
      }
    });
    const list = Array.from(gradeSet).sort((a, b) => parseInt(a) - parseInt(b));
    return list.length > 0 ? list : ['6', '7', '8', '9'];
  }, [classes]);

  // Lọc lớp theo khối đang chọn hiển thị
  const filteredClasses = useMemo(() => {
    if (selectedGrade === 'ALL') return classes;
    return classes.filter(cls => cls.startsWith(selectedGrade));
  }, [classes, selectedGrade]);

  // Lấy danh sách lớp mục tiêu cho một khối bất kỳ
  const getTargetClassesForGrade = (gr: string) => {
    if (gr === 'ALL') return classes;
    return classes.filter(cls => cls.startsWith(gr));
  };

  // Ràng buộc ca học Toàn trường nếu có
  const schoolWideConstraint = useMemo(() => {
    return constraints.find(item => 
      item.type === 'SCHOOL_SHIFT' || 
      (item.type === 'CLASS_SHIFT' && (!item.className || item.className === 'ALL' || item.className === 'TOAN_TRUONG'))
    );
  }, [constraints]);

  // Phân tích cấu hình ca học của từng lớp từ danh sách ràng buộc
  const classShiftMap = useMemo(() => {
    const map = new Map<string, { morningDays: number[]; afternoonDays: number[]; constraintId?: string; isSchoolWide?: boolean }>();

    // 1. Phân tích cấu hình mặc định toàn trường (nếu có)
    let defaultMorningDays = [0, 1, 2, 3, 4];
    let defaultAfternoonDays = [0, 1, 2, 3, 4];
    if (schoolWideConstraint) {
      if (schoolWideConstraint.morningDays !== undefined || schoolWideConstraint.afternoonDays !== undefined) {
        defaultMorningDays = schoolWideConstraint.morningDays || [];
        defaultAfternoonDays = schoolWideConstraint.afternoonDays || [];
      } else if (schoolWideConstraint.shift === 'MORNING') {
        defaultMorningDays = [0, 1, 2, 3, 4];
        defaultAfternoonDays = [];
      } else if (schoolWideConstraint.shift === 'AFTERNOON') {
        defaultMorningDays = [];
        defaultAfternoonDays = [0, 1, 2, 3, 4];
      }
    }

    // 2. Gán cho từng lớp: ưu tiên ràng buộc riêng mới nhất, nếu không có thì kế thừa toàn trường
    classes.forEach(cls => {
      const c = [...constraints].reverse().find(item => item.type === 'CLASS_SHIFT' && item.className === cls);
      if (c) {
        let mDays: number[] = [];
        let aDays: number[] = [];

        if (c.morningDays !== undefined || c.afternoonDays !== undefined) {
          mDays = c.morningDays || [];
          aDays = c.afternoonDays || [];
        } else if (c.shift === 'MORNING') {
          mDays = [0, 1, 2, 3, 4];
          aDays = [];
        } else if (c.shift === 'AFTERNOON') {
          mDays = [];
          aDays = [0, 1, 2, 3, 4];
        } else {
          mDays = [0, 1, 2, 3, 4];
          aDays = [0, 1, 2, 3, 4];
        }

        map.set(cls, { morningDays: mDays, afternoonDays: aDays, constraintId: c.id, isSchoolWide: false });
      } else {
        // Kế thừa từ cấu hình Toàn trường (hoặc mặc định cả tuần)
        map.set(cls, { 
          morningDays: [...defaultMorningDays], 
          afternoonDays: [...defaultAfternoonDays],
          constraintId: schoolWideConstraint?.id,
          isSchoolWide: !!schoolWideConstraint 
        });
      }
    });

    return map;
  }, [classes, constraints, schoolWideConstraint]);

  // Tính số tiết phân công của từng lớp
  const classSessionsMap = useMemo(() => {
    const map = new Map<string, number>();
    classes.forEach(cls => {
      const total = data.filter(r => r.className === cls).reduce((sum, r) => sum + r.sessionsPerWeek, 0);
      map.set(cls, total);
    });
    return map;
  }, [classes, data]);

  // Xử lý bật/tắt nhanh ca học khi click vào ô ma trận
  const handleToggleSlot = (cls: string, dayIdx: number, isMorning: boolean) => {
    if (!onUpdateClassShift) return;
    const current = classShiftMap.get(cls) || { morningDays: [0, 1, 2, 3, 4], afternoonDays: [0, 1, 2, 3, 4] };
    
    let newMorningDays = [...current.morningDays];
    let newAfternoonDays = [...current.afternoonDays];

    if (isMorning) {
      if (newMorningDays.includes(dayIdx)) {
        newMorningDays = newMorningDays.filter(d => d !== dayIdx);
      } else {
        newMorningDays = [...newMorningDays, dayIdx].sort((a, b) => a - b);
      }
    } else {
      if (newAfternoonDays.includes(dayIdx)) {
        newAfternoonDays = newAfternoonDays.filter(d => d !== dayIdx);
      } else {
        newAfternoonDays = [...newAfternoonDays, dayIdx].sort((a, b) => a - b);
      }
    }

    onUpdateClassShift(cls, newMorningDays, newAfternoonDays);
  };

  // Mở menu áp dụng nhanh cho khối
  const handleOpenBatchMenu = (gr: string) => {
    if (openBatchGrade === gr) {
      setOpenBatchGrade(null);
    } else {
      setOpenBatchGrade(gr);
      // Mặc định chọn Sáng T2-T6
      setBatchMorningDays([0, 1, 2, 3, 4]);
      setBatchAfternoonDays([]);
    }
  };

  // Bật/tắt thứ trong bộ chọn nhanh
  const toggleBatchMorningDay = (dayIdx: number) => {
    setBatchMorningDays(prev => 
      prev.includes(dayIdx) ? prev.filter(d => d !== dayIdx) : [...prev, dayIdx].sort()
    );
  };

  const toggleBatchAfternoonDay = (dayIdx: number) => {
    setBatchAfternoonDays(prev => 
      prev.includes(dayIdx) ? prev.filter(d => d !== dayIdx) : [...prev, dayIdx].sort()
    );
  };

  // Áp dụng mẫu nhanh (Preset)
  const applyPreset = (type: 'MORNING_ALL' | 'AFTERNOON_ALL' | 'FULL_DAY' | 'MORNING_AFTERNOON_2') => {
    if (type === 'MORNING_ALL') {
      setBatchMorningDays([0, 1, 2, 3, 4]);
      setBatchAfternoonDays([]);
    } else if (type === 'AFTERNOON_ALL') {
      setBatchMorningDays([]);
      setBatchAfternoonDays([0, 1, 2, 3, 4]);
    } else if (type === 'FULL_DAY') {
      setBatchMorningDays([0, 1, 2, 3, 4]);
      setBatchAfternoonDays([0, 1, 2, 3, 4]);
    } else if (type === 'MORNING_AFTERNOON_2') {
      setBatchMorningDays([0, 1, 2, 3, 4]);
      setBatchAfternoonDays([1, 3]); // Chiều T3, T5
    }
  };

  // Thực hiện áp dụng hàng loạt cho toàn khối
  const handleExecuteBatchApply = (gr: string) => {
    const targetClasses = getTargetClassesForGrade(gr);
    if (targetClasses.length === 0) return;

    if (onBatchUpdateClassShifts) {
      onBatchUpdateClassShifts(targetClasses, batchMorningDays, batchAfternoonDays);
    } else if (onUpdateClassShift) {
      targetClasses.forEach(cls => onUpdateClassShift(cls, batchMorningDays, batchAfternoonDays));
    }

    const gradeLabel = gr === 'ALL' ? 'Toàn trường' : `Khối ${gr}`;
    setToastMessage(`Đã áp dụng mẫu ca học thành công cho ${targetClasses.length} lớp thuộc ${gradeLabel}!`);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);

    setOpenBatchGrade(null);
  };

  // Danh sách các lớp có cấu hình ca học riêng (cá biệt)
  const individualOverrideClasses = useMemo(() => {
    const list: string[] = [];
    classes.forEach(cls => {
      const hasSpecific = constraints.some(c => c.type === 'CLASS_SHIFT' && c.className === cls);
      if (hasSpecific) {
        list.push(cls);
      }
    });
    return list;
  }, [classes, constraints]);

  // Mở modal áp dụng nhanh ca học Toàn trường
  const handleOpenSchoolShiftModal = () => {
    if (schoolWideConstraint) {
      setModalMorningDays(schoolWideConstraint.morningDays !== undefined ? [...schoolWideConstraint.morningDays] : [0, 1, 2, 3, 4]);
      setModalAfternoonDays(schoolWideConstraint.afternoonDays !== undefined ? [...schoolWideConstraint.afternoonDays] : []);
    } else {
      setModalMorningDays([0, 1, 2, 3, 4]);
      setModalAfternoonDays([]);
    }
    setResetOverrides(individualOverrideClasses.length > 0);
    setIsSchoolModalOpen(true);
  };

  // Xác nhận áp dụng ca học Toàn trường từ modal
  const handleApplySchoolShiftModal = () => {
    if (onUpdateSchoolShift) {
      onUpdateSchoolShift(modalMorningDays, modalAfternoonDays, resetOverrides);
      setToastMessage(`Đã cập nhật ca học Toàn trường thành công (${classes.length} lớp)${resetOverrides && individualOverrideClasses.length > 0 ? ` và đã xóa ${individualOverrideClasses.length} lớp cá biệt` : ''}!`);
      setTimeout(() => setToastMessage(null), 3500);
    }
    setIsSchoolModalOpen(false);
  };

  // Xóa nhanh toàn bộ các lớp cá biệt để đưa về ca Toàn trường
  const handleQuickResetAllOverrides = () => {
    if (individualOverrideClasses.length === 0) return;
    if (window.confirm(`Thầy/Cô có chắc chắn muốn xóa cấu hình riêng của ${individualOverrideClasses.length} lớp (${individualOverrideClasses.join(', ')}) để toàn bộ ${classes.length} lớp đồng bộ theo ca Toàn trường không?`)) {
      if (onResetAllClassesToSchoolShift) {
        onResetAllClassesToSchoolShift();
      }
      setToastMessage(`Đã đưa toàn bộ ${classes.length} lớp về tuân thủ ca học Toàn trường!`);
      setTimeout(() => setToastMessage(null), 3500);
    }
  };

  // Xử lý Bật/Tắt 1 lần cho CẢ TRƯỜNG (hoặc toàn bộ lớp thuộc khối đang lọc)
  const handleToggleSchoolShiftSlot = (dayIdx: number, isMorning: boolean) => {
    const targetClasses = filteredClasses.length > 0 ? filteredClasses : classes;
    if (targetClasses.length === 0) return;

    // Đếm số lớp hiện đang BẬT ca này trong danh sách mục tiêu
    let activeCount = 0;
    targetClasses.forEach(cls => {
      const conf = classShiftMap.get(cls);
      if (conf) {
        if (isMorning && conf.morningDays.includes(dayIdx)) activeCount++;
        if (!isMorning && conf.afternoonDays.includes(dayIdx)) activeCount++;
      }
    });

    // Nếu tất cả lớp đã bật ca này -> TẮT CHO TẤT CẢ. Ngược lại (chưa bật hết) -> BẬT CHO TẤT CẢ.
    const shouldTurnOn = activeCount < targetClasses.length;

    // Chuẩn bị danh sách cập nhật cho từng lớp
    const updates: { className: string; morningDays: number[]; afternoonDays: number[] }[] = [];
    targetClasses.forEach(cls => {
      const conf = classShiftMap.get(cls) || { morningDays: [0, 1, 2, 3, 4], afternoonDays: [0, 1, 2, 3, 4] };
      let newM = [...conf.morningDays];
      let newA = [...conf.afternoonDays];

      if (isMorning) {
        if (shouldTurnOn) {
          if (!newM.includes(dayIdx)) newM.push(dayIdx);
          newM.sort((a, b) => a - b);
        } else {
          newM = newM.filter(d => d !== dayIdx);
        }
      } else {
        if (shouldTurnOn) {
          if (!newA.includes(dayIdx)) newA.push(dayIdx);
          newA.sort((a, b) => a - b);
        } else {
          newA = newA.filter(d => d !== dayIdx);
        }
      }

      updates.push({
        className: cls,
        morningDays: newM,
        afternoonDays: newA
      });
    });

    // Đồng bộ vào ràng buộc Toàn trường nếu phạm vi là ALL hoặc đủ tất cả lớp
    let schoolWideUpdate: { morningDays: number[]; afternoonDays: number[] } | undefined = undefined;
    if (selectedGrade === 'ALL' || targetClasses.length === classes.length) {
      const currentSchoolM = schoolWideConstraint?.morningDays !== undefined ? [...schoolWideConstraint.morningDays] : [0, 1, 2, 3, 4];
      const currentSchoolA = schoolWideConstraint?.afternoonDays !== undefined ? [...schoolWideConstraint.afternoonDays] : [];
      let nextSchoolM = [...currentSchoolM];
      let nextSchoolA = [...currentSchoolA];

      if (isMorning) {
        if (shouldTurnOn) {
          if (!nextSchoolM.includes(dayIdx)) nextSchoolM.push(dayIdx);
          nextSchoolM.sort((a, b) => a - b);
        } else {
          nextSchoolM = nextSchoolM.filter(d => d !== dayIdx);
        }
      } else {
        if (shouldTurnOn) {
          if (!nextSchoolA.includes(dayIdx)) nextSchoolA.push(dayIdx);
          nextSchoolA.sort((a, b) => a - b);
        } else {
          nextSchoolA = nextSchoolA.filter(d => d !== dayIdx);
        }
      }

      schoolWideUpdate = {
        morningDays: nextSchoolM,
        afternoonDays: nextSchoolA
      };
    }

    if (onBatchUpdateCustomClassShifts) {
      onBatchUpdateCustomClassShifts(updates, schoolWideUpdate);
    } else if (onBatchUpdateClassShifts) {
      targetClasses.forEach(cls => {
        const u = updates.find(item => item.className === cls);
        if (u && onUpdateClassShift) onUpdateClassShift(cls, u.morningDays, u.afternoonDays);
      });
    }

    const actionText = shouldTurnOn ? 'BẬT' : 'TẮT';
    const shiftText = isMorning ? 'ca Sáng' : 'ca Chiều';
    const dayText = DAYS[dayIdx];
    const scopeText = selectedGrade === 'ALL' ? 'Toàn trường' : `Khối ${selectedGrade}`;
    setToastMessage(`Đã ${actionText} ${shiftText} ${dayText} cho ${targetClasses.length} lớp (${scopeText}) thành công!`);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Bật hoặc Tắt nhanh cả tuần cho ca Sáng / Chiều cho cả trường
  const handleQuickSetAllShifts = (isMorning: boolean) => {
    const targetClasses = filteredClasses.length > 0 ? filteredClasses : classes;
    if (targetClasses.length === 0) return;

    // Kiểm tra xem hiện tại đã bật hết cả tuần chưa
    let allOn = true;
    targetClasses.forEach(cls => {
      const conf = classShiftMap.get(cls);
      if (conf) {
        const days = isMorning ? conf.morningDays : conf.afternoonDays;
        if (days.length < 5) allOn = false;
      }
    });

    const shouldTurnOn = !allOn;
    const allDays = [0, 1, 2, 3, 4];

    const updates: { className: string; morningDays: number[]; afternoonDays: number[] }[] = [];
    targetClasses.forEach(cls => {
      const conf = classShiftMap.get(cls) || { morningDays: [0, 1, 2, 3, 4], afternoonDays: [0, 1, 2, 3, 4] };
      updates.push({
        className: cls,
        morningDays: isMorning ? (shouldTurnOn ? allDays : []) : conf.morningDays,
        afternoonDays: !isMorning ? (shouldTurnOn ? allDays : []) : conf.afternoonDays
      });
    });

    let schoolWideUpdate: { morningDays: number[]; afternoonDays: number[] } | undefined = undefined;
    if (selectedGrade === 'ALL' || targetClasses.length === classes.length) {
      const currentSchoolM = schoolWideConstraint?.morningDays !== undefined ? [...schoolWideConstraint.morningDays] : [0, 1, 2, 3, 4];
      const currentSchoolA = schoolWideConstraint?.afternoonDays !== undefined ? [...schoolWideConstraint.afternoonDays] : [];
      schoolWideUpdate = {
        morningDays: isMorning ? (shouldTurnOn ? allDays : []) : currentSchoolM,
        afternoonDays: !isMorning ? (shouldTurnOn ? allDays : []) : currentSchoolA
      };
    }

    if (onBatchUpdateCustomClassShifts) {
      onBatchUpdateCustomClassShifts(updates, schoolWideUpdate);
    } else if (onBatchUpdateClassShifts) {
      targetClasses.forEach(cls => {
        const u = updates.find(item => item.className === cls);
        if (u && onUpdateClassShift) onUpdateClassShift(cls, u.morningDays, u.afternoonDays);
      });
    }

    const actionText = shouldTurnOn ? 'BẬT HẾT CẢ TUẦN' : 'TẮT TẤT CẢ';
    const shiftText = isMorning ? 'ca Sáng (T2-T6)' : 'ca Chiều (T2-T6)';
    const scopeText = selectedGrade === 'ALL' ? 'Toàn trường' : `Khối ${selectedGrade}`;
    setToastMessage(`Đã ${actionText} ${shiftText} cho ${targetClasses.length} lớp (${scopeText})!`);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Xử lý Bật/Tắt CẢ NGÀY (cả Sáng VÀ Chiều) cho Toàn bộ lớp khi nhấp đúp vào tiêu đề Thứ
  const handleToggleWholeDayForSchool = (dayIdx: number) => {
    const targetClasses = filteredClasses.length > 0 ? filteredClasses : classes;
    if (targetClasses.length === 0) return;

    // Đếm tổng số slot đang active cả sáng và chiều của ngày này
    let activeSlotsCount = 0;
    targetClasses.forEach(cls => {
      const conf = classShiftMap.get(cls);
      if (conf) {
        if (conf.morningDays.includes(dayIdx)) activeSlotsCount++;
        if (conf.afternoonDays.includes(dayIdx)) activeSlotsCount++;
      }
    });

    const totalPossibleSlots = targetClasses.length * 2;
    // Nếu chưa bật hết cả ngày (cả sáng và chiều) -> BẬT HẾT CẢ NGÀY cho toàn bộ lớp. Ngược lại -> TẮT CẢ NGÀY.
    const shouldTurnOn = activeSlotsCount < totalPossibleSlots;

    const updates: { className: string; morningDays: number[]; afternoonDays: number[] }[] = [];
    targetClasses.forEach(cls => {
      const conf = classShiftMap.get(cls) || { morningDays: [0, 1, 2, 3, 4], afternoonDays: [0, 1, 2, 3, 4] };
      let newM = [...conf.morningDays];
      let newA = [...conf.afternoonDays];

      if (shouldTurnOn) {
        if (!newM.includes(dayIdx)) newM.push(dayIdx);
        if (!newA.includes(dayIdx)) newA.push(dayIdx);
        newM.sort((a, b) => a - b);
        newA.sort((a, b) => a - b);
      } else {
        newM = newM.filter(d => d !== dayIdx);
        newA = newA.filter(d => d !== dayIdx);
      }

      updates.push({
        className: cls,
        morningDays: newM,
        afternoonDays: newA
      });
    });

    let schoolWideUpdate: { morningDays: number[]; afternoonDays: number[] } | undefined = undefined;
    if (selectedGrade === 'ALL' || targetClasses.length === classes.length) {
      const currentSchoolM = schoolWideConstraint?.morningDays !== undefined ? [...schoolWideConstraint.morningDays] : [0, 1, 2, 3, 4];
      const currentSchoolA = schoolWideConstraint?.afternoonDays !== undefined ? [...schoolWideConstraint.afternoonDays] : [];
      let nextSchoolM = [...currentSchoolM];
      let nextSchoolA = [...currentSchoolA];

      if (shouldTurnOn) {
        if (!nextSchoolM.includes(dayIdx)) nextSchoolM.push(dayIdx);
        if (!nextSchoolA.includes(dayIdx)) nextSchoolA.push(dayIdx);
        nextSchoolM.sort((a, b) => a - b);
        nextSchoolA.sort((a, b) => a - b);
      } else {
        nextSchoolM = nextSchoolM.filter(d => d !== dayIdx);
        nextSchoolA = nextSchoolA.filter(d => d !== dayIdx);
      }

      schoolWideUpdate = {
        morningDays: nextSchoolM,
        afternoonDays: nextSchoolA
      };
    }

    if (onBatchUpdateCustomClassShifts) {
      onBatchUpdateCustomClassShifts(updates, schoolWideUpdate);
    } else if (onBatchUpdateClassShifts) {
      targetClasses.forEach(cls => {
        const u = updates.find(item => item.className === cls);
        if (u && onUpdateClassShift) onUpdateClassShift(cls, u.morningDays, u.afternoonDays);
      });
    }

    const actionText = shouldTurnOn ? 'BẬT CẢ NGÀY (Sáng & Chiều)' : 'TẮT CẢ NGÀY (Nghỉ cả ngày)';
    const dayText = DAYS[dayIdx];
    const scopeText = selectedGrade === 'ALL' ? 'Toàn trường' : `Khối ${selectedGrade}`;
    setToastMessage(`Đã ${actionText} ${dayText} cho ${targetClasses.length} lớp (${scopeText})!`);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Thống kê tổng số lớp học theo từng buổi cho mỗi thứ
  const shiftStats = useMemo(() => {
    const morningCount: number[] = [0, 0, 0, 0, 0];
    const afternoonCount: number[] = [0, 0, 0, 0, 0];

    classes.forEach(cls => {
      const config = classShiftMap.get(cls);
      if (!config) return;
      for (let d = 0; d < 5; d++) {
        if (config.morningDays.includes(d)) morningCount[d]++;
        if (config.afternoonDays.includes(d)) afternoonCount[d]++;
      }
    });

    return { morningCount, afternoonCount };
  }, [classes, classShiftMap]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden relative">
      {/* Toast thông báo kết quả */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 bg-slate-900 text-white rounded-xl shadow-2xl border border-teal-500/50 text-sm animate-fade-in">
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-teal-500 text-white font-bold text-xs">✓</span>
          <span className="font-medium">{toastMessage}</span>
        </div>
      )}

      {/* Header của Bảng Ma Trận */}
      <div className="p-4 md:p-5 border-b border-gray-200 bg-gradient-to-r from-teal-50/70 via-slate-50 to-blue-50/50">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-teal-600 text-white font-bold text-sm shadow-sm">
                📊
              </span>
              <h3 className="text-base font-bold text-gray-900 uppercase tracking-tight">
                Bảng Ma Trận Ca Học Toàn Trường (School Shift Matrix)
              </h3>
            </div>
            <p className="text-xs text-gray-600 mt-1">
              Theo dõi lịch học ca Sáng & Chiều. Click trực tiếp vào ô để <strong className="text-teal-900">Bật / Tắt nhanh</strong> hoặc bấm <strong className="text-amber-800">⚡▾</strong> tại từng khối để <strong className="text-teal-900">Áp dụng mẫu ca học nhanh</strong> cho toàn khối!
            </p>
            {/* Thanh hiển thị trạng thái Ca học Toàn trường & Các nút thao tác nhanh */}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {schoolWideConstraint ? (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-teal-100/90 border border-teal-300 text-teal-950 text-xs font-semibold shadow-xs flex-wrap">
                  <span className="font-extrabold text-teal-900">🏫 Ca học Toàn trường:</span>
                  <span>🌅 Sáng [{schoolWideConstraint.morningDays && schoolWideConstraint.morningDays.length > 0 ? schoolWideConstraint.morningDays.map(d => DAYS[d]).join(', ') : 'Nghỉ'}]</span>
                  <span className="text-teal-400 font-normal">|</span>
                  <span>🌇 Chiều [{schoolWideConstraint.afternoonDays && schoolWideConstraint.afternoonDays.length > 0 ? schoolWideConstraint.afternoonDays.map(d => DAYS[d]).join(', ') : 'Nghỉ'}]</span>
                  <button
                    type="button"
                    onClick={handleOpenSchoolShiftModal}
                    className="ml-1 text-[11px] text-teal-800 hover:text-teal-950 font-bold underline cursor-pointer"
                  >
                    Thay đổi
                  </button>
                </div>
              ) : (
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-gray-100 border border-gray-300 text-gray-600 text-xs">
                  <span>ℹ️ Chưa thiết lập ca học chung Toàn trường</span>
                  <button
                    type="button"
                    onClick={handleOpenSchoolShiftModal}
                    className="text-[11px] text-teal-700 hover:text-teal-900 font-bold underline cursor-pointer"
                  >
                    Thiết lập ngay
                  </button>
                </div>
              )}

              {/* Nút dọn dẹp các lớp cá biệt để đồng bộ về toàn trường */}
              {individualOverrideClasses.length > 0 && (
                <button
                  type="button"
                  onClick={handleQuickResetAllOverrides}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-amber-900 bg-amber-100/90 hover:bg-amber-200 rounded-lg border border-amber-300 shadow-2xs transition-colors cursor-pointer"
                  title={`Xóa cấu hình riêng của ${individualOverrideClasses.length} lớp (${individualOverrideClasses.join(', ')}) để đồng bộ 100% theo ca Toàn trường`}
                >
                  <span>🔄</span>
                  <span>Đưa tất cả ({individualOverrideClasses.length} lớp riêng) về ca Toàn trường</span>
                </button>
              )}
            </div>
          </div>

          {/* Cụm công cụ: Nút Áp dụng nhanh ca học Toàn trường, Bộ lọc Khối & Nút in */}
          <div className="flex items-center gap-2 flex-wrap" ref={dropdownRef}>
            {/* Nút Áp dụng nhanh cấu hình Toàn trường ngay trên Ma trận */}
            <button
              type="button"
              onClick={handleOpenSchoolShiftModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 active:scale-95 text-white text-xs font-bold shadow-xs hover:shadow transition-all cursor-pointer"
              title="Cấu hình ca học Sáng & Chiều đồng bộ cho toàn bộ các lớp trong trường"
            >
              <span>🏫⚡</span>
              <span>Áp dụng nhanh cấu hình Toàn trường</span>
            </button>

            <span className="text-xs font-semibold text-gray-500 ml-1">Khối:</span>
            
            <div className="flex bg-white p-0.5 rounded-lg border border-gray-200 shadow-xs relative">
              {['ALL', ...availableGrades].map(gr => {
                const label = gr === 'ALL' ? `Tất cả (${classes.length})` : `Khối ${gr}`;
                const active = selectedGrade === gr;
                const isDropdownOpen = openBatchGrade === gr;

                return (
                  <div key={gr} className="relative inline-flex items-center">
                    {/* Nút lọc khối */}
                    <button
                      type="button"
                      onClick={() => setSelectedGrade(gr)}
                      className={`px-2.5 py-1 text-xs font-medium transition-all ${
                        active
                          ? 'bg-primary text-white shadow-xs font-bold rounded-l-md'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-l-md'
                      }`}
                    >
                      {label}
                    </button>

                    {/* Nút Dropdown thao tác nhanh trực tiếp trên Khối */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenBatchMenu(gr);
                      }}
                      className={`px-1.5 py-1 text-[11px] font-bold border-l transition-colors rounded-r-md ${
                        active
                          ? 'bg-primary/95 text-amber-300 hover:bg-primary border-white/20'
                          : 'text-amber-600 hover:text-amber-800 hover:bg-amber-50 border-gray-200'
                      } ${isDropdownOpen ? 'bg-amber-100 text-amber-900 ring-2 ring-amber-400' : ''}`}
                      title={`⚡ Áp dụng mẫu ca học nhanh cho ${gr === 'ALL' ? 'Toàn trường' : 'Khối ' + gr}`}
                    >
                      ⚡▾
                    </button>

                    {/* Menu Dropdown Thao Tác Nhanh (Gắn trực tiếp vào nút khối) */}
                    {isDropdownOpen && (
                      <div className="absolute top-full right-0 sm:left-0 sm:right-auto mt-2 z-50 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-gray-200 p-4 text-left">
                        {/* Header Dropdown */}
                        <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-gray-100">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-amber-500 text-sm">⚡</span>
                              <h4 className="font-bold text-gray-900 text-xs uppercase">
                                Áp dụng ca học cho: {gr === 'ALL' ? 'Toàn trường' : `Khối ${gr}`}
                              </h4>
                            </div>
                            <p className="text-[11px] text-gray-500 mt-0.5">
                              Đồng bộ cấu hình cho <strong>{getTargetClassesForGrade(gr).length} lớp</strong> ({getTargetClassesForGrade(gr).slice(0, 4).join(', ')}{getTargetClassesForGrade(gr).length > 4 ? '...' : ''})
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setOpenBatchGrade(null)}
                            className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"
                          >
                            ✕
                          </button>
                        </div>

                        {/* Mẫu nhanh 1-chạm (Presets) */}
                        <div className="mb-3">
                          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Mẫu nhanh có sẵn:</label>
                          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                            <button
                              type="button"
                              onClick={() => applyPreset('MORNING_ALL')}
                              className="px-2 py-1 rounded-md bg-teal-50 border border-teal-200 text-teal-800 font-medium hover:bg-teal-100 text-left transition-colors"
                            >
                              🌅 Chỉ học Sáng (T2-T6)
                            </button>
                            <button
                              type="button"
                              onClick={() => applyPreset('AFTERNOON_ALL')}
                              className="px-2 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-800 font-medium hover:bg-amber-100 text-left transition-colors"
                            >
                              🌇 Chỉ học Chiều (T2-T6)
                            </button>
                            <button
                              type="button"
                              onClick={() => applyPreset('MORNING_AFTERNOON_2')}
                              className="px-2 py-1 rounded-md bg-blue-50 border border-blue-200 text-blue-800 font-medium hover:bg-blue-100 text-left transition-colors"
                            >
                              ✨ Sáng T2-T6 + Chiều T3, T5
                            </button>
                            <button
                              type="button"
                              onClick={() => applyPreset('FULL_DAY')}
                              className="px-2 py-1 rounded-md bg-gray-50 border border-gray-200 text-gray-700 font-medium hover:bg-gray-100 text-left transition-colors"
                            >
                              🔄 Cả ngày (T2-T6)
                            </button>
                          </div>
                        </div>

                        {/* Bảng chọn Thứ Sáng & Chiều tùy chỉnh */}
                        <div className="space-y-2.5 bg-gray-50 p-3 rounded-xl border border-gray-200 mb-3.5">
                          {/* Buổi Sáng */}
                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-[11px] font-bold text-teal-900 flex items-center gap-1">
                                <span>🌅</span> Buổi Sáng (Tiết 1-5)
                              </span>
                              <div className="flex items-center gap-1.5 text-[10px]">
                                <button
                                  type="button"
                                  onClick={() => setBatchMorningDays([0, 1, 2, 3, 4])}
                                  className="text-teal-700 hover:underline"
                                >
                                  T2-T6
                                </button>
                                <span className="text-gray-300">|</span>
                                <button
                                  type="button"
                                  onClick={() => setBatchMorningDays([])}
                                  className="text-gray-500 hover:underline"
                                >
                                  Nghỉ
                                </button>
                              </div>
                            </div>
                            <div className="grid grid-cols-5 gap-1">
                              {[0, 1, 2, 3, 4].map(d => {
                                const active = batchMorningDays.includes(d);
                                return (
                                  <button
                                    type="button"
                                    key={d}
                                    onClick={() => toggleBatchMorningDay(d)}
                                    className={`py-1.5 rounded-lg text-xs font-bold transition-all ${
                                      active
                                        ? 'bg-teal-600 text-white shadow-xs scale-102'
                                        : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-100'
                                    }`}
                                  >
                                    {DAYS[d]}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Buổi Chiều */}
                          <div className="pt-2 border-t border-gray-200/80">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-[11px] font-bold text-amber-900 flex items-center gap-1">
                                <span>🌇</span> Buổi Chiều (Tiết 1-3)
                              </span>
                              <div className="flex items-center gap-1.5 text-[10px]">
                                <button
                                  type="button"
                                  onClick={() => setBatchAfternoonDays([0, 1, 2, 3, 4])}
                                  className="text-amber-700 hover:underline"
                                >
                                  T2-T6
                                </button>
                                <span className="text-gray-300">|</span>
                                <button
                                  type="button"
                                  onClick={() => setBatchAfternoonDays([])}
                                  className="text-gray-500 hover:underline"
                                >
                                  Nghỉ
                                </button>
                              </div>
                            </div>
                            <div className="grid grid-cols-5 gap-1">
                              {[0, 1, 2, 3, 4].map(d => {
                                const active = batchAfternoonDays.includes(d);
                                return (
                                  <button
                                    type="button"
                                    key={d}
                                    onClick={() => toggleBatchAfternoonDay(d)}
                                    className={`py-1.5 rounded-lg text-xs font-bold transition-all ${
                                      active
                                        ? 'bg-amber-600 text-white shadow-xs scale-102'
                                        : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-100'
                                    }`}
                                  >
                                    {DAYS[d]}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        {/* Sức chứa và Nút Áp dụng */}
                        <div className="flex items-center justify-between pt-1">
                          <div className="text-[11px] text-gray-600">
                            Sức chứa: <strong className="text-teal-900">{batchMorningDays.length * 5 + batchAfternoonDays.length * 3} tiết</strong> / tuần
                          </div>
                          <button
                            type="button"
                            onClick={() => handleExecuteBatchApply(gr)}
                            className="px-3.5 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 active:scale-95"
                          >
                            <span>⚡ Áp dụng cho {getTargetClassesForGrade(gr).length} lớp</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Nút In Ma trận */}
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-medium shadow-xs flex items-center gap-1.5 transition-colors"
              title="In hoặc xuất PDF Bảng ma trận ca học"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
              In Ma trận
            </button>
          </div>
        </div>

        {/* Chú giải (Legend) */}
        <div className="flex items-center gap-4 mt-3 pt-2.5 border-t border-gray-200/60 text-[11px] text-gray-600 flex-wrap">
          <span className="font-semibold text-gray-700">Chú giải:</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-4 h-4 rounded bg-teal-600 border border-teal-700 inline-flex items-center justify-center text-[10px] text-white font-bold" style={{ backgroundColor: '#0d9488', color: '#ffffff' }}>✓</span>
            <span className="font-medium text-teal-900">Bật ca Sáng (Tiết 1-5)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-4 h-4 rounded bg-amber-600 border border-amber-700 inline-flex items-center justify-center text-[10px] text-white font-bold" style={{ backgroundColor: '#d97706', color: '#ffffff' }}>✓</span>
            <span className="font-medium text-amber-900">Bật ca Chiều (Tiết 1-3)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-4 h-4 rounded bg-slate-100 border border-slate-300 inline-flex items-center justify-center text-[10px] text-slate-500 font-bold" style={{ backgroundColor: '#f1f5f9', color: '#64748b' }}>—</span>
            <span className="text-gray-500">Tắt (Nghỉ ca)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Đủ sức chứa tiết</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
            <span>Thiếu sức chứa (Quá tải)</span>
          </span>
        </div>
      </div>

      {/* Bảng Ma Trận Cuộn Ngang */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100 border-b border-gray-200 text-gray-800 text-center font-bold">
              <th rowSpan={2} className="p-3 border-r border-gray-200 sticky left-0 bg-slate-100 z-10 w-20 min-w-[80px]">
                Lớp
              </th>
              <th rowSpan={2} className="p-3 border-r border-gray-200 w-36 min-w-[140px] text-left">
                Phân công / Sức chứa
              </th>
              {DAYS.map((day, dayIdx) => (
                <th 
                  key={day} 
                  colSpan={2} 
                  onDoubleClick={(e) => {
                    e.preventDefault();
                    handleToggleWholeDayForSchool(dayIdx);
                  }}
                  className="p-2 border-r border-gray-200 border-b min-w-[120px] bg-slate-50/80 hover:bg-slate-100 cursor-pointer select-none transition-colors group"
                  title={`⚡ Nhấp đúp (hoặc bấm nút "Cả ngày") để BẬT/TẮT CẢ NGÀY (Sáng & Chiều) ${day} cho TOÀN BỘ ${filteredClasses.length} lớp`}
                >
                  <div className="flex items-center justify-between px-1">
                    <span className="font-bold text-gray-900 text-xs flex items-center gap-1">
                      <span>📅</span>
                      <span>{day}</span>
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleWholeDayForSchool(dayIdx);
                      }}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-white hover:bg-teal-50 text-gray-600 hover:text-teal-900 border border-gray-200 hover:border-teal-300 font-bold shadow-2xs transition-all cursor-pointer group-hover:scale-105"
                      title={`Bấm để Bật/Tắt CẢ NGÀY (Sáng & Chiều) ${day} cho cả trường`}
                    >
                      ⚡ Cả ngày
                    </button>
                  </div>
                </th>
              ))}
            </tr>
            <tr className="bg-slate-50 border-b border-gray-200 text-center text-[11px] text-gray-600 font-semibold">
              {DAYS.map((day, dayIdx) => (
                <React.Fragment key={day}>
                  <th 
                    onClick={() => handleToggleSchoolShiftSlot(dayIdx, true)}
                    className="py-1.5 px-2 border-r border-teal-100/60 bg-teal-50/40 hover:bg-teal-100/80 text-teal-800 cursor-pointer select-none transition-colors group"
                    title={`Click để BẬT/TẮT ca Sáng ${day} cho CẢ TRƯỜNG (${filteredClasses.length} lớp)`}
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>🌅 Sáng</span>
                      <span className="w-3.5 h-3.5 rounded bg-teal-600 text-white inline-flex items-center justify-center text-[8px] font-bold shadow-2xs group-hover:scale-110 transition-transform">
                        ⚡
                      </span>
                    </div>
                  </th>
                  <th 
                    onClick={() => handleToggleSchoolShiftSlot(dayIdx, false)}
                    className="py-1.5 px-2 border-r border-gray-200 bg-amber-50/40 hover:bg-amber-100/80 text-amber-800 cursor-pointer select-none transition-colors group"
                    title={`Click để BẬT/TẮT ca Chiều ${day} cho CẢ TRƯỜNG (${filteredClasses.length} lớp)`}
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>🌇 Chiều</span>
                      <span className="w-3.5 h-3.5 rounded bg-amber-600 text-white inline-flex items-center justify-center text-[8px] font-bold shadow-2xs group-hover:scale-110 transition-transform">
                        ⚡
                      </span>
                    </div>
                  </th>
                </React.Fragment>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {/* Hàng Điều Khiển Nhanh Toàn Trường / Toàn Khối (Tích 1 lần được cả trường) */}
            <tr className="bg-gradient-to-r from-teal-50/90 via-slate-50 to-amber-50/90 border-b-2 border-teal-400 font-bold shadow-2xs">
              <td className="p-2 border-r border-teal-200 sticky left-0 bg-teal-50 z-10 text-center">
                <div className="flex flex-col items-center justify-center">
                  <span className="inline-flex items-center gap-1 text-teal-950 font-black text-xs uppercase tracking-tight">
                    <span>🏫</span>
                    <span>{selectedGrade === 'ALL' ? 'Cả Trường' : `Khối ${selectedGrade}`}</span>
                  </span>
                  <span className="text-[10px] text-teal-700 font-bold bg-teal-200/60 px-1.5 py-0.5 rounded-full mt-0.5">
                    Tích 1 lần
                  </span>
                </div>
              </td>
              <td className="p-2 border-r border-teal-200 bg-teal-50/40">
                <div className="flex flex-col gap-1">
                  <div className="text-[11px] font-bold text-teal-900 flex items-center justify-between">
                    <span>{filteredClasses.length} lớp</span>
                    <span className="text-[10px] text-teal-700 font-semibold">Đổi toàn bộ</span>
                  </div>
                  <div className="flex items-center gap-1 text-[10px]">
                    <button
                      type="button"
                      onClick={() => handleQuickSetAllShifts(true)}
                      className="px-1.5 py-0.5 bg-white border border-teal-300 rounded text-teal-800 hover:bg-teal-100 font-semibold transition-colors cursor-pointer"
                      title="Bật tất cả ca Sáng T2-T6 cho cả trường"
                    >
                      🌅 Bật hết sáng
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickSetAllShifts(false)}
                      className="px-1.5 py-0.5 bg-white border border-amber-300 rounded text-amber-800 hover:bg-amber-100 font-semibold transition-colors cursor-pointer"
                      title="Bật tất cả ca Chiều T2-T6 cho cả trường"
                    >
                      🌇 Bật hết chiều
                    </button>
                  </div>
                </div>
              </td>

              {/* 10 Nút tích theo từng ca học */}
              {[0, 1, 2, 3, 4].map(dayIdx => {
                const targetClasses = filteredClasses.length > 0 ? filteredClasses : classes;
                let mCount = 0;
                let aCount = 0;
                targetClasses.forEach(cls => {
                  const conf = classShiftMap.get(cls);
                  if (conf) {
                    if (conf.morningDays.includes(dayIdx)) mCount++;
                    if (conf.afternoonDays.includes(dayIdx)) aCount++;
                  }
                });

                const isAllMorning = mCount === targetClasses.length && targetClasses.length > 0;
                const isPartialMorning = mCount > 0 && mCount < targetClasses.length;

                const isAllAfternoon = aCount === targetClasses.length && targetClasses.length > 0;
                const isPartialAfternoon = aCount > 0 && aCount < targetClasses.length;

                return (
                  <React.Fragment key={dayIdx}>
                    {/* Ô Sáng Toàn trường */}
                    <td
                      onClick={() => handleToggleSchoolShiftSlot(dayIdx, true)}
                      className={`p-1.5 border-r border-teal-200 text-center cursor-pointer select-none transition-colors ${
                        isAllMorning
                          ? 'bg-teal-100/80 hover:bg-teal-200'
                          : isPartialMorning
                          ? 'bg-teal-50 hover:bg-teal-100'
                          : 'bg-white hover:bg-slate-100'
                      }`}
                      title={`Click để ${isAllMorning ? 'TẮT' : 'BẬT'} ca Sáng ${DAYS[dayIdx]} cho TOÀN BỘ ${targetClasses.length} lớp`}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleSchoolShiftSlot(dayIdx, true);
                        }}
                        className={`w-8 h-8 rounded-lg inline-flex flex-col items-center justify-center font-extrabold text-xs transition-all shadow-xs cursor-pointer active:scale-90 ${
                          isAllMorning
                            ? 'bg-teal-600 text-white ring-2 ring-teal-500/40'
                            : isPartialMorning
                            ? 'bg-teal-100 text-teal-800 border-2 border-teal-600'
                            : 'bg-slate-100 text-slate-400 border border-slate-300 hover:bg-slate-200'
                        }`}
                        style={{
                          backgroundColor: isAllMorning ? '#0d9488' : isPartialMorning ? '#ccfbf1' : '#f1f5f9',
                          color: isAllMorning ? '#ffffff' : isPartialMorning ? '#0f766e' : '#64748b',
                          border: isAllMorning ? '1px solid #0f766e' : isPartialMorning ? '2px solid #0d9488' : '1px solid #cbd5e1'
                        }}
                      >
                        {isAllMorning ? '✓' : isPartialMorning ? `${mCount}` : '—'}
                      </button>
                      <span className="block text-[9px] font-bold text-teal-900 mt-0.5 leading-none">
                        {isAllMorning ? 'Tất cả' : isPartialMorning ? `${mCount} lớp` : 'Tắt'}
                      </span>
                    </td>

                    {/* Ô Chiều Toàn trường */}
                    <td
                      onClick={() => handleToggleSchoolShiftSlot(dayIdx, false)}
                      className={`p-1.5 border-r border-gray-300 text-center cursor-pointer select-none transition-colors ${
                        isAllAfternoon
                          ? 'bg-amber-100/80 hover:bg-amber-200'
                          : isPartialAfternoon
                          ? 'bg-amber-50 hover:bg-amber-100'
                          : 'bg-white hover:bg-slate-100'
                      }`}
                      title={`Click để ${isAllAfternoon ? 'TẮT' : 'BẬT'} ca Chiều ${DAYS[dayIdx]} cho TOÀN BỘ ${targetClasses.length} lớp`}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleSchoolShiftSlot(dayIdx, false);
                        }}
                        className={`w-8 h-8 rounded-lg inline-flex flex-col items-center justify-center font-extrabold text-xs transition-all shadow-xs cursor-pointer active:scale-90 ${
                          isAllAfternoon
                            ? 'bg-amber-600 text-white ring-2 ring-amber-500/40'
                            : isPartialAfternoon
                            ? 'bg-amber-100 text-amber-800 border-2 border-amber-600'
                            : 'bg-slate-100 text-slate-400 border border-slate-300 hover:bg-slate-200'
                        }`}
                        style={{
                          backgroundColor: isAllAfternoon ? '#d97706' : isPartialAfternoon ? '#fef3c7' : '#f1f5f9',
                          color: isAllAfternoon ? '#ffffff' : isPartialAfternoon ? '#b45309' : '#64748b',
                          border: isAllAfternoon ? '1px solid #b45309' : isPartialAfternoon ? '2px solid #d97706' : '1px solid #cbd5e1'
                        }}
                      >
                        {isAllAfternoon ? '✓' : isPartialAfternoon ? `${aCount}` : '—'}
                      </button>
                      <span className="block text-[9px] font-bold text-amber-900 mt-0.5 leading-none">
                        {isAllAfternoon ? 'Tất cả' : isPartialAfternoon ? `${aCount} lớp` : 'Tắt'}
                      </span>
                    </td>
                  </React.Fragment>
                );
              })}
            </tr>

            {filteredClasses.length === 0 ? (
              <tr>
                <td colSpan={12} className="p-8 text-center text-gray-400 italic">
                  Không tìm thấy lớp nào phù hợp với bộ lọc khối đã chọn.
                </td>
              </tr>
            ) : (
              filteredClasses.map((cls, idx) => {
                const config = classShiftMap.get(cls) || { morningDays: [0, 1, 2, 3, 4], afternoonDays: [0, 1, 2, 3, 4] };
                const morningDays = config.morningDays;
                const afternoonDays = config.afternoonDays;

                const assignedSessions = classSessionsMap.get(cls) || 0;
                const capacity = (morningDays.length * 5) + (afternoonDays.length * 3);
                const isOverloaded = assignedSessions > capacity;
                const isTight = capacity - assignedSessions <= 2 && !isOverloaded;

                return (
                  <tr 
                    key={cls}
                    className={`hover:bg-teal-50/20 transition-colors ${idx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'}`}
                  >
                    {/* Tên Lớp */}
                    <td className="p-2.5 font-bold text-gray-900 border-r border-gray-200 sticky left-0 bg-inherit z-10 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <span>{cls}</span>
                        {isOverloaded && (
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" title="Cảnh báo: Thiếu sức chứa ca học!" />
                        )}
                      </div>
                    </td>

                    {/* Sức chứa và Phân công */}
                    <td className="p-2.5 border-r border-gray-200">
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="font-semibold text-gray-700">
                          {assignedSessions} / {capacity} tiết
                        </span>
                        {isOverloaded ? (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">
                            Thiếu {assignedSessions - capacity}t
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            Đủ
                          </span>
                        )}
                      </div>

                      {/* Thanh tỷ lệ sức chứa */}
                      <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-300 ${
                            isOverloaded 
                              ? 'bg-red-500' 
                              : isTight 
                              ? 'bg-amber-500' 
                              : 'bg-emerald-500'
                          }`}
                          style={{ width: `${Math.min(100, capacity > 0 ? (assignedSessions / capacity) * 100 : 100)}%` }}
                        />
                      </div>
                    </td>

                    {/* 5 Ngày trong tuần (Thứ 2 -> Thứ 6) */}
                    {[0, 1, 2, 3, 4].map(dayIdx => {
                      const isMorningActive = morningDays.includes(dayIdx);
                      const isAfternoonActive = afternoonDays.includes(dayIdx);

                      return (
                        <React.Fragment key={dayIdx}>
                          {/* Ô Sáng */}
                          <td 
                            onClick={() => handleToggleSlot(cls, dayIdx, true)}
                            className={`p-1.5 border-r border-teal-100/60 text-center cursor-pointer select-none transition-colors ${
                              isMorningActive 
                                ? 'bg-teal-50/70 hover:bg-teal-100/80' 
                                : 'bg-white hover:bg-slate-100/70'
                            }`}
                            style={{ backgroundColor: isMorningActive ? '#f0fdfa' : undefined }}
                            title={`Click để ${isMorningActive ? 'Tắt' : 'Bật'} ca Sáng ${DAYS[dayIdx]} cho lớp ${cls}`}
                          >
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleSlot(cls, dayIdx, true);
                              }}
                              className={`w-8 h-8 rounded-lg inline-flex items-center justify-center font-extrabold text-xs transition-all shadow-xs cursor-pointer active:scale-90 ${
                                isMorningActive
                                  ? 'bg-teal-600 text-white hover:bg-teal-700 ring-2 ring-teal-500/30'
                                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-800 border border-slate-300'
                              }`}
                              style={{
                                backgroundColor: isMorningActive ? '#0d9488' : '#f1f5f9',
                                color: isMorningActive ? '#ffffff' : '#475569',
                                border: isMorningActive ? '1px solid #0f766e' : '1px solid #cbd5e1'
                              }}
                            >
                              {isMorningActive ? '✓' : '—'}
                            </button>
                          </td>

                          {/* Ô Chiều */}
                          <td 
                            onClick={() => handleToggleSlot(cls, dayIdx, false)}
                            className={`p-1.5 border-r border-gray-200 text-center cursor-pointer select-none transition-colors ${
                              isAfternoonActive 
                                ? 'bg-amber-50/70 hover:bg-amber-100/80' 
                                : 'bg-white hover:bg-slate-100/70'
                            }`}
                            style={{ backgroundColor: isAfternoonActive ? '#fffbeb' : undefined }}
                            title={`Click để ${isAfternoonActive ? 'Tắt' : 'Bật'} ca Chiều ${DAYS[dayIdx]} cho lớp ${cls}`}
                          >
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleSlot(cls, dayIdx, false);
                              }}
                              className={`w-8 h-8 rounded-lg inline-flex items-center justify-center font-extrabold text-xs transition-all shadow-xs cursor-pointer active:scale-90 ${
                                isAfternoonActive
                                  ? 'bg-amber-600 text-white hover:bg-amber-700 ring-2 ring-amber-500/30'
                                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-800 border border-slate-300'
                              }`}
                              style={{
                                backgroundColor: isAfternoonActive ? '#d97706' : '#f1f5f9',
                                color: isAfternoonActive ? '#ffffff' : '#475569',
                                border: isAfternoonActive ? '1px solid #b45309' : '1px solid #cbd5e1'
                              }}
                            >
                              {isAfternoonActive ? '✓' : '—'}
                            </button>
                          </td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>

          {/* Hàng Tổng Kết Tải Trọng Ca Học Toàn Trường */}
          <tfoot>
            <tr className="bg-slate-100/90 font-bold text-gray-800 border-t-2 border-gray-300">
              <td className="p-3 border-r border-gray-200 sticky left-0 bg-slate-100 z-10 text-center text-xs uppercase tracking-wide">
                Tổng cộng
              </td>
              <td className="p-3 border-r border-gray-200 text-xs text-gray-600">
                {classes.length} lớp toàn trường
              </td>
              {[0, 1, 2, 3, 4].map(dayIdx => (
                <React.Fragment key={dayIdx}>
                  <td className="p-2 border-r border-teal-100 text-center text-xs text-teal-900 bg-teal-50/50">
                    <span className="font-extrabold">{shiftStats.morningCount[dayIdx]}</span>
                    <span className="text-[10px] font-normal text-teal-700 block">lớp sáng</span>
                  </td>
                  <td className="p-2 border-r border-gray-200 text-center text-xs text-amber-900 bg-amber-50/50">
                    <span className="font-extrabold">{shiftStats.afternoonCount[dayIdx]}</span>
                    <span className="text-[10px] font-normal text-amber-700 block">lớp chiều</span>
                  </td>
                </React.Fragment>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Modal Áp dụng nhanh cấu hình ca học Toàn trường */}
      {isSchoolModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in"
          onClick={() => setIsSchoolModalOpen(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-xl overflow-hidden animate-scale-up"
            onClick={e => e.stopPropagation()}
          >
            {/* Header Modal */}
            <div className="p-4 md:p-5 border-b border-gray-200 bg-gradient-to-r from-teal-50 via-slate-50 to-blue-50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-teal-600 text-white font-bold text-base shadow-sm">
                  🏫
                </span>
                <div>
                  <h4 className="font-extrabold text-gray-900 text-sm md:text-base uppercase tracking-tight">
                    Áp dụng nhanh cấu hình ca học Toàn trường
                  </h4>
                  <p className="text-xs text-gray-500">
                    Thiết lập đồng bộ cho toàn bộ <strong>{classes.length} lớp học</strong> trong nhà trường
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSchoolModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Body Modal */}
            <div className="p-4 md:p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              {/* Mẫu nhanh 1-chạm */}
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">
                  1. Chọn nhanh theo mẫu ca học phổ biến:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setModalMorningDays([0, 1, 2, 3, 4]);
                      setModalAfternoonDays([]);
                    }}
                    className={`p-2.5 rounded-xl border text-left transition-all flex flex-col gap-0.5 cursor-pointer ${
                      modalMorningDays.length === 5 && modalAfternoonDays.length === 0
                        ? 'bg-teal-50 border-teal-500 ring-2 ring-teal-500/20 text-teal-900 font-bold'
                        : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      <span>🌅</span> Toàn trường học SÁNG
                    </span>
                    <span className="text-[11px] text-gray-500">Sáng T2-T6 (Tiết 1-5), Chiều nghỉ</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setModalMorningDays([]);
                      setModalAfternoonDays([0, 1, 2, 3, 4]);
                    }}
                    className={`p-2.5 rounded-xl border text-left transition-all flex flex-col gap-0.5 cursor-pointer ${
                      modalMorningDays.length === 0 && modalAfternoonDays.length === 5
                        ? 'bg-amber-50 border-amber-500 ring-2 ring-amber-500/20 text-amber-900 font-bold'
                        : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      <span>🌇</span> Toàn trường học CHIỀU
                    </span>
                    <span className="text-[11px] text-gray-500">Sáng nghỉ, Chiều T2-T6 (Tiết 1-3)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setModalMorningDays([0, 1, 2, 3, 4]);
                      setModalAfternoonDays([1, 3]);
                    }}
                    className={`p-2.5 rounded-xl border text-left transition-all flex flex-col gap-0.5 cursor-pointer ${
                      modalMorningDays.length === 5 && modalAfternoonDays.length === 2 && modalAfternoonDays.includes(1) && modalAfternoonDays.includes(3)
                        ? 'bg-blue-50 border-blue-500 ring-2 ring-blue-500/20 text-blue-900 font-bold'
                        : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      <span>✨</span> Sáng T2-T6 + Chiều T3, T5
                    </span>
                    <span className="text-[11px] text-gray-500">Học sáng cả tuần, chiều học 2 buổi</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setModalMorningDays([0, 1, 2, 3, 4]);
                      setModalAfternoonDays([0, 1, 2, 3, 4]);
                    }}
                    className={`p-2.5 rounded-xl border text-left transition-all flex flex-col gap-0.5 cursor-pointer ${
                      modalMorningDays.length === 5 && modalAfternoonDays.length === 5
                        ? 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-500/20 text-emerald-900 font-bold'
                        : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      <span>🔄</span> Học CẢ NGÀY (2 buổi/ngày)
                    </span>
                    <span className="text-[11px] text-gray-500">Sáng T2-T6 & Chiều T2-T6</span>
                  </button>
                </div>
              </div>

              {/* Tùy chỉnh chi tiết theo từng thứ */}
              <div className="bg-gray-50/90 p-4 rounded-xl border border-gray-200 space-y-4">
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">
                  2. Tùy chỉnh chi tiết ngày học trong tuần:
                </label>

                {/* Sáng */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-teal-900 flex items-center gap-1.5">
                      <span>🌅</span> Buổi Sáng (Tiết 1 - 5)
                    </span>
                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setModalMorningDays([0, 1, 2, 3, 4])}
                        className="text-teal-700 hover:underline font-semibold cursor-pointer"
                      >
                        Cả tuần (T2-T6)
                      </button>
                      <span className="text-gray-300">|</span>
                      <button
                        type="button"
                        onClick={() => setModalMorningDays([])}
                        className="text-gray-500 hover:underline cursor-pointer"
                      >
                        Nghỉ tất cả
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {[0, 1, 2, 3, 4].map(d => {
                      const active = modalMorningDays.includes(d);
                      return (
                        <button
                          type="button"
                          key={d}
                          onClick={() => {
                            setModalMorningDays(prev =>
                              prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort((a, b) => a - b)
                            );
                          }}
                          className={`py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                            active
                              ? 'bg-teal-600 text-white shadow-xs scale-102 ring-1 ring-teal-500'
                              : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-100'
                          }`}
                        >
                          {DAYS[d]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Chiều */}
                <div className="pt-3 border-t border-gray-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                      <span>🌇</span> Buổi Chiều (Tiết 1 - 3)
                    </span>
                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setModalAfternoonDays([0, 1, 2, 3, 4])}
                        className="text-amber-700 hover:underline font-semibold cursor-pointer"
                      >
                        Cả tuần (T2-T6)
                      </button>
                      <span className="text-gray-300">|</span>
                      <button
                        type="button"
                        onClick={() => setModalAfternoonDays([])}
                        className="text-gray-500 hover:underline cursor-pointer"
                      >
                        Nghỉ tất cả
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {[0, 1, 2, 3, 4].map(d => {
                      const active = modalAfternoonDays.includes(d);
                      return (
                        <button
                          type="button"
                          key={d}
                          onClick={() => {
                            setModalAfternoonDays(prev =>
                              prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort((a, b) => a - b)
                            );
                          }}
                          className={`py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                            active
                              ? 'bg-amber-600 text-white shadow-xs scale-102 ring-1 ring-amber-500'
                              : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-100'
                          }`}
                        >
                          {DAYS[d]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Tùy chọn xử lý các lớp cá biệt */}
              <div className="p-3.5 rounded-xl border border-teal-200 bg-teal-50/50 space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={resetOverrides}
                    onChange={e => setResetOverrides(e.target.checked)}
                    className="mt-0.5 rounded border-gray-300 text-teal-600 focus:ring-teal-500 w-4 h-4 cursor-pointer"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-gray-900">
                      Đồng bộ 100% toàn trường (Xóa các lịch cá biệt của từng lớp)
                    </span>
                    <p className="text-gray-600 mt-0.5">
                      Khi chọn, tất cả các lớp sẽ lập tức tuân thủ đúng ca học Toàn trường này. Nếu bỏ chọn, các lớp đã được Thầy/Cô gán lịch riêng trước đó vẫn sẽ giữ nguyên.
                    </p>
                  </div>
                </label>

                {individualOverrideClasses.length > 0 && (
                  <div className="text-[11px] text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-200">
                    ⚠️ Hiện có <strong>{individualOverrideClasses.length} lớp</strong> có cấu hình riêng ({individualOverrideClasses.slice(0, 6).join(', ')}{individualOverrideClasses.length > 6 ? '...' : ''}).
                  </div>
                )}
              </div>
            </div>

            {/* Footer Modal */}
            <div className="p-4 md:p-5 border-t border-gray-200 bg-gray-50 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setIsSchoolModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-100 text-xs font-bold transition-colors cursor-pointer"
              >
                Hủy bỏ
              </button>

              <button
                type="button"
                onClick={handleApplySchoolShiftModal}
                disabled={modalMorningDays.length === 0 && modalAfternoonDays.length === 0}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs shadow-md shadow-teal-700/20 transition-all cursor-pointer"
              >
                <span>🏫✓</span>
                <span>Xác nhận áp dụng cho Toàn trường</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SchoolShiftMatrix;
