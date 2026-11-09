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

const rowsFrom = (body) => Array.isArray(body) ? body : [];

export const listVerifications = async ({ status, search, page = 1, limit = 20 } = {}) => {
  const params = new URLSearchParams({
    select: "*",
    order: "submitted_at.desc",
    limit: String(limit),
    offset: String((page - 1) * limit),
  });
  if (status && status !== "all") params.set("status", `eq.${status}`);
  if (search) params.set("user_id", `eq.${search}`);
  return rowsFrom(await call(`${base()}/rest/v1/artisan_verifications?${params}`));
};

export const verificationCounts = async () => {
  const statuses = ["pending", "approved", "rejected", "info_requested"];
  const pairs = await Promise.all(statuses.map(async (status) => {
    const res = await fetch(`${base()}/rest/v1/artisan_verifications?select=id&status=eq.${status}`, {
      method: "HEAD",
      headers: { ...headers(), Prefer: "count=exact", Range: "0-0" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw httpError(502, "Unable to count verification records");
    const range = res.headers.get("content-range") || "";
    const total = Number(range.split("/")[1]);
    return [status, Number.isFinite(total) ? total : 0];
  }));
  return Object.fromEntries(pairs);
};


export const verificationUserIds = async (status) => {
  const ids = [];
  const pageSize = 100;
  for (let offset = 0; ; offset += pageSize) {
    const rows = rowsFrom(await call(
      `${base()}/rest/v1/artisan_verifications?status=eq.${encodeURIComponent(status)}&select=user_id&order=user_id.asc&limit=${pageSize}&offset=${offset}`,
    ));
    ids.push(...rows.map((row) => row.user_id).filter(Boolean));
    if (rows.length < pageSize) break;
  }
  return [...new Set(ids)];
};

export const verificationByUser = async (userId) => {
  const id = encodeURIComponent(userId);
  const rows = rowsFrom(await call(`${base()}/rest/v1/artisan_verifications?user_id=eq.${id}&select=*&order=submitted_at.desc&limit=1`));
  return rows[0] || null;
};

export const setVerificationStatus = async (userId, status, reason) => {
  const rows = rowsFrom(await call(
    `${base()}/rest/v1/artisan_verifications?user_id=eq.${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        status,
        rejection_reason: status === "rejected" || status === "info_requested" ? reason : null,
        reviewed_at: status === "pending" ? null : new Date().toISOString(),
      }),
    },
  ));
  if (!rows.length) throw httpError(404, "Verification record not found");
  return rows[0];
};

export const profilesByIds = async (ids) => {
  const unique = [...new Set((ids || []).filter(Boolean).map(String))];
  if (!unique.length) return [];
  const chunks = [];
  for (let i = 0; i < unique.length; i += 100) {
    const inList = unique.slice(i, i + 100).map((id) => `"${id}"`).join(",");
    chunks.push(call(`${base()}/rest/v1/profiles?id=in.(${encodeURIComponent(inList)})&select=*`));
  }
  return (await Promise.all(chunks)).flatMap(rowsFrom);
};

export const artisanProfile = async (userId) => {
  const id = encodeURIComponent(userId);
  const [profiles, artisanProfiles] = await Promise.all([
    call(`${base()}/rest/v1/profiles?id=eq.${id}&select=*`),
    call(`${base()}/rest/v1/artisan_profiles?id=eq.${id}&select=*`),
  ]);
  return {
    profile: rowsFrom(profiles)[0] || null,
    artisan: rowsFrom(artisanProfiles)[0] || null,
  };
};

const allIdsFrom = async (table, filter = "") => {
  const pageSize = 500;
  const ids = [];
  for (let offset = 0; ; offset += pageSize) {
    const rows = rowsFrom(await call(
      `${base()}/rest/v1/${table}?${filter ? `${filter}&` : ""}select=id&order=id.asc&limit=${pageSize}&offset=${offset}`,
    ));
    ids.push(...rows.map((row) => row?.id).filter(Boolean));
    if (rows.length < pageSize) break;
  }
  return ids;
};

export const artisanUserIds = async () => {
  const [profileIds, artisanIds] = await Promise.all([
    allIdsFrom("profiles", "role=eq.artisan"),
    allIdsFrom("artisan_profiles"),
  ]);
  return [...new Set([...profileIds, ...artisanIds].filter((id) =>
    typeof id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  ))];
};

export const signedUrl = async (bucket, path, expiresIn = 300) => {
  if (!path) return null;
  const safePath = path.split("/").map(encodeURIComponent).join("/");
  const body = await call(`${base()}/storage/v1/object/sign/${bucket}/${safePath}`, {
    method: "POST",
    body: JSON.stringify({ expiresIn }),
  });
  return body?.signedURL ? `${base()}/storage/v1${body.signedURL}` : null;
};

export const artisanVerification = async (userId) => {
  const row = await verificationByUser(userId);
  return row ? {
    status: row.status,
    rejection_reason: row.rejection_reason,
    submitted_at: row.submitted_at,
  } : null;
};
