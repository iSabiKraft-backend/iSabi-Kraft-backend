import { Resend } from "resend";
import { httpError } from "../utils/httpError.js";

// Email: Resend HTTPS API (RESEND_API_KEY / EMAIL_FROM).
// SMS: Termii (TERMII_API_KEY / TERMII_SENDER_ID / optional TERMII_BASE_URL).
//
// In development, missing providers use a console fallback.
// In production, missing providers return an error.

let resendClient;

const getResendClient = () => {
  if (!process.env.RESEND_API_KEY) return null;

  resendClient ??= new Resend(process.env.RESEND_API_KEY);

  return resendClient;
};

const devFallback = (kind, to, text) => {
  if (process.env.NODE_ENV === "production") {
    throw httpError(`${kind} delivery is not configured on the server.`, 503);
  }

  console.log(`[DEV ${kind}] to ${to}: ${text}`);
};

export async function sendEmail({ to, subject, text }) {
  const resend = getResendClient();

  if (!resend) {
    return devFallback("EMAIL", to, `${subject} — ${text}`);
  }

  if (!process.env.EMAIL_FROM) {
    throw httpError("EMAIL_FROM is not configured on the server.", 503);
  }

  try {
    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to: [to],
      subject,
      text,
    });

    if (error) {
      console.error("Email delivery failed:", error.message);
      throw httpError("We couldn't send the email. Please try again.", 502);
    }

    return data;
  } catch (error) {
    if (error.statusCode) {
      throw error;
    }

    console.error("Email delivery failed:", error.message);
    throw httpError("We couldn't send the email. Please try again.", 502);
  }
}

export async function sendSms({ to, text }) {
  if (!process.env.TERMII_API_KEY) {
    return devFallback("SMS", to, text);
  }

  try {
    const response = await fetch(
      `${process.env.TERMII_BASE_URL || "https://api.ng.termii.com"}/api/sms/send`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: to.replace(/^\+/, ""),
          from: process.env.TERMII_SENDER_ID || "iSabiKraft",
          sms: text,
          type: "plain",
          channel: "generic",
          api_key: process.env.TERMII_API_KEY,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Termii responded ${response.status}`);
    }
  } catch (error) {
    console.error("SMS delivery failed:", error.message);
    throw httpError("We couldn't send the SMS. Please try again.", 502);
  }
}

export const send = (channel, to, { subject, text }) =>
  channel === "email"
    ? sendEmail({ to, subject, text })
    : sendSms({ to, text });

// Notify a user by email or SMS.
// Notification failures do not break the action that triggered them.
export async function notifyUser(user, { subject, text }) {
  try {
    if (user.email && user.emailVerified) {
      return await sendEmail({
        to: user.email,
        subject,
        text,
      });
    }

    if (user.phone && user.phoneVerified) {
      return await sendSms({
        to: user.phone,
        text,
      });
    }

    if (user.email) {
      return await sendEmail({
        to: user.email,
        subject,
        text,
      });
    }

    if (user.phone) {
      return await sendSms({
        to: user.phone,
        text,
      });
    }
  } catch (error) {
    console.error("Notification failed:", error.message);
  }
}