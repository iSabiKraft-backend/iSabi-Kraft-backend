import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import multer from "multer";
import Job from "../models/jobModel.js";
import { PRIVATE_ROOT } from "./selfieUploadMiddleware.js";
import { httpError } from "../utils/httpError.js";

const EXTENSIONS = Object.freeze({
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
});
const MAX_FILES = 5;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

export const completionEvidenceDir = (jobId) =>
  path.join(PRIVATE_ROOT, "job-completion", String(jobId));

export const looksLikeSupportedImage = (buffer, mimeType) => {
  if (mimeType === "image/jpeg") return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === "image/png") {
    return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (mimeType === "image/webp") {
    return buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP";
  }
  return false;
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, callback) => {
      const directory = completionEvidenceDir(req.params.id);
      fs.mkdir(directory, { recursive: true, mode: 0o700 }, (error) => callback(error, directory));
    },
    filename: (_req, file, callback) =>
      callback(null, `${crypto.randomBytes(16).toString("hex")}${EXTENSIONS[file.mimetype]}`),
  }),
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES, fields: 1, parts: MAX_FILES + 1 },
  fileFilter: (_req, file, callback) =>
    EXTENSIONS[file.mimetype]
      ? callback(null, true)
      : callback(httpError("Only JPEG, PNG, or WebP evidence images are allowed.", 400)),
});

// Check authorization and lifecycle before Multer writes any bytes to disk.
export const requireCompletionEvidenceAccess = async (req, _res, next) => {
  try {
    const job = await Job.findById(req.params.id).select("artisanID status completionStatus");
    if (!job) throw httpError("Job not found", 404);
    if (String(job.artisanID) !== String(req.user.id)) {
      throw httpError("Only the assigned artisan can upload completion evidence", 403);
    }
    if (job.status !== "in_progress" || job.completionStatus !== "pending") {
      throw httpError("The job is not ready for completion evidence", 409);
    }
    next();
  } catch (error) {
    next(error);
  }
};

const removeUploadedFiles = async (files = []) => {
  await Promise.all(files.map((file) => fsp.rm(file.path, { force: true }).catch(() => {})));
};

export const uploadCompletionEvidence = [
  (req, res, next) => upload.array("evidence", MAX_FILES)(req, res, (error) => {
    if (error) {
      const directory = completionEvidenceDir(req.params.id);
      fsp.rm(directory, { recursive: true, force: true })
        .catch(() => {})
        .finally(() => next(error));
      return;
    }
    next();
  }),
  async (req, _res, next) => {
    const files = req.files ?? [];
    try {
      if (files.length === 0) throw httpError('Attach one or more images using the "evidence" field.', 400);
      if (req.body?.note !== undefined && (typeof req.body.note !== "string" || req.body.note.length > 1000)) {
        throw httpError("Completion note must be text of at most 1000 characters.", 400);
      }
      for (const file of files) {
        const handle = await fsp.open(file.path, "r");
        const head = Buffer.alloc(12);
        try {
          await handle.read(head, 0, 12, 0);
        } finally {
          await handle.close();
        }
        if (!looksLikeSupportedImage(head, file.mimetype)) {
          throw httpError("An uploaded evidence file is not a valid JPEG, PNG, or WebP image.", 400);
        }
        file.sha256 = crypto.createHash("sha256").update(await fsp.readFile(file.path)).digest("hex");
      }
      next();
    } catch (error) {
      await removeUploadedFiles(files);
      next(error);
    }
  },
];
