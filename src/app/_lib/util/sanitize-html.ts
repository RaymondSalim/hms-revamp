import DOMPurify from "isomorphic-dompurify";

/**
 * Sanitize an admin-authored HTML template before persisting it.
 *
 * Templates are full HTML documents (email layouts, invoice PDFs) containing
 * <head>, <style>, tables, and `{{variable}}` placeholders. We must preserve
 * that document structure and inline styling while removing anything that can
 * execute: <script>, event-handler attributes (onerror/onclick/...), and
 * javascript:/data: script URLs.
 *
 * This matters for two reasons beyond ordinary stored-XSS:
 *  - The invoice template is rendered by a headless browser to produce the PDF,
 *    so injected script runs server-side.
 *  - Email bodies render in recipients' mail clients.
 *
 * `{{variable}}` tokens are plain text to the parser and pass through untouched.
 */
export function sanitizeTemplateHtml(dirty: string): string {
  const clean = DOMPurify.sanitize(dirty, {
    WHOLE_DOCUMENT: true,
    ADD_TAGS: ["style", "meta", "link"],
    ADD_ATTR: ["target"],
    // Keep <style> contents (CSS is required for email/PDF layout).
    FORBID_TAGS: ["script", "noscript", "iframe", "object", "embed", "base"],
    FORBID_ATTR: ["srcset"],
  });

  // DOMPurify drops the <!DOCTYPE html> declaration. Restore it for documents
  // that had one so the invoice PDF renders in standards mode (quirks mode
  // would change box-sizing/margins). Match the original casing/spacing loosely.
  const hadDoctype = /^\s*<!doctype\s+html/i.test(dirty);
  if (hadDoctype && !/^\s*<!doctype/i.test(clean)) {
    return `<!DOCTYPE html>\n${clean}`;
  }
  return clean;
}
