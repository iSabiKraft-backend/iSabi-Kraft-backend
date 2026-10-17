import { getStates, getLgas } from "../utils/nigeriaLocations.js";

// GET /locations/states — fills the State dropdown
export const listStates = (_req, res) => res.status(200).json({ success: true, data: getStates() });

// GET /locations/states/:state/lgas — fills the LGA dropdown once a state is picked
export const listLgas = (req, res) => {
  const lgas = getLgas(req.params.state);
  if (!lgas) return res.status(404).json({ success: false, message: "State not supported yet." });
  return res.status(200).json({ success: true, data: lgas });
};
