import { getMe as getMeService, updateMe as updateMeService, listUsers as listUsersService } from "../services/userService.js";

export const getMe = async (req, res, next) => {
  try {
    const user = await getMeService(req.user.id);

    return res.status(200).json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

export const updateMe = async (req, res, next) => {
  try {
    const user = await updateMeService(req.user.id, req.body);

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully.",
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

export const listUsers = async (req, res, next) => {
  try {
    const result = await listUsersService(req.query);

    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};
