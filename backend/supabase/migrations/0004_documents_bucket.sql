-- Creates the private Storage bucket generated DOC-001/002/003/009 PDFs are
-- uploaded to (see backend/services/storageService.js). Without this bucket,
-- document generation (SIGNING stage / POST /api/deals/:id/generate-docs)
-- will fail with "Bucket not found".
--
-- Run this file in the Supabase SQL Editor (Project > SQL Editor > New query > paste > Run).

insert into storage.buckets (id, name, public)
values ('deal-documents', 'deal-documents', false)
on conflict (id) do nothing;

-- Service-role key (used by supabaseAdmin) bypasses storage RLS by default,
-- so no additional storage.objects policies are required for backend uploads.
