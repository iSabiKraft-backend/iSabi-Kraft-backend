import User from "../models/userModel.js";
import Terms from "../models/termsModel.js";
import { supabase, createSupabaseUserClient } from "../config/supabase.js";
import { httpError } from "../utils/httpError.js";
import { normalizeEmail, normalizePhone, splitFullName } from "../utils/identifier.js";
import { getOnboardingStatus } from "./artisanService.js";

const PASSWORD_RESET_REDIRECT = process.env.SUPABASE_PASSWORD_RESET_REDIRECT_URL;
const EMAIL_CONFIRM_REDIRECT = process.env.SUPABASE_EMAIL_REDIRECT_URL;

const normalizeRole = (role) => (role === "artisan" ? "artisan" : "customer");

async function withOnboarding(user, payload) {
  if (user.role !== "artisan") return payload;
  return { ...payload, onboarding: await getOnboardingStatus(user.id) };
}

function getName(data = {}) {
  if (data.fullName) return splitFullName(data.fullName);
  return {
    firstName: String(data.firstName || "").trim(),
    lastName: String(data.lastName || "").trim(),
  };
}

function getSupabaseError(error, fallback) {
  const message = String(error?.message || "");
  if (/already registered|already been registered|user already exists/i.test(message)) {
    return httpError("An account with this email already exists.", 409);
  }
  if (/email not confirmed/i.test(message)) {
    return httpError("Please verify your email address before signing in.", 403, { code: "ACCOUNT_NOT_VERIFIED" });
  }
  if (/invalid login credentials/i.test(message)) {
    return httpError("Invalid email or password.", 401);
  }
  console.error("Supabase Auth error:", message);
  return httpError(fallback, 502);
}

async function findOrCreateProfile(authUser, details = {}) {
  const email = authUser.email ? normalizeEmail(authUser.email) : undefined;
  if (!email) throw httpError("The Supabase account does not have an email address.", 400);

  const metadata = authUser.user_metadata || {};
  const names = getName({
    fullName: details.fullName || metadata.full_name || metadata.name,
    firstName: details.firstName || metadata.first_name,
    lastName: details.lastName || metadata.last_name,
  });

  let user = await User.findOne({ supabaseUserId: authUser.id });
  if (!user) user = await User.findOne({ email });

  const activeTerms = await Terms.findOne({ isActive: true });
  const emailVerified = Boolean(authUser.email_confirmed_at || authUser.confirmed_at);
  const phone = details.phone ? normalizePhone(details.phone) : undefined;
  if (details.phone && !phone) throw httpError("Provide a valid phone number.", 400);

  if (!user) {
    user = await User.create({
      firstName: names.firstName || email.split("@")[0],
      lastName: names.lastName || "",
      email,
      supabaseUserId: authUser.id,
      ...(phone && { phone }),
      role: normalizeRole(details.role || metadata.role),
      emailVerified,
      verificationMethod: "email",
      termsAcceptedAt: details.acceptTerms ? new Date() : null,
      termsAcceptedVersion: details.acceptTerms ? activeTerms?.version ?? null : null,
      avatarUrl: metadata.avatar_url || null,
    });
  } else {
    if (user.supabaseUserId && user.supabaseUserId !== authUser.id) {
      throw httpError("This email is already linked to another authentication account.", 409);
    }
    if (!user.supabaseUserId && !emailVerified) {
      throw httpError("Verify your email address in Supabase before linking this account.", 403);
    }
    user.supabaseUserId = authUser.id;
    user.email = email;
    if (phone && !user.phone) user.phone = phone;
    user.emailVerified = emailVerified || user.emailVerified;
    if (!user.firstName) user.firstName = names.firstName || email.split("@")[0];
    if (!user.lastName && names.lastName) user.lastName = names.lastName;
    if (details.acceptTerms && !user.termsAcceptedAt) {
      user.termsAcceptedAt = new Date();
      user.termsAcceptedVersion = activeTerms?.version ?? null;
    }
    // Never overwrite an existing role from user-supplied signup metadata.
    await user.save();
  }

  return user;
}

// Express-mediated signup. Supabase sends the confirmation email; MongoDB stores
// the marketplace profile and role. No local OTP or password hash is created.
export async function registerUser(data) {
  const email = data.email ? normalizeEmail(data.email) : "";
  if (!email) throw httpError("An email address is required to register with Supabase Auth.", 400);

  const { firstName, lastName } = getName(data);
  if (!firstName) throw httpError("Full name is required.", 400);

  const { data: authData, error } = await supabase.auth.signUp({
    email,
    password: data.password,
    options: {
      ...(EMAIL_CONFIRM_REDIRECT && { emailRedirectTo: EMAIL_CONFIRM_REDIRECT }),
      data: {
        first_name: firstName,
        last_name: lastName,
        full_name: `${firstName} ${lastName}`.trim(),
        role: normalizeRole(data.role),
      },
    },
  });

  if (error) throw getSupabaseError(error, "We couldn't create your account. Please try again.");
  if (!authData.user) throw httpError("Supabase did not return a user account.", 502);
  if (Array.isArray(authData.user.identities) && authData.user.identities.length === 0) {
    throw httpError("An account with this email already exists.", 409);
  }

  const user = await findOrCreateProfile(authData.user, { ...data, firstName, lastName, acceptTerms: true });
  const verified = Boolean(authData.user.email_confirmed_at || authData.user.confirmed_at);

  return {
    verificationRequired: !verified,
    channel: "email",
    destination: email,
    message: verified
      ? "Account created. You can sign in."
      : "Account created. Check your email for the Supabase confirmation link.",
    user: user.toJSON(),
    ...(authData.session?.access_token && { token: authData.session.access_token }),
    ...(authData.session?.refresh_token && { refreshToken: authData.session.refresh_token }),
  };
}

