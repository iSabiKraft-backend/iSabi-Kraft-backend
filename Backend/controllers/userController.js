import {
  getMe as getMeService,
  updateMe as updateMeService,
  listUsers as listUsersService,
  completeProfile as completeProfileService,
  setAvatar as setAvatarService,
} from "../services/userService.js";

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

// PUT /users/me/profile — "Complete Your Profile"
export const completeProfile = async (req, res, next) => {
  try {
    const user = await completeProfileService(req.user.id, req.body);

    return res.status(200).json({ success: true, message: "Profile completed.", data: user });
  } catch (error) {
    next(error);
  }
};

// POST /users/me/avatar — profile photo (multipart, field "avatar")
export const uploadAvatar = async (req, res, next) => {
  try {
    const user = await setAvatarService(req.user.id, req.file);

    return res.status(200).json({ success: true, message: "Profile photo updated.", data: user });
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
