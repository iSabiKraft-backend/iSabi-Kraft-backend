const paystackBaseUrl =
  process.env.PAYSTACK_BASE_URL || "https://api.paystack.co";

const paystackRequest = async (
  path,
  method = "GET",
  body = null,
  { raw = false } = {},
) => {
  let response;
  try {
    response = await fetch(`${paystackBaseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    const error = new Error("Could not reach Paystack");
    error.statusCode = 502;
    error.network = true;
    throw error;
  }

  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.status) {
    const error = new Error(result.message || "Paystack request failed");
    error.paystackStatus = response.status;

    error.statusCode = [400, 404, 422].includes(response.status) ? 400 : 502;
    throw error;
  }
  return raw ? result : result.data;
};

export { paystackBaseUrl, paystackRequest };
