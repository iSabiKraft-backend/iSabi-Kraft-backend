import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  completionEvidenceDir,
  looksLikeSupportedImage,
} from "../Backend/middleware/completionEvidenceUploadMiddleware.js";

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const webp = Buffer.from("RIFF0000WEBPdata");

test("completion upload accepts supported image signatures only for their matching MIME types", () => {
  assert.equal(looksLikeSupportedImage(jpeg, "image/jpeg"), true);
  assert.equal(looksLikeSupportedImage(png, "image/png"), true);
  assert.equal(looksLikeSupportedImage(webp, "image/webp"), true);
  assert.equal(looksLikeSupportedImage(jpeg, "image/png"), false);
  assert.equal(looksLikeSupportedImage(Buffer.from("not an image"), "image/jpeg"), false);
  assert.equal(looksLikeSupportedImage(png, "image/svg+xml"), false);
});

test("completion evidence is stored in a job-specific private directory", () => {
  const directory = completionEvidenceDir("job-test-id");
  assert.equal(path.basename(directory), "job-test-id");
  assert.equal(path.basename(path.dirname(directory)), "job-completion");
  assert.equal(directory.includes(`${path.sep}uploads${path.sep}`), false);
});
