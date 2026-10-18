const errorHandler = (err, req, res, _next) => {
  console.error(err);

  // Mongoose validation errors
  if (err.name === "ValidationError") {
    const errors = Object.values(err.errors).map((error) => error.message);

    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors,
    });
  }

  // Invalid MongoDB ObjectId
  if (err.name === "CastError") {
    return res.status(400).json({
      success: false,
      message: "Invalid resource ID",
    });
  }

  // MongoDB duplicate key error
  if (err.code === 11000) {
    const duplicatedField = Object.keys(err.keyPattern || {})[0];

    return res.status(409).json({
      success: false,
      message: duplicatedField
        ? `${duplicatedField} already exists`
        : "Duplicate resource",
    });
  }

  // Explicit application errors
  const statusCode = err.statusCode || 500;

  return res.status(statusCode).json({
    success: false,
    message:
      statusCode === 500
        ? "An unexpected error occurred"
        : err.message,
  });
};

export default errorHandler;