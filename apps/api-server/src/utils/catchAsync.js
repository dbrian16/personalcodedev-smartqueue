/**
 * Wrapper function to automatically catch errors from async controllers.
 * WHY: Helps eliminate repetitive try/catch blocks completely. Any error
 * generated from a promise will automatically be pushed (via next) to the Global Error Handler.
 */
const catchAsync = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((err) => next(err));
  };
};

module.exports = catchAsync;
