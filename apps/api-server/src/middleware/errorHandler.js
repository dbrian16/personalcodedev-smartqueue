/**
 * Global Error Handler Middleware
 * Responds with a standard JSON structure for all errors occurring in the system.
 */
const log = require('../utils/logger');
const errorHandler = (err, req, res, _next) => {
  // Default to 500 error if no specific status code is provided
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  // Log to console for debugging
  log.error(`[Error] ${message}`, { stack: err.stack, path: req.path });

  res.status(statusCode).json({
    success: false,
    message: message,
    error: message, // Added so frontend apps can read err.response?.data?.error
    // Only show detailed stack trace in Development environment for security
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
};

module.exports = errorHandler;
