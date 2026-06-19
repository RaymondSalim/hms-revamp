import { describe, it, expect } from "vitest";
import { sanitizeTemplateHtml } from "@/app/_lib/util/sanitize-html";

describe("sanitizeTemplateHtml", () => {
  it("removes <script> tags", () => {
    const out = sanitizeTemplateHtml(
      "<p>hi</p><script>alert('xss')</script>"
    );
    expect(out).not.toMatch(/<script/i);
    expect(out).toContain("<p>hi</p>");
  });

  it("strips event-handler attributes", () => {
    const out = sanitizeTemplateHtml('<img src="x" onerror="fetch(\'//evil\')">');
    expect(out).not.toMatch(/onerror/i);
    expect(out).toMatch(/<img/i);
  });

  it("neutralizes javascript: URLs", () => {
    const out = sanitizeTemplateHtml('<a href="javascript:alert(1)">click</a>');
    expect(out).not.toMatch(/javascript:/i);
  });

  it("removes iframe/object/embed", () => {
    const out = sanitizeTemplateHtml(
      '<iframe src="//evil"></iframe><object></object><embed>'
    );
    expect(out).not.toMatch(/<iframe|<object|<embed/i);
  });

  it("preserves <style> blocks (needed for email/PDF layout)", () => {
    const out = sanitizeTemplateHtml(
      "<html><head><style>.x{color:red}</style></head><body></body></html>"
    );
    expect(out).toMatch(/<style/i);
    expect(out).toContain("color:red");
  });

  it("preserves tables and inline styles", () => {
    const out = sanitizeTemplateHtml(
      '<table><tr><td style="padding:8px">x</td></tr></table>'
    );
    expect(out).toMatch(/<table/i);
    expect(out).toMatch(/padding:8px/);
  });

  it("leaves {{variable}} placeholders untouched", () => {
    const tpl =
      '<p>Yth {{tenant_name}}</p><img src="{{company_logo_url}}"><a href="{{reset_link}}">x</a>';
    const out = sanitizeTemplateHtml(tpl);
    expect(out).toContain("{{tenant_name}}");
    expect(out).toContain("{{company_logo_url}}");
    expect(out).toContain("{{reset_link}}");
  });

  it("restores the DOCTYPE for full documents", () => {
    const out = sanitizeTemplateHtml(
      "<!DOCTYPE html><html><head></head><body><p>x</p></body></html>"
    );
    expect(out).toMatch(/^<!DOCTYPE html>/i);
  });

  it("does not add a DOCTYPE to fragments", () => {
    const out = sanitizeTemplateHtml("<p>just a fragment</p>");
    expect(out).not.toMatch(/<!DOCTYPE/i);
  });
});
