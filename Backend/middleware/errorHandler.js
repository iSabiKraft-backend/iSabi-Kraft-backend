const errorHandler = (err, req, res, _next) => {
  console.error(err.errors || err);

  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || "Internal Server Error";

  // Mongoose validation errors
  if (err.name === "ValidationError") {
    statusCode = 400;

    const errors = Object.values(err.errors || {}).map(
      (error) => error.message
    );

    message = errors.length
      ? "Validation failed"
      : message;

    const response = {
      success: false,
      message,
      ...(errors.length > 0 && { errors }),
      ...err.extra,
    };

    if (process.env.NODE_ENV === "development") {
      response.stack = err.stack;
    }

    return res.status(statusCode).json(response);
  }

  // MongoDB duplicate key error
  if (err.code === 11000) {
    statusCode = 409;

    const fields = Object.keys(
      err.keyPattern || err.keyValue || {}
    );

    message = fields.length
      ? `${fields.join(", ")} already exists`
      : "Duplicate resource";

    // Retain any additional application error metadata.
    const response = {
      success: false,
      message,
      ...err.extra,
    };

    if (process.env.NODE_ENV === "development") {
      response.stack = err.stack;
    }

    return res.status(statusCode).json(response);
  }

  // Invalid MongoDB ObjectId or cast error
  if (err.name === "CastError") {
    statusCode = 400;
    message = `Invalid ${err.path || "resource ID"}.`;
  }

  // Multer file upload errors
  if (err.name === "MulterError") {
    statusCode = 400;

    if (err.code === "LIMIT_FILE_SIZE") {
      message = "Uploaded file exceeds the configured size limit.";
    } else if (err.code === "LIMIT_FILE_COUNT") {
      message = "Too many files uploaded.";
    } else if (err.code === "LIMIT_UNEXPECTED_FILE") {
      message = "Unexpected file field.";
    } else {
      message = err.message || "File upload failed.";
    }
  }

  // Build the standard error response
  const response = {
    success: false,
    message:
      statusCode >= 500 && process.env.NODE_ENV !== "development"
        ? "An unexpected error occurred"
        : message,
    ...err.extra,
  };

  // Include stack traces only in development
  if (process.env.NODE_ENV === "development") {
    response.stack = err.stack;
  }

  return res.status(statusCode).json(response);
};

export default errorHandler;
