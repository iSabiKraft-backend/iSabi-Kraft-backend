import { getRankedMatches } from "../services/matchingService.js";

export const getJobMatches = async (req, res) => {
  const data = await getRankedMatches(req.params.id, req.user.id);
  return res.status(200).json({ success: true, data });
};
