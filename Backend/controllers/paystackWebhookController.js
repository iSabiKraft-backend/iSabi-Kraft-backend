import { validWebHookSignature } from "../services/paystackService.js";
import { handlePaystackWebhook } from "../services/escrowService.js";

const paystackWebhook = async (req, res) => {
  const rawBody = req.body;
  const signature = req.headers["x-paystack-signature"];

  // Always validate the signature before processing the event.
  if (!Buffer.isBuffer(rawBody) || !validWebHookSignature(rawBody, signature)) {
    return res.status(401).json({
      success: false,
      message: "Invalid Paystack webhook signature",
    });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return res.status(400).json({
      success: false,
      message: "Invalid webhook payload",
    });
  }

  const { event, data } = payload;
  // Validate event and data
  if (!event || !data) {
    return res.status(400).json({
      success: false,
      message: "Invalid webhook payload",
    });
  }

  try {
    await handlePaystackWebhook(event, data);

    return res.status(200).json({
      success: true,
      message: "Webhook processed",
    });
  } catch (error) {
    console.error(
      "Paystack webhook processing failed:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Webhook processing failed",
    });
  }
};

export { paystackWebhook };
