-- calendar_tasks 테이블 생성
-- 일정의 완료 상태를 추적하기 위한 테이블
-- Supabase SQL Editor에서 실행

CREATE TABLE IF NOT EXISTS calendar_tasks (
  id BIGSERIAL PRIMARY KEY,
  event_uid TEXT NOT NULL,
  title TEXT NOT NULL,
  date DATE NOT NULL,
  event_number INTEGER,
  is_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_uid, date)
);

-- RLS 활성화 및 정책 설정
ALTER TABLE calendar_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_select" ON calendar_tasks FOR SELECT USING (true);
CREATE POLICY "allow_all_insert" ON calendar_tasks FOR INSERT WITH CHECK (true);
CREATE POLICY "allow_all_update" ON calendar_tasks FOR UPDATE USING (true);
CREATE POLICY "allow_all_delete" ON calendar_tasks FOR DELETE USING (true);

-- 인덱스
CREATE INDEX idx_calendar_tasks_date ON calendar_tasks (date DESC);
CREATE INDEX idx_calendar_tasks_completed ON calendar_tasks (date, is_completed);
