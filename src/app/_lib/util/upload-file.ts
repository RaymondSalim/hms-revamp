const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB

// Proof/document uploads (payment proofs, tenant ID scans). Mirrors the
// allowlist the S3 proxy is willing to serve inline — notably NO svg+xml or
// html, which can execute script on our origin. The client-side accept= filter
// can be bypassed, so the server must re-check the decoded payload.
const ALLOWED_MIME = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
];

const DATA_URL_RE = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=]+)$/i;

export type UploadValidation =
  | { ok: true; mime: string; buffer: Buffer }
  | { ok: false; error: string };

/**
 * Validate a base64 data URL destined for S3. Enforces the MIME allowlist and a
 * byte cap on the DECODED payload, then returns the decoded buffer so callers
 * don't re-parse the data URL (which would let the validated MIME drift from the
 * bytes actually uploaded).
 */
export function validateUploadDataUrl(value: string): UploadValidation {
  const match = DATA_URL_RE.exec(value);
  if (!match) return { ok: false, error: "Format berkas tidak valid" };

  const [, mime, base64] = match;
  if (!ALLOWED_MIME.includes(mime.toLowerCase())) {
    return { ok: false, error: "Tipe berkas tidak didukung" };
  }

  const buffer = Buffer.from(base64, "base64");
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    return { ok: false, error: "Ukuran berkas melebihi 10 MB" };
  }

  return { ok: true, mime: mime.toLowerCase(), buffer };
}
