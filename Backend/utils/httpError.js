// Error with an HTTP status and optional extra JSON fields (e.g. { requiresVerification: true }).
export const httpError = (message, statusCode = 400, extra) => Object.assign(new Error(message), { statusCode, extra });
