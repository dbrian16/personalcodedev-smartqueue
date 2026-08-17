class AppError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

const throwError = (message, statusCode = 400) => {
  throw new AppError(message, statusCode);
};

module.exports = {
  AppError,
  throwError
};
