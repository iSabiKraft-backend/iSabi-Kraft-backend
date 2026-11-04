import Dispute from "../models/dispute.js";
import Escrow from "../models/escrow.js";
import { openDispute } from "../services/escrowService.js";
import { httpError } from "../utils/httpError.js";
import { objectId, sameId, text } from "../utils/validate.js";

const cleanEvidence = (items) =>
  (Array.isArray(items) ? items : [])
    .filter((e) => /^https:\/\//.test(String(e?.url)))
    .slice(0, 10)
    .map((e) => ({ url: String(e.url), note: e.note ? String(e.note).slice(0, 500) : undefined }));

const loadForParticipant = async (id, user, role) => {
  const dispute = await Dispute.findById(objectId(id, "dispute id"));
  if (!dispute) throw httpError(404, "Dispute not found");
  if (role === "admin") return dispute;
  const escrow = await Escrow.findById(dispute.escrowID);
  if (!escrow || (!sameId(escrow.customerID, user._id) && !sameId(escrow.artisanID, user._id))) {
    throw httpError(404, "Dispute not found");
  }
  return dispute;
};

export const create = async (req, res) => {
  const reason = text(req.body.reason, { label: "Reason", min: 10, max: 2000 });
  const dispute = await openDispute(objectId(req.body.escrowId, "escrow id"), req.user, reason, cleanEvidence(req.body.evidence));
  res.status(201).json({ dispute });
};

export const list = async (req, res) => {
  let filter = {};
  if (req.role !== "admin") {
    const mine = await Escrow.find({ $or: [{ customerID: req.user._id }, { artisanID: req.user._id }] }).select("_id");
    filter = { escrowID: { $in: mine.map((e) => e._id) } };
  }
  if (req.query.status) filter.status = String(req.query.status);
  res.json({ disputes: await Dispute.find(filter).sort({ createdAt: -1 }).limit(50) });
};

export const get = async (req, res) => res.json({ dispute: await loadForParticipant(req.params.id, req.user, req.role) });

export const respond = async (req, res) => {
  const dispute = await loadForParticipant(req.params.id, req.user, req.role);
  if (dispute.status !== "open") throw httpError(409, "This dispute is already resolved");
  if (sameId(dispute.raisedBy, req.user._id)) throw httpError(403, "You raised this dispute. Add evidence instead");
  if (dispute.response?.text) throw httpError(409, "You have already responded to this dispute");
  dispute.response = { text: text(req.body.response, { label: "Response", min: 5, max: 2000 }), respondedBy: req.user._id, respondedAt: new Date() };
  const evidence = cleanEvidence(req.body.evidence);
  if (evidence.length) dispute.evidence.push(...evidence.map((e) => ({ ...e, addedBy: req.user._id })));
  await dispute.save();
  res.json({ dispute });
};

export const addEvidence = async (req, res) => {
  const dispute = await loadForParticipant(req.params.id, req.user, req.role);
  if (dispute.status !== "open") throw httpError(409, "This dispute is already resolved");
  const evidence = cleanEvidence(req.body.evidence);
  if (!evidence.length) throw httpError(400, "Add at least one https evidence link");
  dispute.evidence.push(...evidence.map((e) => ({ ...e, addedBy: req.user._id })));
  await dispute.save();
  res.json({ dispute });
};
