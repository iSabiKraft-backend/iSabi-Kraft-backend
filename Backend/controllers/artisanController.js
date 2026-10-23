import fs from "node:fs";
import * as artisanService from "../services/artisanService.js";


export const search = async (req, res, next) => {
  try {
    const result = await artisanService.searchArtisans(req.query);
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

export const getById = async (req, res, next) => {
  try {
    const artisan = await artisanService.getArtisanById(req.params.id);
    return res.status(200).json({ success: true, data: artisan });
  } catch (error) {
    next(error);
  }
};

// PUT /artisans/me
export const upsertMyProfile = async (req, res, next) => {
  try {
    const profile = await artisanService.upsertMyProfile(req.user.id, req.body);

    return res.status(200).json({
      success: true,
      message: "Artisan profile saved successfully.",
      data: profile,
    });
  } catch (error) {
    next(error);
  }
};

// POST /artisans/me/portfolio
export const addPortfolioItem = async (req, res, next) => {
  try {
    const item = await artisanService.addPortfolioItem(req.user.id, req.body);

    return res.status(201).json({
      success: true,
      message: "Portfolio item added successfully.",
      data: item,
    });
  } catch (error) {
    next(error);
  }
};

// POST /artisans/me/verification
export const submitVerification = async (req, res, next) => {
  try {
    const result = await artisanService.submitVerification(req.user.id, req.body);

    return res.status(202).json({
      success: true,
      message: "Verification submitted for admin review.",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// GET /artisans/verification-queue — admin only
export const listPendingVerifications = async (req, res, next) => {
  try {
    const items = await artisanService.listPendingVerifications();
    return res.status(200).json({ success: true, data: items });
  } catch (error) {
    next(error);
  }
};

// PATCH /artisans/:id/verification — admin only
export const reviewVerification = async (req, res, next) => {
  try {
    const profile = await artisanService.reviewVerification(req.params.id, req.user.id, req.body);

    return res.status(200).json({
      success: true,
      message: "Verification decision recorded.",
      data: profile,
    });
  } catch (error) {
    next(error);
  }
};

// GET /artisans/options — fills the Trade Category / Experience Level dropdowns and screen limits
export const options = (_req, res) => res.status(200).json({ success: true, data: artisanService.getOptions() });

// GET /artisans/me — the artisan's own profile (includes the private residential address)
export const getMyProfile = async (req, res, next) => {
  try {
    return res.status(200).json({ success: true, data: await artisanService.getMyProfile(req.user.id) });
  } catch (error) {
    next(error);
  }
};

// PUT /artisans/me/profile — "Complete Your Profile"
export const completeProfile = async (req, res, next) => {
  try {
    const profile = await artisanService.completeArtisanProfile(req.user.id, req.body);
    return res.status(200).json({ success: true, message: "Profile saved.", data: profile });
  } catch (error) {
    next(error);
  }
};

// POST /artisans/me/verification/documents — NIN/BVN slip (multipart, field "documents", up to 2 files)
export const uploadDocuments = async (req, res, next) => {
  try {
    const result = await artisanService.uploadIdentityDocuments(req.user.id, req.files);
    return res.status(201).json({ success: true, message: "Documents uploaded.", data: result });
  } catch (error) {
    next(error);
  }
};

// GET /artisans/me/onboarding — where the artisan is in sign-up + the "Under Review" timeline
export const onboardingStatus = async (req, res, next) => {
  try {
    return res.status(200).json({ success: true, data: await artisanService.getOnboardingStatus(req.user.id) });
  } catch (error) {
    next(error);
  }
};

// GET /artisans/:id/verification/documents/:index — admin only; streams one ID document (never cached)
export const documentFile = async (req, res, next) => {
  try {
    const { file, mimeType } = await artisanService.getDocumentFile(req.params.id, req.params.index);
    console.info(`[identity] admin ${req.user.id} viewed document ${req.params.index} of artisan ${req.params.id}`);
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", "inline");
    const stream = fs.createReadStream(file);
    stream.on("error", () => (res.headersSent ? res.end() : res.status(404).json({ success: false, message: "Document no longer available." })));
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
};
