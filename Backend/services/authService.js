import User from "../models/userModel.js";
import Terms from "../models/termsModel.js";
import { hashPassword, comparePassword } from "../utils/hashPassword.js";
import { generateToken } from "../utils/generateToken.js";
import { httpError } from "../utils/httpError.js";
import { parseIdentifier, identifierQuery, normalizeEmail, normalizePhone, splitFullName } from "../utils/identifier.js";
import {
  issueVerificationCode,
  consumeVerificationCode,
  getVerificationCooldown,
  issueResetLink,
  findResetToken,
  deleteUserCodes,
  RESEND_COOLDOWN_SECONDS,
} from "./otpService.js";
import { verifySocialToken } from "./socialAuthService.js";

const isVerified = (user) => user.emailVerified || user.phoneVerified;

// Test/dev convenience: lets a frontend dev (or an automated test) read the code
// from the API response instead of an inbox. Never active in production.
const exposeDev = () => process.env.NODE_ENV === "development" && process.env.EXPOSE_DEV_OTP === "true";

const destinationFor = (user, channel) => (channel === "email" ? user.email : user.phone);

// Step 1 of 2 — "Create a customer account"
// Creates the account (unverified) and sends a 6-digit code to the chosen channel.
// No token is issued until the code is verified.
export async function registerUser(data) {
  const { password, role } = data;

  const { firstName, lastName } = data.fullName
    ? splitFullName(data.fullName)
    : { firstName: String(data.firstName).trim(), lastName: String(data.lastName || "").trim() };
  const email = data.email ? normalizeEmail(data.email) : undefined;
  const phone = data.phone ? normalizePhone(data.phone) : undefined;
  if (data.phone && !phone) throw httpError("Provide a valid phone number.", 400);

  // "Choose your verification method": the code goes to the chosen channel, which must have a value
  const method = data.verificationMethod || (email ? "email" : "sms");
  if (method === "email" && !email) throw httpError("An email address is required to verify by email.", 400);
  if (method === "sms" && !phone) throw httpError("A phone number is required to verify by SMS.", 400);

  const matches = await User.find({ $or: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])] });
  if (matches.some(isVerified) || matches.length > 1) {
    throw httpError("An account with this email or phone already exists.", 409);
  }

  const passwordHash = await hashPassword(password);
  const activeTerms = await Terms.findOne({ isActive: true });
  const fields = {
    firstName,
    lastName,
    email,
    phone,
    password: passwordHash,
    role: role || "customer",
    verificationMethod: method,
    termsAcceptedAt: new Date(),
    termsAcceptedVersion: activeTerms?.version ?? null,
  };

  // An abandoned, never-verified signup doesn't block the person from trying again
  let user = matches[0];
  if (user) {
    user.set(fields);
    // fields left blank this time are removed rather than kept from the old attempt
    if (!email) user.set("email", undefined);
    if (!phone) user.set("phone", undefined);
    await user.save();
  } else {
    user = await User.create(fields);
  }

  const delivery = await issueVerificationCode(user, method === "email" ? "email" : "sms", destinationFor(user, method === "email" ? "email" : "sms"));

  return {
    verificationRequired: true,
    channel: delivery.channel,
    destination: delivery.destination,
    expiresInSeconds: delivery.expiresInSeconds,
    resendAvailableInSeconds: delivery.resendAvailableInSeconds,
    ...(exposeDev() && { devCode: delivery.code }),
  };
}

// "Verify Your Account" — submit the 6-digit code. Success returns the session
// token, so the app can go straight on to "Complete Your Profile".
export async function verifyAccount({ identifier, code }) {
  const parsed = parseIdentifier(identifier);
  const user = parsed && (await User.findOne(identifierQuery(parsed)));
  if (!user || !user.isActive) throw httpError("Invalid or expired code.", 400);

  const channel = await consumeVerificationCode(user._id, code);
  if (channel === "email") user.emailVerified = true;
  else user.phoneVerified = true;
  await user.save();

  return { user: user.toJSON(), token: generateToken(user) };
}

// "Didn't receive the code? Resend Code"
export async function resendVerification({ identifier }) {
  const parsed = parseIdentifier(identifier);
  const user = parsed && (await User.findOne(identifierQuery(parsed)));

  // Same answer for unknown / already-verified accounts so this can't be used to probe who has an account
  const generic = { expiresInSeconds: undefined, resendAvailableInSeconds: RESEND_COOLDOWN_SECONDS };
  if (!user || !user.isActive || isVerified(user)) return generic;

  const channel = parsed.type === "email" ? "email" : "sms";
  const delivery = await issueVerificationCode(user, channel, destinationFor(user, channel));
  return {
    channel,
    destination: delivery.destination,
    expiresInSeconds: delivery.expiresInSeconds,
    resendAvailableInSeconds: delivery.resendAvailableInSeconds,
    ...(exposeDev() && { devCode: delivery.code }),
  };
}

