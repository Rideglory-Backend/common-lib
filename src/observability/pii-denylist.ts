export const PII_SENSITIVE_FIELDS = [
  'authorization',
  'password',
  'email',
  'phone',
  'phoneNumber',
  'soatNumber',
  'licensePlate',
  'vin',
  'idToken',
  'token',
  'firebaseToken',
  'fcmToken',
];

/**
 * Pino redact paths for HTTP log lines.
 * Every field in PII_SENSITIVE_FIELDS must have at least one corresponding
 * path entry here — enforced by the pii-denylist.spec.ts coverage test.
 *
 * Paths cover:
 *  - request headers (authorization)
 *  - request body write payloads
 *  - response body read payloads (email, soatNumber)
 */
export const PII_REDACT_PATHS = [
  // Headers
  'req.headers.authorization',
  // Request body fields
  'req.body.password',
  'req.body.email',
  'req.body.phone',
  'req.body.phoneNumber',
  'req.body.licensePlate',
  'req.body.vin',
  'req.body.soatNumber',
  'req.body.idToken',
  'req.body.token',
  'req.body.firebaseToken',
  'req.body.fcmToken',
  // Response body fields
  'res.body.email',
  'res.body.soatNumber',
  'res.body.idToken',
  'res.body.token',
  'res.body.firebaseToken',
  'res.body.fcmToken',
];
