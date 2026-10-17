import 'dotenv/config';
const paystackBaseUrl = process.env.PAYSTACK_BASE_URL || 'https://api.paystack.co';

const paystackRequest = async (path, method = 'GET', body = null) => {
  const response = await fetch(`${paystackBaseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  if (!response.ok || !result.status) {
    const error = new Error(result.message || 'Paystack request failed');
    error.statusCode = response.status || 502;
    throw error;
  }
  return result.data;
}

export {paystackBaseUrl, paystackRequest};