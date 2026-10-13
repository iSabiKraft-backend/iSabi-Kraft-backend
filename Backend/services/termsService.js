import Terms from "../models/termsModel.js";
import User from "../models/userModel.js";

// GET /terms — public, shown at signup / before posting a job
export async function getActiveTerms() {
  const active = await Terms.findOne({ where: { isActive: true }, order: [["publishedAt", "DESC"]] });

  if (!active) {
    const error = new Error("No terms have been published yet.");
    error.statusCode = 404;
    throw error;
  }

  return active;
}

// POST /terms/accept — authenticated user accepts the currently active
// version. Dev 2 / Dev 3 gate their flows on this via requireTermsAccepted.
export async function acceptTerms(userId, version) {
  const active = await Terms.findOne({ where: { isActive: true } });

  if (!active) {
    const error = new Error("No terms have been published yet.");
    error.statusCode = 404;
    throw error;
  }

  if (active.version !== version) {
    const error = new Error(
      `The current terms version is ${active.version}; please re-fetch and accept that version.`
    );
    error.statusCode = 409;
    throw error;
  }

  const user = await User.findByPk(userId);
  await user.update({ termsAcceptedVersion: version, termsAcceptedAt: new Date() });

  return {
    termsAcceptedVersion: user.termsAcceptedVersion,
    termsAcceptedAt: user.termsAcceptedAt,
  };
}

// POST /terms — admin publishes a new version. Deactivates any previous
// active version so there's only ever one source of truth for the gate.
export async function publishTerms({ version, content }) {
  await Terms.update({ isActive: false }, { where: { isActive: true } });
  return await Terms.create({ version, content, isActive: true });
}
