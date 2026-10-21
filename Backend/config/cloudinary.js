import "./env.js";
import { v2 as cloudinary } from "cloudinary";

let configured = false;

/** Configure the shared Cloudinary SDK client once credentials are available. */
export const configureCloudinary = () => {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  const missing = Object.entries({
    CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET,
  })
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length) {
    const error = new Error(`Missing Cloudinary environment variables: ${missing.join(", ")}`);
    error.statusCode = 500;
    throw error;
  }

  if (!configured) {
    cloudinary.config({
      cloud_name: CLOUDINARY_CLOUD_NAME,
      api_key: CLOUDINARY_API_KEY,
      api_secret: CLOUDINARY_API_SECRET,
      secure: true,
    });
    configured = true;
  }

  // Important: callers need the configured client to access cloudinary.uploader.
  return cloudinary;
};

export default cloudinary;
