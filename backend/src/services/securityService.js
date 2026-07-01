const db = require('../db');
const config = require('../config');
const { ApiError } = require('../errors');

function normalizeText(value, maxLength) {
  const text = String(value || '').trim();
  return text ? text.slice(0, maxLength) : null;
}

function normalizeEmail(value) {
  return normalizeText(value, 255)?.toLowerCase() || null;
}

function getClientIp(req) {
  const ip = normalizeText(req?.ip, 64);
  return ip?.replace(/^::ffff:/, '') || null;
}

function getUserAgent(req) {
  return normalizeText(req?.get?.('user-agent'), 500);
}

async function recordLoginAttempt({ email, userId = null, success, failureReason = null, req }) {
  const result = await db.query(
    `INSERT INTO LoginAttempts
      (email, user_id, ip_address, user_agent, success, failure_reason)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      normalizeEmail(email),
      userId || null,
      getClientIp(req),
      getUserAgent(req),
      Boolean(success),
      normalizeText(failureReason, 120)
    ]
  );
  return result.insertId;
}

async function countRecentFailedLogins({ email, req }) {
  const normalizedEmail = normalizeEmail(email);
  const ipAddress = getClientIp(req);
  const rows = await db.query(
    `SELECT COUNT(*) AS failureCount
     FROM LoginAttempts failed
     WHERE failed.email = ?
       AND failed.ip_address <=> ?
       AND failed.success = FALSE
       AND failed.failure_reason <> 'LOGIN_BLOCKED'
       AND failed.created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? MICROSECOND)
       AND failed.created_at > COALESCE(
         (
           SELECT MAX(reset.created_at)
           FROM LoginAttempts reset
           WHERE reset.email = ?
             AND reset.ip_address <=> ?
             AND (reset.success = TRUE OR reset.failure_reason = 'LOGIN_BLOCKED')
         ),
         '1970-01-01 00:00:00'
       )`,
    [
      normalizedEmail,
      ipAddress,
      config.security.loginFailureWindowMs * 1000,
      normalizedEmail,
      ipAddress
    ]
  );
  return Number(rows[0]?.failureCount || 0);
}

async function recordSecurityEvent({
  userId = null,
  eventType,
  result = 'success',
  resourceType = null,
  resourceId = null,
  detail = null,
  req
}) {
  const queryResult = await db.query(
    `INSERT INTO SecurityEvents
      (user_id, event_type, result, ip_address, user_agent, resource_type, resource_id, detail_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId || null,
      normalizeText(eventType, 80),
      normalizeText(result, 40) || 'success',
      getClientIp(req),
      getUserAgent(req),
      normalizeText(resourceType, 80),
      normalizeText(resourceId, 80),
      detail === null || detail === undefined ? null : JSON.stringify(detail)
    ]
  );
  return queryResult.insertId;
}

async function findActiveLoginBlock({ email, req }) {
  const rows = await db.query(
    `SELECT id, created_at AS createdAt
     FROM LoginAttempts
     WHERE email = ?
       AND ip_address <=> ?
       AND success = FALSE
       AND failure_reason = 'LOGIN_BLOCKED'
       AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? MINUTE)
     ORDER BY created_at DESC
     LIMIT 1`,
    [normalizeEmail(email), getClientIp(req), config.security.loginBlockMinutes]
  );
  return rows[0] || null;
}

async function rejectBlockedLogin({ email, req, reason }) {
  await recordSecurityEvent({
    eventType: 'LOGIN_BLOCKED',
    result: 'blocked',
    resourceType: 'auth',
    resourceId: normalizeEmail(email),
    detail: { reason },
    req
  });
  throw new ApiError(429, 'login temporarily blocked', 'LOGIN_BLOCKED');
}

async function assertLoginAllowed({ email, req }) {
  if (await findActiveLoginBlock({ email, req })) {
    await rejectBlockedLogin({ email, req, reason: 'active_block' });
  }

  const failureCount = await countRecentFailedLogins({ email, req });
  if (failureCount < config.security.loginFailureMax) {
    return;
  }

  await recordLoginAttempt({
    email,
    success: false,
    failureReason: 'LOGIN_BLOCKED',
    req
  });
  await rejectBlockedLogin({ email, req, reason: 'failure_threshold' });
}

module.exports = {
  getClientIp,
  getUserAgent,
  recordLoginAttempt,
  countRecentFailedLogins,
  assertLoginAllowed,
  recordSecurityEvent
};
