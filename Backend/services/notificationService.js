export const sendVerificationEmail = async ({ to, name, status, message }) => {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL || !to) {
    return { sent: false, reason: "Email notifications are not configured" };
  }
  const labels = {
    approved: "Your iSabiKraft artisan verification is approved",
    rejected: "Your iSabiKraft artisan verification needs attention",
    info_requested: "More information is needed for your iSabiKraft verification",
  };
  const subject = labels[status] || "Update to your iSabiKraft verification";
  const safeName = String(name || "Artisan").replace(/[<>]/g, "");
  const safeMessage = String(message || "").replace(/[<>]/g, "");
  const html = `<p>Hello ${safeName},</p><p>${subject}.</p>${safeMessage ? `<p>${safeMessage}</p>` : ""}<p>Please sign in to your iSabiKraft account to view the update.</p>`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL,
      to: [to],
      subject,
      html,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Email provider returned ${response.status}: ${detail.slice(0, 300)}`);
  }
  return { sent: true };
};
