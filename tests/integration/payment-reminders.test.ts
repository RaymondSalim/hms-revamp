import { describe, it, expect, beforeEach, vi } from "vitest";
import "../helpers/mock-next";
import { testPrisma, cleanDatabase, seedTestData } from "../helpers/prisma";
import { addDays } from "date-fns";

// Mock the mailer so no real email is sent; capture which bills it was called
// for so we can assert the right ones are reminded.
const sendBillReminderEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("@/app/_lib/mailer", () => ({
  sendBillReminderEmail: (bill: unknown) => sendBillReminderEmail(bill),
}));

import { runInvoiceReminders } from "@/app/api/(internal)/tasks/email/invoice-reminder/route";

const NOW = new Date("2026-06-11T00:00:00.000Z");

async function enableFlag() {
  await testPrisma.setting.upsert({
    where: { setting_key: "MONTHLY_INVOICE_EMAIL_REMINDER_ENABLED" },
    update: { setting_value: "true" },
    create: {
      setting_key: "MONTHLY_INVOICE_EMAIL_REMINDER_ENABLED",
      setting_value: "true",
    },
  });
}

/**
 * Creates a booking on room 1 (location 1) with a single bill due
 * `dueInDays` days from NOW (negative => overdue), an unpaid bill_item of
 * `itemAmount`, optionally fully paid, optionally without a tenant email.
 */
async function createBookingWithBill(opts: {
  dueInDays: number;
  itemAmount: number;
  idSuffix: string;
  paid?: boolean;
  withEmail?: boolean;
}) {
  const tenant = await testPrisma.tenant.create({
    data: {
      name: `Reminder Tenant ${opts.idSuffix}`,
      id_number: `rem-${opts.idSuffix}`,
      email:
        opts.withEmail === false ? null : `rem-${opts.idSuffix}@test.com`,
    },
  });
  const booking = await testPrisma.booking.create({
    data: {
      room_id: 1,
      start_date: new Date("2026-01-01"),
      fee: 1000000,
      tenant_id: tenant.id,
      is_rolling: true,
      status_id: 2,
    },
  });
  const bill = await testPrisma.bill.create({
    data: {
      booking_id: booking.id,
      description: "Tagihan",
      due_date: addDays(NOW, opts.dueInDays),
    },
  });
  await testPrisma.billItem.create({
    data: {
      bill_id: bill.id,
      description: "Biaya Sewa",
      amount: opts.itemAmount,
      type: "GENERATED",
    },
  });
  if (opts.paid) {
    const payment = await testPrisma.payment.create({
      data: {
        booking_id: booking.id,
        amount: opts.itemAmount,
        status_id: 2,
        payment_date: NOW,
      },
    });
    await testPrisma.paymentBill.create({
      data: {
        payment_id: payment.id,
        bill_id: bill.id,
        amount: opts.itemAmount,
      },
    });
  }
  return { booking, bill };
}

describe("runInvoiceReminders cron", () => {
  beforeEach(async () => {
    await cleanDatabase();
    await seedTestData();
    sendBillReminderEmail.mockClear();
  });

  it("default policy (7d): includes a bill due in 5 days, excludes one due in 20", async () => {
    await enableFlag();
    const within = await createBookingWithBill({
      dueInDays: 5,
      itemAmount: 1000000,
      idSuffix: "within",
    });
    await createBookingWithBill({
      dueInDays: 20,
      itemAmount: 1000000,
      idSuffix: "outside",
    });

    const result = await runInvoiceReminders(NOW);
    expect(result.stats.sent).toBe(1);
    expect(sendBillReminderEmail).toHaveBeenCalledTimes(1);
    expect(sendBillReminderEmail).toHaveBeenCalledWith(
      expect.objectContaining({ id: within.bill.id })
    );
  });

  it("location policy (14d): includes a bill due in 10 days (excluded under default 7)", async () => {
    await testPrisma.billingPolicy.create({
      data: { location_id: 1, reminder_days_before: 14 },
    });
    await enableFlag();
    const { bill } = await createBookingWithBill({
      dueInDays: 10,
      itemAmount: 1000000,
      idSuffix: "loc14",
    });

    const result = await runInvoiceReminders(NOW);
    expect(result.stats.sent).toBe(1);
    expect(sendBillReminderEmail).toHaveBeenCalledWith(
      expect.objectContaining({ id: bill.id })
    );
  });

  it("excludes a fully paid bill due within the window", async () => {
    await enableFlag();
    await createBookingWithBill({
      dueInDays: 3,
      itemAmount: 1000000,
      idSuffix: "paid",
      paid: true,
    });

    const result = await runInvoiceReminders(NOW);
    expect(result.stats.sent).toBe(0);
    expect(sendBillReminderEmail).not.toHaveBeenCalled();
  });

  it("excludes a bill whose tenant has no email", async () => {
    await enableFlag();
    await createBookingWithBill({
      dueInDays: 3,
      itemAmount: 1000000,
      idSuffix: "noemail",
      withEmail: false,
    });

    const result = await runInvoiceReminders(NOW);
    expect(result.stats.sent).toBe(0);
    expect(sendBillReminderEmail).not.toHaveBeenCalled();
  });

  it("excludes an already-overdue bill (only reminds upcoming)", async () => {
    await enableFlag();
    await createBookingWithBill({
      dueInDays: -5,
      itemAmount: 1000000,
      idSuffix: "overdue",
    });

    const result = await runInvoiceReminders(NOW);
    expect(result.stats.sent).toBe(0);
    expect(sendBillReminderEmail).not.toHaveBeenCalled();
  });

  it("sends nothing when the feature flag is off", async () => {
    // Flag intentionally NOT enabled.
    await createBookingWithBill({
      dueInDays: 3,
      itemAmount: 1000000,
      idSuffix: "flagoff",
    });

    const result = await runInvoiceReminders(NOW);
    expect(result.stats.sent).toBe(0);
    expect(sendBillReminderEmail).not.toHaveBeenCalled();
  });
});
