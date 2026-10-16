import Terms from "../models/termsModel.js";
import User from "../models/userModel.js";

// GET /terms — public, shown at signup / before posting a job
export async function getActiveTerms() {
  const active = await Terms.findOne({ isActive: true }).sort({ publishedAt: -1 });

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
  const active = await Terms.findOne({ isActive: true });

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

  await User.updateOne({ _id: userId }, { termsAcceptedVersion: version, termsAcceptedAt: new Date() });
  const user = await User.findById(userId);

  return {
    termsAcceptedVersion: user.termsAcceptedVersion,
    termsAcceptedAt: user.termsAcceptedAt,
  };
}

// POST /terms — admin publishes a new version. Deactivates any previous
// active version so there's only ever one source of truth for the gate.
export async function publishTerms({ version, content }) {
  // Create first (inactive): a duplicate version fails here on the unique
  // index, leaving the currently active terms untouched.
  const terms = await Terms.create({ version, content, isActive: false });

  await Terms.updateMany({ isActive: true, _id: { $ne: terms._id } }, { isActive: false });
  terms.isActive = true;
  await terms.save();
  return terms;
}
