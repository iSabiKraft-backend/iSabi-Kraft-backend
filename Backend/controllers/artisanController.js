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
