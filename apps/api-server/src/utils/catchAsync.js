/**
 * Wraps an async controller so a rejected promise is forwarded to the global
 * error handler via `next`, instead of a try/catch in every controller.
 *
 * @param {Function} fn - Async controller.
 * @returns {Function} Express handler.
 */
const catchAsync = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((err) => next(err));
  };
};

module.exports = catchAsync;
