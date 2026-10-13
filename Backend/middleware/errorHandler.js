
export const errorHandler = (error, req, res, next) => {
  console.error(error.errors || error);

  // Default to Internal Server Error
  const statusCode = error.statusCode || 500;

  const response = {
    success: false,
    message: error.message || "Internal Server Error",
  };

  if (process.env.NODE_ENV === "development") {
    response.stack = error.stack;
  }

  res.status(statusCode).json(response);
};
