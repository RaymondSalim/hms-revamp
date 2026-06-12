const MAX_IMAGE_BYTES = 1024 * 1024; // 1MB
const ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"];

const DATA_URL_RE = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=]+)$/i;

export type ImageValidation = { ok: true; mime: string; bytes: number } | { ok: false; error: string };

/**
 * Validate a base64 image data URL on the server. Enforces the byte cap on the
 * decoded payload because the client-side size check can be bypassed.
 */
export function validateImageDataUrl(value: string): ImageValidation {
  const match = DATA_URL_RE.exec(value);
  if (!match) return { ok: false, error: "Format gambar tidak valid" };

  const [, mime, base64] = match;
  if (!ALLOWED_MIME.includes(mime.toLowerCase())) {
    return { ok: false, error: "Tipe gambar tidak didukung" };
  }

  const bytes = Buffer.byteLength(base64, "base64");
  if (bytes > MAX_IMAGE_BYTES) {
    return { ok: false, error: "Ukuran gambar melebihi 1 MB" };
  }

  return { ok: true, mime, bytes };
}
