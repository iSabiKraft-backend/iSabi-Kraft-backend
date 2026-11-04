
import { timingSafeEqual } from "node:crypto";
import { httpError } from "../utils/httpError.js";

export const requireServiceApiKey = (req, _res, next) => {
  const expected = process.env.AI_MATCHING_API_KEY;
  const provided = req.get("X-API-Key");

  if (!expected || expected.length < 32) {
    return next(
      httpError(503, "AI matching integration is not configured")
    );
  }

  if (typeof provided !== "string" || !provided.length) {
    return next(httpError(401, "Missing service API key"));
  }

  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(provided, "utf8");

  if (
    expectedBuffer.length !== providedBuffer.length ||
    !timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    return next(httpError(401, "Invalid service API key"));
  }

  req.service = "ai-matching";
  next();
};
