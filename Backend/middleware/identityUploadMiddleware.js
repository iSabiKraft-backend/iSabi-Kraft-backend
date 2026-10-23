import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import multer from "multer";
import { httpError } from "../utils/httpError.js";
import { PRIVATE_ROOT } from "./selfieUploadMiddleware.js";

// NIN/BVN slips are sensitive ID documents. Like selfie frames they go in the PRIVATE directory
// (never served statically); only the admin-only endpoint can read them. As with the other
// uploads, point PRIVATE_DIR at a persistent volume (or swap in encrypted S3) before launch.
export const identityDir = (userId) => path.join(PRIVATE_ROOT, "identity", String(userId));

// Matches the design: "JPG, PNG or PDF (Max 5MB)", front & back of the slip.
const EXTENSIONS = { "image/jpeg": ".jpg", "image/png": ".png", "application/pdf": ".pdf" };
export const MAX_DOC_BYTES = 5 * 1024 * 1024;
export const MAX_DOCS = 2;

// Files are first written to a staging folder; the service moves them into place only after the
// whole batch has passed the signature check, so a bad upload never replaces good documents.
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = path.join(identityDir(req.user.id), "_incoming");
      fs.mkdir(dir, { recursive: true, mode: 0o700 }, (err) => cb(err, dir));
    },
    filename: (_req, file, cb) => cb(null, `${crypto.randomBytes(16).toString("hex")}${EXTENSIONS[file.mimetype]}`),
  }),
  limits: { fileSize: MAX_DOC_BYTES, files: MAX_DOCS },
  fileFilter: (_req, file, cb) =>
    EXTENSIONS[file.mimetype] ? cb(null, true) : cb(httpError("Only JPG, PNG or PDF files are allowed.", 400)),
});

// The mimetype is client-supplied, so also check the real file signature.
const matchesSignature = (mimetype, head) => {
  if (mimetype === "image/jpeg") return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  if (mimetype === "image/png") return head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimetype === "application/pdf") return head.subarray(0, 5).toString() === "%PDF-";
  return false;
};

const discard = (files = []) => Promise.all(files.map((f) => fsp.rm(f.path, { force: true })));

export const uploadDocuments = [
  upload.array("documents", MAX_DOCS),
  async (req, _res, next) => {
    try {
      if (!req.files?.length) throw httpError('Attach your slip in the "documents" field (JPG, PNG or PDF, max 5 MB each).', 400);
      for (const file of req.files) {
        const data = await fsp.readFile(file.path);
        if (!matchesSignature(file.mimetype, data.subarray(0, 12))) {
          await discard(req.files);
          throw httpError(`"${file.originalname?.slice(0, 60) || "File"}" is not a valid ${EXTENSIONS[file.mimetype].slice(1).toUpperCase()}.`, 400);
        }
        file.sha256 = crypto.createHash("sha256").update(data).digest("hex");
      }
      next();
    } catch (error) {
      // multer errors (too large / too many) leave partial files in staging — clean them up too
      if (req.files?.length) await discard(req.files);
      next(error);
    }
  },
];
