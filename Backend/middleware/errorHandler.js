
export const errorHandler = (error, req, res, next) => {
  console.error(error.errors || error);

  const statusCode = error.statusCode || error.status || 500;
  const message = error.message || 'Internal Server Error';

  
  if (error.code === 11000) {
    statusCode = 409;
    const fields = Object.keys(error.keyPattern || error.keyValue || {}).join(', ');
    message = `A record with this ${fields || 'value'} already exists.`;
  } else if (error.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(error.errors || {}).map((e) => e.message).join('; ') || message;
  } else if (error.name === 'CastError') {
    statusCode = 400;
    message = `Invalid ${error.path || 'value'}.`;
  }

  const response = { success: false, message };

  if (process.env.NODE_ENV === 'development') {
    response.stack = error.stack;
  }

  res.status(statusCode).json(response);
};

export default errorHandler;
