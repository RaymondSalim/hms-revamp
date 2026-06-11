import { describe, it, expect, beforeEach, vi } from "vitest";
import "../helpers/mock-next";
import { testPrisma, cleanDatabase, seedTestData } from "../helpers/prisma";
import {
  renderTemplate,
  getTemplateOrDefault,
} from "@/app/_lib/email/render-template";
import { DEFAULT_TEMPLATES } from "@/app/_lib/email/template-keys";

const mockSendMail = vi.fn().mockResolvedValue({ messageId: "test" });
vi.mock("nodemailer", () => {
  const createTransport = () => ({
    sendMail: (...args: any[]) => mockSendMail(...args),
  });
  return { default: { createTransport }, createTransport };
});

// Imported AFTER the mock so the mocked transport is used.
import { sendBillReminderEmail } from "@/app/_lib/mailer";

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

describe("sendBillReminderEmail with templates", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestData();
    mockSendMail.mockClear();
  });

  it("renders a stored custom template and passes it to the transport", async () => {
    await testPrisma.emailTemplate.create({
      data: {
        template_key: "BILL_REMINDER",
        subject: "Tagihan {{tenant_name}}",
        body_html: "<p>{{room_number}} owes Rp{{outstanding}}</p>",
        is_enabled: true,
      },
    });

    const bill = {
      description: "Tagihan Juni 2026",
      due_date: new Date("2026-06-30"),
      bookings: {
        tenants: { name: "Budi", email: "budi@test.com" },
        rooms: { room_number: "A1" },
      },
      bill_item: [{ amount: 1000000 }],
      paymentBills: [{ amount: 250000 }],
    };

    await sendBillReminderEmail(bill as any);

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const arg = mockSendMail.mock.calls[0][0];
    expect(arg.to).toBe("budi@test.com");
    expect(arg.subject).toBe("Tagihan Budi");
    // outstanding = 1,000,000 - 250,000 = 750,000 formatted id-ID
    expect(arg.html).toContain("A1 owes Rp750.000");

    const logs = await testPrisma.emailLogs.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe("SUCCESS");
  });

  it("uses the hardcoded default body (with bank account) when no row exists", async () => {
    const bill = {
      description: "Tagihan Juni 2026",
      due_date: new Date("2026-06-30"),
      bookings: {
        tenants: { name: "Budi", email: "budi@test.com" },
        rooms: { room_number: "A1" },
      },
      bill_item: [{ amount: 1000000 }],
      paymentBills: [],
    };

    await sendBillReminderEmail(bill as any);

    const arg = mockSendMail.mock.calls[0][0];
    expect(arg.html).toContain("BCA 5491118777 a.n. Adriana Nugroho");
    expect(arg.html).toContain("Budi");
    expect(arg.html).toContain("Rp1.000.000");
  });
});
