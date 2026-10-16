const paystackBaseUrl =
    process.env.PAYSTACK_BASE_URL || "https://api.paystack.co";

const paystackRequest = async (
    path,
    method = "GET",
    body = null
) => {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;

    if (!secretKey) {
        throw new Error("PAYSTACK_SECRET_KEY is not configured");
    }

    const response = await fetch(`${paystackBaseUrl}${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${secretKey}`,
            "Content-Type": "application/json",
        },
        ...(body !== null
            ? { body: JSON.stringify(body) }
            : {}),
    });

    let result;

    try {
        result = await response.json();
    } catch {
        throw new Error("Paystack returned an invalid JSON response");
    }

    if (!response.ok || result.status !== true) {
        const error = new Error(
            result.message || `Paystack request failed (${response.status})`
        );

        // Preserve the response details for your service error handlers.
        error.response = {
            status: response.status,
            data: result,
        };

        throw error;
    }

    return result;
};

export default paystackRequest;
