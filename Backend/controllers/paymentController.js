import { validWebHookSignature } from "../services/paystackService.js";
import { handlePaystackWebhook } from "../services/escrowService.js";

// POST /api/payments/paystack/webhook — body arrives RAW (see app.js)
export const webhook = async (req, res, next) => {
  try {
    if (!validWebHookSignature(req.body, req.headers["x-paystack-signature"])) {
      return res.status(401).json({ success: false, message: "Invalid signature." });
    }

    const { event, data } = JSON.parse(req.body.toString("utf8"));
    await handlePaystackWebhook(event, data);

    // Always 200 once verified so Paystack stops retrying
    return res.sendStatus(200);
  } catch (error) {
    next(error);
  }
};
