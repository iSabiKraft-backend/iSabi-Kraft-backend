export class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

export const httpError = (statusCode, message) => new HttpError(statusCode, message);
