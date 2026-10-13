import Terms from "../models/termsModel.js";
import User from "../models/userModel.js";


// Must run after authenticateUser. Checks against the currently active
export const requireTermsAccepted = async (req, res, next) => {
  try {
    const active = await Terms.findOne({ where: { isActive: true } });
    if (!active) return next(); // no terms published yet — don't block in that edge case

    const user = await User.findByPk(req.user.id, { attributes: ["termsAcceptedVersion"] });

    if (!user || user.termsAcceptedVersion !== active.version) {
      return res.status(403).json({
        success: false,
        message: "You must accept the current Terms & Conditions before continuing.",
      });
    }

    next();
  } catch (error) {
    next(error);
  }
};
