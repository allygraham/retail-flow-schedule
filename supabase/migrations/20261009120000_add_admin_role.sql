-- Separate migration: PostgreSQL must commit a new enum value before using it.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'admin';
