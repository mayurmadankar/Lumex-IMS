import { appendFile } from "node:fs/promises";
import nodemailer from "nodemailer";

const smtpConfigured = () => Boolean(process.env.SMTP_HOST && (process.env.SMTP_FROM || process.env.SMTP_USER));

const getSmtpPassword = () => process.env.SMTP_PASS?.replace(/\s+/g, "");

const buildTransport = () => {
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  const smtpPassword = getSmtpPassword();

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth:
      process.env.SMTP_USER && smtpPassword
        ? {
            user: process.env.SMTP_USER,
            pass: smtpPassword,
          }
        : undefined,
  });
};

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const writeDevOtpLog = async ({ to, otp }) => {
  if (process.env.NODE_ENV === "production") return;

  try {
    await appendFile("password-reset-otp.log", `[${new Date().toISOString()}] ${to}: ${otp}\n`, "utf8");
  } catch (error) {
    console.error("Failed to write local password reset OTP log:", error instanceof Error ? error.message : error);
  }
};

const buildHeaders = ({ idempotencyKey } = {}) => {
  const headers = {};

  if (idempotencyKey) {
    headers["Resend-Idempotency-Key"] = idempotencyKey;
  }

  return headers;
};

export async function sendPasswordResetOtpEmail({ to, name, otp, expiresInMinutes, idempotencyKey }) {
  const subject = "Your IMS password reset OTP";
  const greeting = name ? `Hello ${name},` : "Hello,";
  const safeGreeting = escapeHtml(greeting);

  const text = [
    greeting,
    "",
    `Your password reset OTP is ${otp}.`,
    `This code expires in ${expiresInMinutes} minutes.`,
    "",
    "If you did not request this password reset, ignore this email.",
  ].join("\n");

  await writeDevOtpLog({ to, otp });

  if (!smtpConfigured()) {
    console.info(`[Password reset OTP] SMTP is not configured. OTP for ${to}: ${otp}`);
    return;
  }

  const transporter = buildTransport();

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    headers: buildHeaders({ idempotencyKey }),
    text,
    html: `
      <p>${safeGreeting}</p>
      <p>Your password reset OTP is:</p>
      <p style="font-size: 24px; font-weight: 700; letter-spacing: 4px;">${otp}</p>
      <p>This code expires in ${expiresInMinutes} minutes.</p>
      <p>If you did not request this password reset, ignore this email.</p>
    `,
  });
}