// Supports Supabase email OTP templates that use {{ .Token }}. Link-based
// confirmation is handled in the mobile app, followed by /sync-profile.
export async function verifyAccount({ identifier, code }) {
  const email = normalizeEmail(identifier || "");
  const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: "signup" });
  if (error || !data.user) throw getSupabaseError(error, "Invalid or expired verification code.");

  const user = await findOrCreateProfile(data.user);
  user.emailVerified = true;
  await user.save();

  return withOnboarding(user, {
    user: user.toJSON(),
    token: data.session?.access_token,
    refreshToken: data.session?.refresh_token,
  });
}

export async function resendVerification({ identifier }) {
  const email = normalizeEmail(identifier || "");
  const { error } = await supabase.auth.resend({ type: "signup", email });
  // Return the same response for all addresses to avoid account enumeration.
  if (error) console.warn("Supabase confirmation resend response:", error.message);
  return { channel: "email", destination: email, verificationRequired: true };
}

export async function loginUser({ identifier, email, password, role }) {
  const normalizedEmail = normalizeEmail(identifier || email || "");
  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });
  if (error || !data.user || !data.session) {
    throw getSupabaseError(error, "Invalid email or password.");
  }

  const user = await findOrCreateProfile(data.user);
  if (!user.isActive) throw httpError("This account has been deactivated.", 403);
  if (role && user.role !== role) {
    throw httpError(
      `This account is registered as ${user.role === "admin" ? "an admin" : `a ${user.role}`}. Use the ${user.role === "artisan" ? "Artisan" : "Customer"} tab to sign in.`,
      403,
      { code: "ROLE_MISMATCH", accountRole: user.role }
    );
  }

  user.emailVerified = Boolean(data.user.email_confirmed_at || data.user.confirmed_at);
  user.lastLoginAt = new Date();
  await user.save();

  return withOnboarding(user, {
    user: user.toJSON(),
    token: data.session.access_token,
    refreshToken: data.session.refresh_token,
  });
}

export async function forgotPassword({ identifier, email }) {
  const destination = normalizeEmail(identifier || email || "");
  if (!destination) throw httpError("Enter a valid email address.", 400);

  const { error } = await supabase.auth.resetPasswordForEmail(destination, {
    ...(PASSWORD_RESET_REDIRECT && { redirectTo: PASSWORD_RESET_REDIRECT }),
  });
  if (error) throw getSupabaseError(error, "We couldn't send the password recovery email. Please try again.");

  // Supabase deliberately does not reveal whether the address has an account.
  return { channel: "email", destination, message: "If an account exists, a password recovery email has been sent." };
}

// The user opens the recovery link in the app. Supabase establishes a recovery
// session; the app sends that session's access token as Bearer to this endpoint.
export async function resetPassword({ password, accessToken }) {
  if (!accessToken) throw httpError("A valid Supabase recovery session is required.", 401);
  const userClient = createSupabaseUserClient(accessToken);
  const { data, error } = await userClient.auth.updateUser({ password });
  if (error || !data.user) throw getSupabaseError(error, "We couldn't update your password.");

  const user = await User.findOne({ supabaseUserId: data.user.id });
  if (user) {
    user.emailVerified = Boolean(data.user.email_confirmed_at || data.user.confirmed_at) || user.emailVerified;
    user.passwordChangedAt = new Date();
    await user.save();
  }
  return { passwordReset: true };
}

// Called after a mobile app completes signup/login directly with the Supabase SDK.
// It links the verified Supabase identity to the MongoDB marketplace profile.
export async function syncProfile(accessToken, details = {}) {
  if (!accessToken) throw httpError("A Supabase access token is required.", 401);
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) throw httpError("Invalid or expired Supabase access token.", 401);
  if (!data.user.email_confirmed_at && !data.user.confirmed_at) {
    throw httpError("Verify your email address before synchronizing your marketplace profile.", 403);
  }
  const user = await findOrCreateProfile(data.user, { ...details, acceptTerms: details.acceptTerms === true || details.acceptTerms === "true" });
  if (!user.isActive) throw httpError("This account has been deactivated.", 403);
  user.lastLoginAt = new Date();
  await user.save();
  return withOnboarding(user, { user: user.toJSON() });
}

// OAuth providers should be configured and invoked through the Supabase SDK.
export async function socialLogin() {
  throw httpError("Use Supabase Auth OAuth in the mobile app, then call /api/auth/sync-profile.", 501);
}
