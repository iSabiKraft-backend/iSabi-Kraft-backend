import Escrow from "../models/escrow.js";
import EscrowTransaction from "../models/escrowTransaction.js";
import * as escrowService from "../services/escrowService.js";
import { httpError } from "../utils/httpError.js";
import { objectId, sameId, text } from "../utils/validate.js";

export const getEscrow = async (req, res) => {
  const escrow = await Escrow.findById(objectId(req.params.id, "escrow id"));
  const allowed = escrow && (req.role === "admin" || sameId(escrow.customerID, req.user._id) || sameId(escrow.artisanID, req.user._id));
  if (!allowed) throw httpError(404, "Escrow not found");
  const transactions = await EscrowTransaction.find({ escrowID: escrow._id }).sort({ createdAt: 1 });
  res.json({ escrow, transactions });
};

export const requestMaterialApproval = async (req, res) => {
  const note = text(req.body.note, {
    label: "Material request note",
    max: 1000,
  });
  const evidenceUrls = Array.isArray(req.body.evidenceUrls)
    ? req.body.evidenceUrls
        .filter((url) => typeof url === "string" && /^https:\/\//i.test(url))
        .slice(0, 10)
    : [];

  const escrow = await escrowService.requestMaterialApproval(
    objectId(req.params.id, "escrow id"),
    req.user,
    note,
    evidenceUrls,
  );
  res.status(202).json({
    message: "Material fee request submitted for admin review",
    escrow,
  });
};

export const markCompleted = async (req, res) => {
  const note = text(req.body.completionNote, { label: "Completion note", max: 1000, required: false });
  const photos = Array.isArray(req.body.photos) ? req.body.photos.filter((u) => /^https:\/\//.test(String(u))).slice(0, 10) : [];
  const escrow = await escrowService.markCompleted(objectId(req.params.id, "escrow id"), req.user, note, photos);
  res.json({ escrow });
};

export const confirmCompletion = async (req, res) => {
  const escrow = await escrowService.confirmCompletion(objectId(req.params.id, "escrow id"), req.user);
  res.json({ escrow });
};
