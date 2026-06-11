import nodemailer from "nodemailer";
import { prisma } from "@/app/_lib/prisma";
import {
  getTemplateOrDefault,
  renderTemplate,
} from "@/app/_lib/email/render-template";

const transporter =
  process.env.NODE_ENV === "production"
    ? nodemailer.createTransport({
        host:
          process.env.SMTP_HOST ||
          "email-smtp.ap-southeast-1.amazonaws.com",
        port: 465,
        secure: true,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      })
    : nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        auth: {
          user: "nora56@ethereal.email",
          pass: "jn7jnAPss4f63QBp6D",
        },
      });

const DEFAULT_FROM = '"MICASA Suites" <noreply@micasasuites.com>';

export async function sendBillReminderEmail(bill: any) {
  const tenant = bill.bookings.tenants;
  const room = bill.bookings.rooms;
  const total = bill.bill_item.reduce(
    (s: number, i: any) => s + Number(i.amount),
    0,
  );
  const paid = bill.paymentBills.reduce(
    (s: number, p: any) => s + Number(p.amount),
    0,
  );
  const outstanding = total - paid;

  const template = await getTemplateOrDefault("BILL_REMINDER");
  const vars: Record<string, string> = {
    tenant_name: tenant.name,
    room_number: String(room.room_number),
    bill_description: bill.description,
    outstanding: outstanding.toLocaleString("id-ID"),
    due_date: bill.due_date.toLocaleDateString("id-ID"),
  };
  const subject = renderTemplate(template.subject, vars);
  const html = renderTemplate(template.body_html, vars);

  try {
    await transporter.sendMail({
      from: DEFAULT_FROM,
      to: tenant.email,
      subject,
      html,
    });
    await prisma.emailLogs.create({
      data: {
        from: DEFAULT_FROM,
        to: tenant.email,
        subject,
        status: "SUCCESS",
        payload: html,
      },
    });
  } catch (e: any) {
    const status = e.responseCode ? "FAIL_SERVER" : "FAIL_CLIENT";
    await prisma.emailLogs.create({
      data: {
        from: DEFAULT_FROM,
        to: tenant.email,
        subject,
        status,
        payload: e.message,
      },
    });
    throw e;
  }
}

export async function sendPasswordResetEmail(
  email: string,
  newPassword: string,
) {
  const template = await getTemplateOrDefault("PASSWORD_RESET");
  const vars: Record<string, string> = { new_password: newPassword };
  const subject = renderTemplate(template.subject, vars);
  const html = renderTemplate(template.body_html, vars);

  try {
    await transporter.sendMail({
      from: DEFAULT_FROM,
      to: email,
      subject,
      html,
    });
    await prisma.emailLogs.create({
      data: {
        from: DEFAULT_FROM,
        to: email,
        subject,
        status: "SUCCESS",
        payload: html,
      },
    });
  } catch (e: any) {
    const status = e.responseCode ? "FAIL_SERVER" : "FAIL_CLIENT";
    await prisma.emailLogs.create({
      data: {
        from: DEFAULT_FROM,
        to: email,
        subject,
        status,
        payload: e.message,
      },
    });
  }
}
