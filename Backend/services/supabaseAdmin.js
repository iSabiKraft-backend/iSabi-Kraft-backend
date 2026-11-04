import { httpError } from "../utils/httpError.js";

const base = () => {
  if (!process.env.SUPABASE_URL)
    throw httpError(503, "Supabase admin access is not configured");
  return process.env.SUPABASE_URL.replace(/\/$/, "");
};

const headers = () => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw httpError(503, "Admin access to Supabase is not configured");

  return {
    apikey: key,
    ...(key.startsWith("sb_") ? {} : { Authorization: `Bearer ${key}` }),
    "Content-Type": "application/json",
  };
};

const call = async (url, options = {}) => {
  const res = await fetch(url, {
    ...options,
    headers: { ...headers(), ...options.headers },
    signal: AbortSignal.timeout(15000),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    console.error("Supabase admin call failed", res.status, body);
    throw httpError(502, "Supabase request failed");
  }
  return body;
};

export const pendingVerifications = () =>
  call(
    `${base()}/rest/v1/artisan_verifications?status=eq.pending&order=submitted_at.asc&select=*`,
  );

export const setVerificationStatus = async (userId, status, reason) => {
  const rows = await call(
    `${base()}/rest/v1/artisan_verifications?user_id=eq.${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        status,
        rejection_reason: status === "rejected" ? reason : null,
        reviewed_at: new Date().toISOString(),
      }),
    },
  );
  if (!rows?.length) throw httpError(404, "Verification record not found");
  return rows[0];
};

export const artisanProfile = async (userId) => {
  const id = encodeURIComponent(userId);
  const [profiles, artisanProfiles] = await Promise.all([
    call(`${base()}/rest/v1/profiles?id=eq.${id}&select=*`),
    call(`${base()}/rest/v1/artisan_profiles?id=eq.${id}&select=*`),
  ]);
  return {
    profile: Array.isArray(profiles) ? profiles[0] || null : null,
    artisan: Array.isArray(artisanProfiles) ? artisanProfiles[0] || null : null,
  };
};

const allIdsFrom = async (table, filter = "") => {
  const pageSize = 500;
  const ids = [];
  for (let offset = 0; ; offset += pageSize) {
    const rows = await call(
      `${base()}/rest/v1/${table}?${filter ? `${filter}&` : ""}select=id&order=id.asc&limit=${pageSize}&offset=${offset}`,
    );
    const page = Array.isArray(rows) ? rows : [];
    ids.push(...page.map((row) => row?.id).filter(Boolean));
    if (page.length < pageSize) break;
  }
  return ids;
};

export const artisanUserIds = async () => {
  const [profileIds, artisanIds] = await Promise.all([
    allIdsFrom("profiles", "role=eq.artisan"),
    allIdsFrom("artisan_profiles"),
  ]);
  return [
    ...new Set(
      [...profileIds, ...artisanIds].filter(
        (id) =>
          typeof id === "string" &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            id,
          ),
      ),
    ),
  ];
};

export const signedUrl = async (bucket, path, expiresIn = 300) => {
  if (!path) return null;
  const safePath = path.split("/").map(encodeURIComponent).join("/");
  const body = await call(
    `${base()}/storage/v1/object/sign/${bucket}/${safePath}`,
    {
      method: "POST",
      body: JSON.stringify({ expiresIn }),
    },
  );
  return body?.signedURL ? `${base()}/storage/v1${body.signedURL}` : null;
};
export const artisanVerification = async (userId) => {
  const id = encodeURIComponent(userId);
  const rows = await call(
    `${base()}/rest/v1/artisan_verifications?user_id=eq.${id}&select=status,rejection_reason,submitted_at&limit=1`,
  );
  return Array.isArray(rows) ? rows[0] || null : null;
};
