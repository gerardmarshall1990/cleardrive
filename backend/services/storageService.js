// Uploads generated documents to Supabase Storage so the URL saved on a deal
// (doc00X_url) is a durable, fetchable link instead of a path on the
// backend's local disk — which isn't servable to any client, and on most
// Node hosts (Render/Railway/Heroku-style ephemeral filesystems) is wiped on
// every restart/redeploy, permanently losing signed legal documents.
//
// Requires a private Storage bucket named per DOCUMENTS_BUCKET below to
// already exist — create it once via the Supabase SQL Editor, see
// supabase/migrations/0004_documents_bucket.sql.
const fs = require('fs');
const { supabaseAdmin } = require('../config/supabase');

const DOCUMENTS_BUCKET = process.env.SUPABASE_DOCUMENTS_BUCKET || 'deal-documents';
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 365; // 1 year

/**
 * @param {string} filePath - local path of the just-generated PDF
 * @param {string} storagePath - destination path within the bucket, e.g. `${dealId}/DOC-001.pdf`
 * @returns {Promise<string>} a signed URL for the uploaded file
 */
async function uploadGeneratedDoc(filePath, storagePath) {
  const buffer = fs.readFileSync(filePath);

  const { error: uploadError } = await supabaseAdmin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(storagePath, buffer, { contentType: 'application/pdf', upsert: true });
  if (uploadError) throw new Error(`Failed to upload ${storagePath} to storage: ${uploadError.message}`);

  const { data, error: signError } = await supabaseAdmin.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (signError) throw new Error(`Failed to create signed URL for ${storagePath}: ${signError.message}`);

  return data.signedUrl;
}

/**
 * Uploads a user-submitted photo (Mulkiya, bank settlement letter, etc.) to
 * the same private bucket generated documents use, so admin can review the
 * original source image if Claude Vision's extraction turns out to be wrong.
 * Saved regardless of whether extraction succeeds — a failed extraction is
 * exactly when admin most needs to see the raw photo.
 * @param {string} base64 - raw base64 image data (no data: URL prefix)
 * @param {string} mediaType - e.g. 'image/jpeg'
 * @param {string} storagePath - destination path within the bucket, e.g. `${dealId}/mulkiya-<timestamp>.jpg`
 * @returns {Promise<string>} a signed URL for the uploaded file
 */
async function uploadUserImage(base64, mediaType, storagePath) {
  const buffer = Buffer.from(base64, 'base64');

  const { error: uploadError } = await supabaseAdmin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(storagePath, buffer, { contentType: mediaType || 'image/jpeg', upsert: true });
  if (uploadError) throw new Error(`Failed to upload ${storagePath} to storage: ${uploadError.message}`);

  const { data, error: signError } = await supabaseAdmin.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (signError) throw new Error(`Failed to create signed URL for ${storagePath}: ${signError.message}`);

  return data.signedUrl;
}

module.exports = { uploadGeneratedDoc, uploadUserImage, DOCUMENTS_BUCKET };
