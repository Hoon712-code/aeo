-- =============================================
-- AI Training Mission System - Database Schema
-- =============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  "group" TEXT NOT NULL CHECK ("group" IN ('A', 'B', 'C', 'D', 'E')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Missions table (master data)
CREATE TABLE IF NOT EXISTS missions (
  id SERIAL PRIMARY KEY,
  week INT NOT NULL CHECK (week BETWEEN 1 AND 4),
  step INT NOT NULL CHECK (step BETWEEN 1 AND 3),
  target_ai TEXT NOT NULL,
  instruction TEXT NOT NULL,
  prompt_template TEXT NOT NULL
);

-- 3. Logs table (user completion records)
CREATE TABLE IF NOT EXISTS logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mission_id INT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  ai_response_snippet TEXT NOT NULL,
  completed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_logs_user_id ON logs(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_completed_at ON logs(completed_at);
CREATE INDEX IF NOT EXISTS idx_users_group ON users("group");

-- Unique constraint: prevent duplicate mission completion by same user on same mission
-- (We'll handle daily abuse prevention in application logic)
CREATE UNIQUE INDEX IF NOT EXISTS idx_logs_user_mission ON logs(user_id, mission_id);

-- RLS Policies (permissive for anon key usage)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read users" ON users FOR SELECT USING (true);
CREATE POLICY "Allow read missions" ON missions FOR SELECT USING (true);
CREATE POLICY "Allow read logs" ON logs FOR SELECT USING (true);
CREATE POLICY "Allow insert logs" ON logs FOR INSERT WITH CHECK (true);
