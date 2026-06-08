import nodemailer from "nodemailer";
import { prisma } from "@/app/_lib/prisma";

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

  const subject = `Pengingat Tagihan - ${bill.description}`;
  const html = `
    <p>Yth. ${tenant.name},</p>
    <p>Ini adalah pengingat untuk tagihan Anda:</p>
    <ul>
      <li>Kamar: ${room.room_number}</li>
      <li>Deskripsi: ${bill.description}</li>
      <li>Total Tagihan: Rp${outstanding.toLocaleString("id-ID")}</li>
      <li>Jatuh Tempo: ${bill.due_date.toLocaleDateString("id-ID")}</li>
    </ul>
    <p>Silakan melakukan pembayaran ke:</p>
    <p><strong>BCA 5491118777 a.n. Adriana Nugroho</strong></p>
    <p>Terima kasih.</p>
  `;

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
  const subject = "Reset Password - MICASA Suites";
  const html = `
    <p>Password Anda telah direset.</p>
    <p>Password baru Anda: <strong>${newPassword}</strong></p>
    <p>Silakan login dan ubah password Anda segera.</p>
  `;

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
