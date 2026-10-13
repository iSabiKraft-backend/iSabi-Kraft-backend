import * as termsService from "../services/termsService.js";

export const getActiveTerms = async (req, res, next) => {
  try {
    const terms = await termsService.getActiveTerms();
    return res.status(200).json({ success: true, data: terms });
  } catch (error) {
    next(error);
  }
};

export const acceptTerms = async (req, res, next) => {
  try {
    const result = await termsService.acceptTerms(req.user.id, req.body.version);

    return res.status(200).json({
      success: true,
      message: "Terms accepted.",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const publishTerms = async (req, res, next) => {
  try {
    const terms = await termsService.publishTerms(req.body);

    return res.status(201).json({
      success: true,
      message: "New terms version published.",
      data: terms,
    });
  } catch (error) {
    next(error);
  }
};
