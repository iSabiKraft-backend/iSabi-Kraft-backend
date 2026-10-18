export const errorHandler = (error, req, res, next) => {
  console.error(error.errors || error);

  let statusCode = error.statusCode || error.status || 500;
  let message = error.message || 'Internal Server Error';

  // Mongoose / MongoDB errors -> proper client errors instead of 500s
  if (error.code === 11000) {
    statusCode = 409;
    const fields = Object.keys(error.keyPattern || error.keyValue || {}).join(', ');
    message = `A record with this ${fields || 'value'} already exists.`;
  } else if (error.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(error.errors || {}).map((e) => e.message).join('; ') || message;
  } else if (error.name === 'MulterError') {
    statusCode = 400;
    message = error.code === 'LIMIT_FILE_SIZE' ? 'Image is too large (max 2 MB).' : error.message;
  } else if (error.name === 'CastError') {
    statusCode = 400;
    message = `Invalid ${error.path || 'value'}.`;
  }

  // extra fields from httpError(), e.g. { requiresVerification: true } or { resendAvailableInSeconds: 42 }
  const response = { success: false, message, ...error.extra };

  if (process.env.NODE_ENV === 'development') {
    response.stack = error.stack;
  }

  res.status(statusCode).json(response);
};

export default errorHandler;
