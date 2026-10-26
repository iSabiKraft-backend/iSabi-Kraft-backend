import nodemailer from "nodemailer";
import { httpError } from "../utils/httpError.js";
//import Notification from "../models/notificationModel.js";

let transporter;
const getTransporter = () => {
  if (!process.env.SMTP_HOST) return null;
  transporter ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transporter;
};

const devFallback = (kind, to, text) => {
  if (process.env.NODE_ENV === "production") {
    throw httpError(`${kind} delivery is not configured on the server.`, 503);
  }
  console.log(`[DEV ${kind}] to ${to}: ${text}`);
};

export async function sendEmail({ to, subject, text }) {
  const mailer = getTransporter();
  if (!mailer) return devFallback("EMAIL", to, `${subject} — ${text}`);
  try {
    await mailer.sendMail({ from: process.env.EMAIL_FROM || process.env.SMTP_USER, to, subject, text });
  } catch (error) {
    console.error("Email delivery failed:", error.message);
    throw httpError("We couldn't send the email. Please try again.", 502);
  }
}

export async function sendSms({ to, text }) {
  if (!process.env.TERMII_API_KEY) return devFallback("SMS", to, text);
  try {
    const response = await fetch(`${process.env.TERMII_BASE_URL || "https://api.ng.termii.com"}/api/sms/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: to.replace(/^\+/, ""),
        from: process.env.TERMII_SENDER_ID || "iSabiKraft",
        sms: text,
        type: "plain",
        channel: "generic",
        api_key: process.env.TERMII_API_KEY,
      }),
    });
    if (!response.ok) throw new Error(`Termii responded ${response.status}`);
  } catch (error) {
    console.error("SMS delivery failed:", error.message);
    throw httpError("We couldn't send the SMS. Please try again.", 502);
  }
}

/**
 * Create an in-app notification. Notification failures are intentionally isolated
 * from the main transaction so a temporary notification/database problem cannot
 * cause a payment, quote, or job operation to be reported as failed.
 */
export async function createInAppNotification({
  recipientID,
  senderID = null,
  type,
  title,
  message,
  jobID = null,
  quoteID = null,
  escrowID = null,
  metadata = {},
}) {
  if (!recipientID) return null;
  return Notification.create({
    recipientID,
    senderID,
    type,
    title,
    message,
    jobID,
    quoteID,
    escrowID,
    metadata,
  });
}

export async function notifyUser(payload) {
  try {
    return await createInAppNotification(payload);
  } catch (error) {
    console.error("In-app notification failed:", error.message);
    return null;
  }
}

export async function notifyUsers(recipients, payload) {
  const uniqueRecipients = [...new Set(recipients.filter(Boolean).map(String))];
  if (!uniqueRecipients.length) return [];
  try {
    return await Notification.insertMany(
      uniqueRecipients.map((recipientID) => ({ ...payload, recipientID })),
      { ordered: false }
    );
  } catch (error) {
    console.error("Bulk in-app notification failed:", error.message);
    return [];
  }
}

export const send = (channel, to, { subject, text }) =>
  channel === "email" ? sendEmail({ to, subject, text }) : sendSms({ to, text });
