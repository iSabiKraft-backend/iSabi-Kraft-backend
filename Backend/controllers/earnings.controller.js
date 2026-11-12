import Escrow from "../models/escrow.js";
import EscrowTransaction from "../models/escrowTransaction.js";
import Job from "../models/job.js";
import { httpError } from "../utils/httpError.js";
import { objectId } from "../utils/validate.js";

const PAYOUT_TYPES = ["material_payment", "balance_release"];
const LABELS = {
  material_payment: "Materials payment",
  balance_release: "Job payment",
};
const ACTIVE = ["payment_confirmed", "material_payment_made", "disputed"];

const refOf = (id) => `JK-${String(id).slice(-5).toUpperCase()}`;
const shortName = (full) => {
  const p = String(full || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!p.length) return "Customer";
  return p.length === 1 ? p[0] : `${p[0]} ${p[p.length - 1][0].toUpperCase()}.`;
};
const when = (t) => t.paidAt || t.createdAt;

const loadContext = async (artisanId) => {
  const escrows = await Escrow.find({ artisanID: artisanId }).lean();
  const jobs = await Job.find(
    { _id: { $in: escrows.map((e) => e.jobID) } },
    "title category customerID agreedAmount completionMarkedAt createdAt acceptedQuoteID quotes",
  )
    .populate("customerID", "fullName")
    .lean();
  return {
    escrows,
    escrowById: new Map(escrows.map((e) => [String(e._id), e])),
    jobById: new Map(jobs.map((j) => [String(j._id), j])),
  };
};

const shapeTx = (t, ctx) => {
  const escrow = ctx.escrowById.get(String(t.escrowID));
  const job = escrow && ctx.jobById.get(String(escrow.jobID));
  return {
    id: String(t._id),
    type: t.transactionType,
    label: LABELS[t.transactionType] || "Payment",
    amount: t.amount,
    status: t.status,
    date: when(t),
    reference: t.reference,
    jobId: job ? String(job._id) : null,
    jobTitle: job?.title || "Job",
    jobRef: job ? refOf(job._id) : "",
    customerName: shortName(job?.customerID?.fullName),
  };
};

const sum = (list) => list.reduce((n, x) => n + x, 0);

export const summary = async (req, res) => {
  const ctx = await loadContext(req.user._id);
  const txs = await EscrowTransaction.find({
    escrowID: { $in: ctx.escrows.map((e) => e._id) },
    transactionType: { $in: PAYOUT_TYPES },
  })
    .sort({ createdAt: -1 })
    .lean();

  const paid = txs.filter((t) => t.status === "completed");
  const totalEarned = sum(paid.map((t) => t.amount));
  const sending = sum(
    txs.filter((t) => t.status === "pending").map((t) => t.amount),
  );

  const paidByEscrow = new Map();
  paid.forEach((t) =>
    paidByEscrow.set(
      String(t.escrowID),
      (paidByEscrow.get(String(t.escrowID)) || 0) + t.amount,
    ),
  );
  const inEscrow = sum(
    ctx.escrows
      .filter((e) => ACTIVE.includes(e.status))
      .map((e) =>
        Math.max(0, e.totalAmount - (paidByEscrow.get(String(e._id)) || 0)),
      ),
  );

  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return {
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: d.toLocaleString("en-NG", { month: "short" }),
      amount: 0,
    };
  });
  paid.forEach((t) => {
    const d = new Date(when(t));
    const m = months.find(
      (x) => x.key === `${d.getFullYear()}-${d.getMonth()}`,
    );
    if (m) m.amount += t.amount;
  });

  res.json({
    summary: {
      totalEarned,
      thisMonth: months[5].amount,
      inEscrow,
      sending,
      jobsCompleted: ctx.escrows.filter((e) => e.status === "balance_released")
        .length,
    },
    monthly: months.map(({ label, amount }) => ({ label, amount })),
    recent: txs.slice(0, 5).map((t) => shapeTx(t, ctx)),
  });
};


  // Accept only scalar strings from query parameters.
  const requestedType =
    typeof req.query.type === "string" ? req.query.type : null;

  const requestedStatus =
    typeof req.query.status === "string" ? req.query.status : null;

  const allowedStatuses = ["pending", "completed", "failed"];

  const filter = {
    escrowID: { $in: ctx.escrows.map((e) => e._id) },
    transactionType: { $in: PAYOUT_TYPES },
  };

  // Validate against server-controlled allowlists.
  if (requestedType && PAYOUT_TYPES.includes(requestedType)) {
    filter.transactionType = { $eq: requestedType };
  }

  if (requestedStatus && allowedStatuses.includes(requestedStatus)) {
    filter.status = { $eq: requestedStatus };
  }


  const all = (
    await EscrowTransaction.find(filter)
      .sort({ createdAt: -1 })
      .limit(500)
      .lean()
  ).map((t) => shapeTx(t, ctx));
  const q = String(req.query.q || "")
    .trim()
    .toLowerCase();
  const rows = q
    ? all.filter((t) =>
        `${t.jobTitle} ${t.jobRef} ${t.customerName} ${t.reference}`
          .toLowerCase()
          .includes(q),
      )
    : all;

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  res.json({
    transactions: rows.slice((page - 1) * limit, page * limit),
    total: rows.length,
    totalAmount: sum(
      rows.filter((t) => t.status === "completed").map((t) => t.amount),
    ),
    page,
    hasMore: page * limit < rows.length,
  });

export const transaction = async (req, res) => {
  const t = await EscrowTransaction.findById(
    objectId(req.params.id, "transaction id"),
  ).lean();
  const ctx = await loadContext(req.user._id);
  const escrow = t && ctx.escrowById.get(String(t.escrowID));
  if (!t || !escrow || !PAYOUT_TYPES.includes(t.transactionType))
    throw httpError(404, "Transaction not found");

  const job = ctx.jobById.get(String(escrow.jobID));
  const quote = job?.quotes?.find(
    (q) => String(q._id) === String(job.acceptedQuoteID),
  );
  const shaped = shapeTx(t, ctx);

  const siblings = await EscrowTransaction.find({
    escrowID: escrow._id,
    transactionType: { $in: PAYOUT_TYPES },
  })
    .sort({ createdAt: 1 })
    .lean();
  const timeline = [
    {
      label: "Customer paid into escrow",
      date: escrow.createdAt,
      done: escrow.status !== "pending",
    },
    ...siblings.map((s) => ({
      label: `${LABELS[s.transactionType]} ${s.status === "completed" ? "sent to your bank" : s.status === "failed" ? "failed" : "on its way"}`,
      date: when(s),
      done: s.status === "completed",
    })),
  ];

  res.json({
    transaction: {
      ...shaped,
      jobTotal: escrow.totalAmount,
      breakdown: quote
        ? {
            labour: quote.labour,
            materials: quote.materials,
            additional: quote.additional,
          }
        : null,
      bank: req.user.bank
        ? {
            bankName: req.user.bank.bankName,
            accountLast4: req.user.bank.accountLast4,
          }
        : null,
      timeline,
    },
  });
};
