-- work_log 테이블 생성
-- Supabase SQL Editor에서 실행하세요

CREATE TABLE IF NOT EXISTS work_log (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,        -- 'batch_start', 'user_progress', 'batch_complete', 'error'
  message TEXT NOT NULL,            -- 사람이 읽을 수 있는 요약
  details JSONB DEFAULT '{}',       -- 추가 정보 (유저 수, 성공/실패 등)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS 활성화 및 정책 설정
ALTER TABLE work_log ENABLE ROW LEVEL SECURITY;

-- anon key로 읽기/쓰기 가능하도록 정책 설정
CREATE POLICY "allow_all_read" ON work_log FOR SELECT USING (true);
CREATE POLICY "allow_all_insert" ON work_log FOR INSERT WITH CHECK (true);
CREATE POLICY "allow_all_delete" ON work_log FOR DELETE USING (true);

-- 오래된 로그 자동 정리를 위한 인덱스
CREATE INDEX idx_work_log_created_at ON work_log (created_at DESC);
CREATE INDEX idx_work_log_event_type ON work_log (event_type);
