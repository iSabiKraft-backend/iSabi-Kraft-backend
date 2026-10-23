import multer from "multer";
import { httpError } from "../utils/httpError.js";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime", "video/x-matroska"]);
const storage = multer.memoryStorage();

const imageFileFilter = (_req, file, cb) => {
  if (IMAGE_TYPES.has(file.mimetype)) return cb(null, true);
  return cb(httpError("Only JPEG, PNG, and WebP images are allowed.", 400));
};

const mediaFileFilter = (_req, file, cb) => {
  if (IMAGE_TYPES.has(file.mimetype) || VIDEO_TYPES.has(file.mimetype)) return cb(null, true);
  return cb(httpError("Only JPEG, PNG, WebP images and MP4, WebM, MOV, or MKV videos are allowed.", 400));
};

const mediaUpload = multer({
  storage,
  fileFilter: mediaFileFilter,
  limits: { fileSize: 100 * 1024 * 1024, files: 10 },
});

const photoUpload = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
});

/**
 * Single image upload middleware. Existing routes call this with "Avatar" or
 * "image"; normalize labels to the multipart field names expected by clients.
 */
export const uploadCloudinaryImage = (fieldOrLabel = "image") => {
  const field = String(fieldOrLabel).toLowerCase() === "avatar"
    ? "avatar"
    : String(fieldOrLabel).toLowerCase();

  const upload = multer({
    storage,
    fileFilter: imageFileFilter,
    limits: { fileSize: field === "avatar" ? 2 * 1024 * 1024 : 10 * 1024 * 1024, files: 1 },
  }).single(field);

  return [
    upload,
    (req, _res, next) => {
      if (!req.file) return next(httpError(`Attach an image in the "${field}" field.`, 400));
      next();
    },
  ];
};

// Job routes use these multipart field names.
export const uploadMedia = mediaUpload.array("media", 10);
export const uploadPhotos = photoUpload.array("photos", 5);
