import { validWebHookSignature } from "../services/paystackService.js";
import { handlePaystackWebhook } from "../services/escrow.service.js";

const paystackWebhook = async (req, res) => {
  // Always validate the signature before processing the event.
  if (!validWebHookSignature(req)) {
    return res.status(401).json({
      success: false,
      message: "Invalid Paystack webhook signature",
    });
  }

  const { event, data } = req.body;
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
