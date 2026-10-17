import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import multer from "multer";
import { httpError } from "../utils/httpError.js";

// Selfie frames are biometric data. They go in a PRIVATE directory that is NOT served statically
// (unlike profile photos under /uploads) — the only way to read one is the admin-only endpoint.
// As with avatars, local disk is wiped by many hosts on deploy: for production point PRIVATE_DIR
// at a persistent volume or swap the storage for an encrypted S3 bucket.
export const PRIVATE_ROOT = process.env.PRIVATE_DIR ? path.resolve(process.env.PRIVATE_DIR) : path.resolve("private");
export const selfieDir = (sessionId) => path.join(PRIVATE_ROOT, "selfies", String(sessionId));

const EXTENSIONS = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
const MAX_BYTES = 3 * 1024 * 1024;

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = selfieDir(req.params.id);
      fs.mkdir(dir, { recursive: true, mode: 0o700 }, (err) => cb(err, dir));
    },
    filename: (_req, file, cb) => cb(null, `${crypto.randomBytes(16).toString("hex")}${EXTENSIONS[file.mimetype]}`),
  }),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) =>
    EXTENSIONS[file.mimetype] ? cb(null, true) : cb(httpError("Only JPEG, PNG or WebP frames are allowed.", 400)),
});

// The mimetype is client-supplied, so also check the real file signature.
const looksLikeImage = (buf) =>
  (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) ||
  buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ||
  (buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP");

export const uploadFrame = [
  upload.single("frame"),
  async (req, _res, next) => {
    try {
      if (!req.file) throw httpError('Attach the camera frame in the "frame" field.', 400);
      const data = await fsp.readFile(req.file.path);
      if (!looksLikeImage(data.subarray(0, 12))) {
        await fsp.rm(req.file.path, { force: true });
        throw httpError("That file is not a valid image.", 400);
      }
      req.file.sha256 = crypto.createHash("sha256").update(data).digest("hex");
      next();
    } catch (error) {
      next(error);
    }
  },
];
