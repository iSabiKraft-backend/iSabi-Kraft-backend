const TRADE_ALIASES = {
  electrical: ["electrical", "electrician", "electricians", "electrical installation", "electrical services", "wiring"],
  plumbing: ["plumbing", "plumber", "plumbers", "plumbing services"],
  carpentry: ["carpentry", "carpenter", "carpenters", "woodwork", "furniture making"],
  painting: ["painting", "painter", "painters", "painting services"],
  cleaning: ["cleaning", "cleaner", "cleaners", "house cleaning"],
  tiling: ["tiling", "tiler", "tilers", "tile installation"],
  tailoring: ["tailoring", "tailor", "tailors", "fashion design"],
  mechanical: ["mechanical", "mechanic", "mechanics", "auto mechanic", "automotive"],
  welding: ["welding", "welder", "welders", "metal fabrication"],
};
const normalize = (value) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const CATEGORY_LOOKUP = new Map(Object.entries(TRADE_ALIASES).flatMap(([category, aliases]) => aliases.map((alias) => [normalize(alias), category])));
export const normalizeTrade = (value) => String(value || "").trim().replace(/\s+/g, " ").slice(0, 60);
export const normalizeCategory = (category, trade) => CATEGORY_LOOKUP.get(normalize(category)) || CATEGORY_LOOKUP.get(normalize(trade)) || normalize(category) || "other";
