-- command_queue 테이블 생성
-- 텔레그램 챗봇에서 로컬 PC로 미션 명령을 전달하기 위한 큐 테이블
-- Supabase SQL Editor에서 실행하세요

CREATE TABLE IF NOT EXISTS command_queue (
  id BIGSERIAL PRIMARY KEY,
  command TEXT NOT NULL,               -- 'run', 'dryrun', 'stop'
  args JSONB DEFAULT '{}',             -- {"round": 3, "maxUsers": 100, "concurrency": 1}
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' → 'running' → 'done' / 'error'
  result TEXT,                         -- 실행 결과 메시지
  requested_by TEXT,                   -- 요청자 이름
  chat_id BIGINT,                      -- 응답 보낼 텔레그램 채팅 ID
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS 활성화 및 정책 설정
ALTER TABLE command_queue ENABLE ROW LEVEL SECURITY;

-- anon key로 읽기/쓰기/수정/삭제 가능
CREATE POLICY "allow_all_select" ON command_queue FOR SELECT USING (true);
CREATE POLICY "allow_all_insert" ON command_queue FOR INSERT WITH CHECK (true);
CREATE POLICY "allow_all_update" ON command_queue FOR UPDATE USING (true);
CREATE POLICY "allow_all_delete" ON command_queue FOR DELETE USING (true);

-- 인덱스
CREATE INDEX idx_command_queue_status ON command_queue (status);
CREATE INDEX idx_command_queue_created_at ON command_queue (created_at DESC);
