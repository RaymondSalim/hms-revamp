import { describe, it, expect, beforeEach } from "vitest";
import "../helpers/mock-next";
import { testPrisma, cleanDatabase, seedTestData } from "../helpers/prisma";
import {
  renderTemplate,
  getTemplateOrDefault,
} from "@/app/_lib/email/render-template";
import { DEFAULT_TEMPLATES } from "@/app/_lib/email/template-keys";

describe("renderTemplate", () => {
  it("substitutes a single placeholder", () => {
    const out = renderTemplate("Halo {{name}}", { name: "Budi" });
    expect(out).toBe("Halo Budi");
  });

  it("substitutes the same placeholder multiple times", () => {
    const out = renderTemplate("{{x}}-{{x}}", { x: "1" });
    expect(out).toBe("1-1");
  });

  it("handles placeholders with surrounding whitespace", () => {
    const out = renderTemplate("a {{ name }} b", { name: "Z" });
    expect(out).toBe("a Z b");
  });

  it("leaves unknown placeholders untouched", () => {
    const out = renderTemplate("{{a}} {{b}}", { a: "1" });
    expect(out).toBe("1 {{b}}");
  });

  it("returns the string unchanged when there are no placeholders", () => {
    expect(renderTemplate("plain text", {})).toBe("plain text");
  });
});

describe("getTemplateOrDefault", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestData();
  });

  it("returns the hardcoded default when no row exists", async () => {
    const t = await getTemplateOrDefault("BILL_REMINDER");
    expect(t.subject).toBe(DEFAULT_TEMPLATES.BILL_REMINDER.subject);
    expect(t.body_html).toBe(DEFAULT_TEMPLATES.BILL_REMINDER.body_html);
  });

  it("returns the stored row when one exists and is enabled", async () => {
    await testPrisma.emailTemplate.create({
      data: {
        template_key: "BILL_REMINDER",
        subject: "Custom subject {{tenant_name}}",
        body_html: "<p>Custom {{outstanding}}</p>",
        is_enabled: true,
      },
    });
    const t = await getTemplateOrDefault("BILL_REMINDER");
    expect(t.subject).toBe("Custom subject {{tenant_name}}");
    expect(t.body_html).toBe("<p>Custom {{outstanding}}</p>");
  });

  it("falls back to the default when the row is disabled", async () => {
    await testPrisma.emailTemplate.create({
      data: {
        template_key: "BILL_REMINDER",
        subject: "Should be ignored",
        body_html: "ignored",
        is_enabled: false,
      },
    });
    const t = await getTemplateOrDefault("BILL_REMINDER");
    expect(t.subject).toBe(DEFAULT_TEMPLATES.BILL_REMINDER.subject);
  });
});
