-- ====================================================================
-- KỊCH BẢN KHỞI TẠO CƠ SỞ DỮ LIỆU SUPABASE CHO SMART SCHEDULER PRO
-- Copy và dán toàn bộ câu lệnh dưới đây vào Supabase -> SQL Editor -> Run
-- ====================================================================

-- 1. BẢNG PHÂN CÔNG GIẢNG DẠY (Assignments)
CREATE TABLE IF NOT EXISTS public.assignments (
    id BIGINT PRIMARY KEY,
    teacher TEXT NOT NULL,
    subject TEXT NOT NULL,
    class_name TEXT NOT NULL,
    sessions_per_week INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. BẢNG RÀNG BUỘC THỜI KHÓA BIỂU (Constraints)
CREATE TABLE IF NOT EXISTS public.constraints (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL, -- 'TEACHER_BUSY' hoặc 'FIXED_SESSION'
    teacher TEXT,
    class_name TEXT,
    subject TEXT,
    day INT NOT NULL, -- 0 (Thứ 2) đến 4 (Thứ 6)
    period INT NOT NULL, -- 0 đến 4
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. BẢNG LƯU PHIÊN BẢN VÀ LỊCH SỬ TKB (Timetable Versions)
CREATE TABLE IF NOT EXISTS public.timetable_versions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    data JSONB NOT NULL DEFAULT '[]'::jsonb,
    constraints JSONB NOT NULL DEFAULT '[]'::jsonb,
    schedule JSONB NOT NULL DEFAULT '{}'::jsonb,
    unassigned JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. CHỈ MỤC (INDEX) TỐI ƯU TỐC ĐỘ TRUY VẤN
CREATE INDEX IF NOT EXISTS idx_assignments_teacher ON public.assignments(teacher);
CREATE INDEX IF NOT EXISTS idx_assignments_class_name ON public.assignments(class_name);
CREATE INDEX IF NOT EXISTS idx_constraints_teacher ON public.constraints(teacher);
CREATE INDEX IF NOT EXISTS idx_versions_created_at ON public.timetable_versions(created_at DESC);

-- 5. PHÂN QUYỀN ROW LEVEL SECURITY (RLS) CHO PHÉP TRUY CẬP
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.constraints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_versions ENABLE ROW LEVEL SECURITY;

-- Cho phép đọc / ghi dữ liệu cho Anon key
DROP POLICY IF EXISTS "Public Read Assignments" ON public.assignments;
CREATE POLICY "Public Read Assignments" ON public.assignments FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public Insert Assignments" ON public.assignments;
CREATE POLICY "Public Insert Assignments" ON public.assignments FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Public Update Assignments" ON public.assignments;
CREATE POLICY "Public Update Assignments" ON public.assignments FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Public Delete Assignments" ON public.assignments;
CREATE POLICY "Public Delete Assignments" ON public.assignments FOR DELETE USING (true);

DROP POLICY IF EXISTS "Public Read Constraints" ON public.constraints;
CREATE POLICY "Public Read Constraints" ON public.constraints FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public Insert Constraints" ON public.constraints;
CREATE POLICY "Public Insert Constraints" ON public.constraints FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Public Update Constraints" ON public.constraints;
CREATE POLICY "Public Update Constraints" ON public.constraints FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Public Delete Constraints" ON public.constraints;
CREATE POLICY "Public Delete Constraints" ON public.constraints FOR DELETE USING (true);

DROP POLICY IF EXISTS "Public Read Versions" ON public.timetable_versions;
CREATE POLICY "Public Read Versions" ON public.timetable_versions FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public Insert Versions" ON public.timetable_versions;
CREATE POLICY "Public Insert Versions" ON public.timetable_versions FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Public Update Versions" ON public.timetable_versions;
CREATE POLICY "Public Update Versions" ON public.timetable_versions FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Public Delete Versions" ON public.timetable_versions;
CREATE POLICY "Public Delete Versions" ON public.timetable_versions FOR DELETE USING (true);
