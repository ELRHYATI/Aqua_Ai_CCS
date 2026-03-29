-- Create read-only PostgreSQL role for chatbot (RAG isolation).
-- Run as superuser: psql -U postgres -d azura_aqua -f create_chatbot_role.sql
-- Replace 'YOUR_SECURE_PASSWORD' with actual password from CHATBOT_DATABASE_URL.

-- Drop existing role if re-running (optional)
-- DROP ROLE IF EXISTS chatbot_ro;

CREATE ROLE chatbot_ro WITH LOGIN PASSWORD 'YOUR_SECURE_PASSWORD';

-- Grant connect to database
GRANT CONNECT ON DATABASE azura_aqua TO chatbot_ro;

-- Grant usage on public schema
GRANT USAGE ON SCHEMA public TO chatbot_ro;

-- Grant SELECT only on chatbot views (created by migration 004)
GRANT SELECT ON estran_summary TO chatbot_ro;
GRANT SELECT ON finance_kpi_public TO chatbot_ro;
GRANT SELECT ON achat_status TO chatbot_ro;

-- Revoke all other privileges (role has no write access)
REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM chatbot_ro;
REVOKE CREATE ON SCHEMA public FROM chatbot_ro;
