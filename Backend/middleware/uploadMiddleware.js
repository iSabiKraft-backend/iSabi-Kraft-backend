import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import multer from "multer";
import { httpError } from "../utils/httpError.js";

// Profile photos are saved on local disk under ./uploads/avatars and served at /uploads.
// NOTE: many hosts (Render, Railway, Heroku...) wipe local disk on every deploy — before
// going live, swap this for Cloudinary/S3 (only setAvatar in userService.js needs to change).
export const UPLOAD_ROOT = process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.resolve("uploads");
const AVATAR_DIR = path.join(UPLOAD_ROOT, "avatars");
fs.mkdirSync(AVATAR_DIR, { recursive: true });

const EXTENSIONS = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };

const upload = multer({
  storage: multer.diskStorage({
    destination: AVATAR_DIR,
    // random name; the extension comes from the checked mimetype, never from the client's filename
    filename: (_req, file, cb) => cb(null, `${crypto.randomBytes(16).toString("hex")}${EXTENSIONS[file.mimetype]}`),
  }),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) =>
    EXTENSIONS[file.mimetype] ? cb(null, true) : cb(httpError("Only JPEG, PNG or WebP images are allowed.", 400)),
});

// The mimetype is client-supplied, so also check the file's real signature.
const looksLikeImage = (buf) =>
  (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) || // JPEG
  buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) || // PNG
  (buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP"); // WebP

export const uploadAvatar = [
  upload.single("avatar"),
  async (req, _res, next) => {
    try {
      if (!req.file) throw httpError('Attach an image in the "avatar" field.', 400);
      const handle = await fsp.open(req.file.path, "r");
      const head = Buffer.alloc(12);
      await handle.read(head, 0, 12, 0);
      await handle.close();
      if (!looksLikeImage(head)) {
        await fsp.rm(req.file.path, { force: true });
        throw httpError("That file is not a valid image.", 400);
      }
      next();
    } catch (error) {
      next(error);
    }
  },
];
