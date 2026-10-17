// State -> LGA lists backing the State / LGA dropdowns on "Complete Your Profile".
// The MVP launches in a single Lagos corridor (PRD §11), so Lagos is the only
// supported state for now. To open another state, add it here — validation and
// the /locations endpoints pick it up automatically.
export const LOCATIONS = {
  Lagos: [
    "Agege", "Ajeromi-Ifelodun", "Alimosho", "Amuwo-Odofin", "Apapa", "Badagry", "Epe",
    "Eti-Osa", "Ibeju-Lekki", "Ifako-Ijaiye", "Ikeja", "Ikorodu", "Kosofe", "Lagos Island",
    "Lagos Mainland", "Mushin", "Ojo", "Oshodi-Isolo", "Shomolu", "Surulere",
  ],
};

const matchKey = (state) => Object.keys(LOCATIONS).find((s) => s.toLowerCase() === String(state).trim().toLowerCase());

export const getStates = () => Object.keys(LOCATIONS);

export const getLgas = (state) => {
  const key = matchKey(state);
  return key ? LOCATIONS[key] : null;
};

// Returns canonical { state, lga } or null when the pair isn't supported.
export const resolveLocation = (state, lga) => {
  const key = matchKey(state);
  if (!key) return null;
  const canonicalLga = LOCATIONS[key].find((l) => l.toLowerCase() === String(lga).trim().toLowerCase());
  return canonicalLga ? { state: key, lga: canonicalLga } : null;
};
