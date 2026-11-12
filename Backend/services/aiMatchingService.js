const AI_SERVICE_URL = String(process.env.AI_SERVICE_URL || "").replace(
  /\/+$/,
  "",
);
const AI_SERVICE_API_KEY = process.env.AI_SERVICE_API_KEY || "";

export async function requestArtisanMatches(job, artisans) {
  if (!AI_SERVICE_URL || !AI_SERVICE_API_KEY) {
    console.error("AI MATCHING CONFIGURATION ERROR:", {
      urlConfigured: Boolean(AI_SERVICE_URL),
      apiKeyConfigured: Boolean(AI_SERVICE_API_KEY),
    });

    const error = new Error("AI recommendations are not configured.");
    error.status = 503;
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  const endpoint = `${AI_SERVICE_URL}/match`;

  try {
    console.log("Calling artisan matching service:", endpoint);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-API-Key": AI_SERVICE_API_KEY,
      },
      body: JSON.stringify({
        ...job,
        artisans,
      }),
      signal: controller.signal,
    });

    const responseText = await response.text();

    let payload = {};

    try {
      payload = responseText ? JSON.parse(responseText) : {};
    } catch {
      console.error(
        "AI SERVICE RETURNED INVALID JSON:",
        responseText.slice(0, 500),
      );
    }

    console.log("AI SERVICE RESPONSE:", {
      status: response.status,
      ok: response.ok,
    });

    if (!response.ok) {
      console.error("AI MATCHING HTTP ERROR:", {
        status: response.status,
        response: payload,
      });

      const error = new Error(
        payload.detail ||
          payload.message ||
          "AI matching service returned an error.",
      );

      error.status = response.status === 400 ? 400 : 503;
      throw error;
    }

    return payload;
  } catch (error) {
    if (error.status) {
      throw error;
    }

    console.error("AI MATCHING CONNECTION FAILURE:", {
      message: error.message,
      cause: error.cause?.message,
      code: error.cause?.code,
      name: error.name,
      endpoint,
    });

    if (error.name === "AbortError") {
      const timeoutError = new Error(
        "Artisan recommendations timed out. Please try again.",
      );
      timeoutError.status = 504;
      throw timeoutError;
    }

    const serviceError = new Error(
      "Could not reach the artisan recommendation service.",
    );

    serviceError.status = 503;
    throw serviceError;
  } finally {
    clearTimeout(timeout);
  }
}
