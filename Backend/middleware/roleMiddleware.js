// Restrict access based on user roles
export const authorizeRoles = (...roles) => {
  return (req, res, next) => {
     // if authenticateUser did not run, req.user is undefined -> 403, never a crash/allow
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to perform this action.",
      });
    }

    next();
  };
};

//*Authorization tells us what they are allowed to do