// "Welcome Back" — Customer / Artisan tab, email-or-phone + password, Remember me
export async function loginUser({ identifier, email, password, role, rememberMe }) {
  const parsed = parseIdentifier(identifier || email);
  const invalid = () => httpError("Invalid email/phone or password.", 401);
  if (!parsed) throw invalid();

  // password is select:false, so ask for it explicitly
  const user = await User.findOne(identifierQuery(parsed)).select("+password");
  if (!user || !user.isActive || !user.password) throw invalid(); // social-only accounts have no password
  if (!(await comparePassword(password, user.password))) throw invalid();

  // The Customer/Artisan tab must match the account type
  if (role && user.role !== role) {
    throw httpError(`This account is registered as ${user.role === "admin" ? "an admin" : `a ${user.role}`}. Use the ${user.role === "artisan" ? "Artisan" : "Customer"} tab to sign in.`, 403, { code: "ROLE_MISMATCH", accountRole: user.role });
  }

  if (!isVerified(user)) {
    // Send them to the verify screen with a fresh code (cooldown-aware)
    const channel = parsed.type === "email" ? "email" : "sms";
    let delivery = null;
    try {
      delivery = await issueVerificationCode(user, channel, destinationFor(user, channel));
    } catch (error) {
      if (error.statusCode !== 429) throw error;
    }
    throw httpError("Please verify your account to continue.", 403, {
      code: "ACCOUNT_NOT_VERIFIED",
      requiresVerification: true,
      identifier: parsed.value,
      channel,
      ...(exposeDev() && delivery && { devCode: delivery.code }),
    });
  }

  user.lastLoginAt = new Date();
  await user.save();

  return { user: user.toJSON(), token: generateToken(user, { rememberMe: Boolean(rememberMe) }) };
}

// "Forgot Password?" — email or phone in, reset CODE out (by email or SMS).
// Always answers the same way whether or not the account exists.
export async function forgotPassword({ identifier }) {
  const parsed = parseIdentifier(identifier);
  if (!parsed) throw httpError("Enter a valid email address or phone number.", 400);

  const channel = parsed.type === "email" ? "email" : "sms";
  const result = { channel, destination: parsed.value, resendAvailableInSeconds: RESEND_COOLDOWN_SECONDS };

  const user = await User.findOne(identifierQuery(parsed));
  if (user && user.isActive) {
    const issued = await issueResetCode(user, channel, parsed.value);
    result.resendAvailableInSeconds = issued.resendAvailableInSeconds;
    if (exposeDev() && issued.code) result.devCode = issued.code;
  }
  return result;
}

// "Create New Password"
export async function resetPassword({ identifier, code, password }) {
  const parsed = parseIdentifier(identifier);
  if (!parsed) throw httpError("Enter a valid email address or phone number.", 400);

  const user = await User.findOne(identifierQuery(parsed)).select("+password");
  if (!user || !user.isActive) throw httpError("This reset code is invalid or has expired.", 400);

  const record = await findResetCode(user._id, code);

  if (user.password && (await comparePassword(password, user.password))) {
    throw httpError("Your new password must be different from your previous password.", 400);
  }

  user.password = await hashPassword(password);
  user.passwordChangedAt = new Date(); // signs out every existing session
  if (record.channel === "email") user.emailVerified = true;
  else user.phoneVerified = true;

  await user.save();
  await deleteUserCodes(user._id);
  return { passwordReset: true };
}

// "Continue with Google" / "Continue with Apple"
export async function socialLogin({ provider, idToken, role, fullName }) {
  const claims = await verifySocialToken(provider, idToken);
  if (!claims.email || !claims.emailVerified) {
    throw httpError(`Your ${provider} account must have a verified email address.`, 400);
  }

  let user = await User.findOne({ email: claims.email }).select("+password +authProviders");
  let isNewUser = false;

  if (user) {
    if (!user.isActive) throw httpError("This account has been deactivated.", 403);
    // Someone may have pre-registered this email without verifying it. Drop that
    // unverified password so they can't keep a way into the account the real owner just claimed.
    if (!isVerified(user)) user.password = undefined;
    user.emailVerified = true;
  } else {
    isNewUser = true;
    const { firstName, lastName } = splitFullName(fullName || claims.name || claims.email.split("@")[0]);
    user = new User({
      firstName,
      lastName,
      email: claims.email,
      role: role || "customer",
      emailVerified: true,
      verificationMethod: "email",
      avatarUrl: claims.picture,
    });
  }

  if (!user.authProviders?.some((p) => p.provider === provider && p.providerId === claims.providerId)) {
    user.authProviders = [...(user.authProviders || []), { provider, providerId: claims.providerId }];
  }
  user.lastLoginAt = new Date();
  await user.save();

  return { user: user.toJSON(), token: generateToken(user), isNewUser };
}
