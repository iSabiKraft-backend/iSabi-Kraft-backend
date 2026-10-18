//Every dispute is tied to a job passport
import Dispute from "../models/dispute.js";
import Job from "../models/job.js";
//import JobPassport from '../models/JobPassport.js';
import User from '../models/userModel.js';
import errorHandler from '../middleware/errorHandler.js';
import asyncHandler from '../utils/asyncHandler.js';
//import { assertFound, assertParticipant } from '../utils/access.js';
//import { requireFields, getPagination, buildMeta } from '../utils/helpers.js';
//import { notify, notifyMany } from '../services/notify.js';
import { 
        fundEscrowAccount,
    releaseMaterial,
    confirmCompletion,
    handlePaystackWebhook
 } from '../services/escrowService.js';



//Create job dispute
const createDispute = asyncHandler(async (req, res) => {
    requireFields(req.body, ['jobId', 'reason', 'description']);

    const job = assertFound(await Job.findById(req.body.jobId), 'Job');
    assertParticipant(job, req.user);

    const passport = assertFound(await JobPassport.findOne({ job: job._id }), 'Job Passport');

    // Only live or recently completed jobs can be disputed
    if (!['active', 'awaiting_confirmation', 'completed'].includes(passport.status)) {
        throw new errorHandler(400, `A ${passport.status} job cannot be disputed`);
    }

    // Completed jobs can be disputed only inside the guarantee period
    if (passport.status === 'completed' && passport.guarantee.expiresAt < new Date()) {
        throw new errorHandler(400, 'The guarantee period for this job has ended');
    }

    // One open dispute at a time
    const existing = await Dispute.findOne({
        passport: passport._id,
        status: { $in: ['open', 'under_review'] },
    });
    if (existing) throw new errorHandler(409, 'A dispute is already open for this job');

    const dispute = await Dispute.create({
        job: job._id,
        passport: passport._id,
        raisedBy: req.user._id,
        reason: req.body.reason,
        description: req.body.description,
        evidence: req.body.evidence || [],
    });

    // Freeze the passport so no more money or work moves until resolved
    passport.statusBeforeDispute = passport.status;
    passport.status = 'disputed';
    passport.dispute = dispute._id;
    await passport.save();


    job.status = 'disputed';
    await job.save();

    // Notify the other party and every admin
    const other = String(job.customer) === String(req.user._id) ? job.artisan : job.customer;
    await notify(other, {
        title: 'Dispute opened',
        message: `A dispute was opened on "${job.service}".`,
        type: 'dispute',
        data: { disputeId: dispute._id, jobId: job._id },
    });
    const admins = await User.find({ role: 'admin' }).select('_id');
    await notifyMany(
        admins.map((a) => a._id),
        {
            title: 'New dispute',
            message: `A dispute needs review on "${job.service}".`,
            type: 'dispute',
            data: { disputeId: dispute._id, jobId: job._id },
        }
    );

    res.status(201).json({ success: true, data: dispute });
});

// GET /disputes?status
const disputeStatus = asyncHandler(async (req, res) => {
    const { page, limit, skip } = getPagination(req.query);

    // Find passports the user belongs to, then their disputes
    const passportIds = await JobPassport.find({
        $or: [{ customer: req.user._id }, { artisan: req.user._id }],
    }).distinct('_id');

    const filter = { passport: { $in: passportIds } };
    if (req.query.status !== undefined) {
        const status = req.query.status;
        const allowedStatuses = ['open', 'under_review', 'resolved', 'closed'];

        if (typeof status !== 'string' || !allowedStatuses.includes(status)) {
            throw new errorHandler(400, 'Invalid dispute status');
        }

        filter.status = { $eq: status };
    }

    const [items, total] = await Promise.all([
        Dispute.find(filter)
            .populate('job', 'service')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit),
        Dispute.countDocuments(filter),
    ]);
    res.json({ success: true, data: items, meta: buildMeta(page, limit, total) });
});

// GET dispute
const getDispute = asyncHandler(async (req, res) => {
    const dispute = assertFound(
        await Dispute.findById(req.params.id)
            .populate('job', 'service customer artisan')
            .populate('raisedBy', 'name role'),
        'Dispute'
    );
    assertParticipant(dispute.job, req.user);
    res.json({ success: true, data: dispute });
});

// Create dispute evidence
// Either party can add more evidence while the dispute is still open 
const addDisputeEvidence = asyncHandler(async (req, res) => {
    const { evidence } = req.body;
    if (!Array.isArray(evidence) || !evidence.length) 
        throw new errorHandler(400, 'Provide evidence items');

        const dispute = assertFound(await Dispute.findById(req.params.id).populate('job'), 'Dispute');
        assertParticipant(dispute.job, req.user);
        if (!['open', 'under_review'].includes(dispute.status)) {
            throw new errorHandler(400, 'This dispute is closed');
        }

    dispute.evidence.push(...evidence);
    await dispute.save();
    res.json({ success: true, data: dispute });
});

// GET /disputes/:id/status
const getDisputeStatus = asyncHandler(async (req, res) => {
    const dispute = assertFound(await Dispute.findById(req.params.id), 'Dispute');
    assertParticipant(dispute.job, req.user);
    res.json({ success: true, data: { status: dispute.status } });
});




export default {
    createDispute,
    getDispute,
    disputeStatus,
    addDisputeEvidence
}

