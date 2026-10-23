import { configureCloudinary } from "../config/cloudinary.js";

const normalizeUploadResult = (result) => ({
  url: result.secure_url,
  publicId: result.public_id,
  resourceType: result.resource_type || "image",
  format: result.format,
  bytes: result.bytes,
  width: result.width,
  height: result.height,
});

/** Upload a single in-memory file buffer to Cloudinary. */
export const uploadBufferToCloudinary = (
  buffer,
  { folder = "isabikraft", resourceType = "image", publicId } = {}
) => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    const error = new TypeError("A non-empty file buffer is required.");
    error.statusCode = 400;
    return Promise.reject(error);
  }

  const cloudinary = configureCloudinary();

  return new Promise((resolve, reject) => {
    const options = {
      folder,
      resource_type: resourceType,
      overwrite: Boolean(publicId),
      invalidate: true,
    };
    if (publicId) options.public_id = publicId;

    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) return reject(error);
      if (!result?.secure_url || !result?.public_id) {
        return reject(new Error("Cloudinary returned an incomplete upload result."));
      }
      resolve(result);
    });

    stream.on("error", reject);
    stream.end(buffer);
  });
};

/**
 * Upload Multer files from memoryStorage() or diskStorage().
 * Returns the same predictable shape for every upload: url, publicId, resourceType.
 */
export const uploadFilesToCloudinary = async (
  files = [],
  { folder = "isabikraft", resourceType } = {}
) => {
  if (!Array.isArray(files)) {
    throw new TypeError("Files must be supplied as an array.");
  }
  if (files.length === 0) return [];

  const cloudinary = configureCloudinary();
  const uploaded = await Promise.all(
    files.map(async (file) => {
      if (!file || (!file.buffer && !file.path)) {
        throw new TypeError("Each file must contain a Multer buffer or file path.");
      }

      const detectedType = resourceType || (file.mimetype?.startsWith("video/") ? "video" : "image");
      let result;
      if (file.buffer) {
        result = await uploadBufferToCloudinary(file.buffer, {
          folder,
          resourceType: detectedType,
        });
      } else {
        result = await cloudinary.uploader.upload(file.path, {
          folder,
          resource_type: detectedType,
        });
      }

      return normalizeUploadResult(result);
    })
  );

  return uploaded;
};

/** Delete an asset by Cloudinary public ID. */
export const deleteCloudinaryAsset = async (publicId, resourceType = "image") => {
  if (!publicId) return null;
  const cloudinary = configureCloudinary();
  const result = await cloudinary.uploader.destroy(publicId, {
    resource_type: resourceType,
    invalidate: true,
  });

  if (result.result === "not found") {
    // Idempotent deletion: an already-removed asset is not an application failure.
    return result;
  }
  if (result.result !== "ok") {
    const error = new Error(`Cloudinary deletion failed: ${result.result || "unknown result"}`);
    error.statusCode = 502;
    throw error;
  }
  return result;
};

// Backwards-compatible name used by jobService.js.
export const deleteFromCloudinary = deleteCloudinaryAsset;
