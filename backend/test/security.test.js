const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const db = require('../src/db');
const config = require('../src/config');
const securityService = require('../src/services/securityService');

function requestStub({ ip = '::ffff:127.0.0.1', userAgent = 'test-agent' } = {}) {
  return {
    ip,
    get(name) {
      return name.toLowerCase() === 'user-agent' ? userAgent : undefined;
    }
  };
}

test('shared seed import applies security migration after importing seed data', () => {
  const scriptPath = path.resolve(__dirname, '../../database/scripts/import_shared_seed.ps1');
  const script = fs.readFileSync(scriptPath, 'utf8');
  const lastSeedImport = script.lastIndexOf('Importing shared seed');
  const securityMigration = script.indexOf('database/sql/17_security_hardening.sql');

  assert.notEqual(lastSeedImport, -1);
  assert.ok(securityMigration > lastSeedImport);
  assert.match(script.slice(securityMigration), /Invoke-MysqlFile/);
});

test('upload security rejects spoofed image content and removes the file', async () => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'motioncare-upload-'));
  const filePath = path.join(directory, 'spoof.png');
  await fs.promises.writeFile(filePath, 'this is not an image');

  try {
    await assert.rejects(
      async () => {
        const { validateUploadedFile } = require('../src/services/uploadSecurity');
        await validateUploadedFile({
          path: filePath,
          filename: 'spoof.png',
          mimetype: 'image/png'
        }, { kind: 'image' });
      },
      (error) => error.statusCode === 400 && error.code === 'INVALID_UPLOAD'
    );
    assert.equal(fs.existsSync(filePath), false);
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true });
  }
});

test('upload security uses the detected image MIME and a safe extension', async () => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'motioncare-upload-'));
  const originalPath = path.join(directory, 'photo.html');
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64'
  );
  await fs.promises.writeFile(originalPath, png);

  try {
    const { validateUploadedFile } = require('../src/services/uploadSecurity');
    const file = await validateUploadedFile({
      path: originalPath,
      filename: 'photo.html',
      mimetype: 'image/png'
    }, { kind: 'image' });

    assert.equal(file.mimetype, 'image/png');
    assert.equal(path.extname(file.filename), '.png');
    assert.equal(path.extname(file.path), '.png');
    assert.equal(fs.existsSync(file.path), true);
    assert.equal(fs.existsSync(originalPath), false);
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true });
  }
});

test('securityService normalizes client IP and bounds user-agent length', () => {
  const req = requestStub({ userAgent: `agent-${'x'.repeat(600)}` });

  assert.equal(securityService.getClientIp(req), '127.0.0.1');
  assert.equal(securityService.getUserAgent(req).length, 500);
});

test('recordLoginAttempt writes normalized audit fields without credentials', async () => {
  const originalQuery = db.query;
  let captured;
  db.query = async (sql, params) => {
    captured = { sql, params };
    return { insertId: 9 };
  };

  try {
    await securityService.recordLoginAttempt({
      email: 'Runner@Example.com',
      userId: 2,
      success: false,
      failureReason: 'INVALID_CREDENTIALS',
      req: requestStub()
    });

    assert.match(captured.sql, /INSERT INTO LoginAttempts/);
    assert.deepEqual(captured.params, [
      'runner@example.com',
      2,
      '127.0.0.1',
      'test-agent',
      false,
      'INVALID_CREDENTIALS'
    ]);
    assert.doesNotMatch(JSON.stringify(captured), /password|token/i);
  } finally {
    db.query = originalQuery;
  }
});

test('countRecentFailedLogins counts failures after the latest success or expired block', async () => {
  const originalQuery = db.query;
  let captured;
  db.query = async (sql, params) => {
    captured = { sql, params };
    return [{ failureCount: 3 }];
  };

  try {
    const count = await securityService.countRecentFailedLogins({
      email: 'runner@example.com',
      req: requestStub()
    });

    assert.equal(count, 3);
    assert.match(captured.sql, /MAX\(reset\.created_at\)/);
    assert.match(captured.sql, /reset\.failure_reason = 'LOGIN_BLOCKED'/);
    assert.match(captured.sql, /failure_reason <> 'LOGIN_BLOCKED'/);
    assert.deepEqual(captured.params, [
      'runner@example.com',
      '127.0.0.1',
      config.security.loginFailureWindowMs * 1000,
      'runner@example.com',
      '127.0.0.1'
    ]);
  } finally {
    db.query = originalQuery;
  }
});

test('assertLoginAllowed rejects an active persisted block without extending it', async () => {
  const originalQuery = db.query;
  const queries = [];
  db.query = async (sql, params) => {
    queries.push({ sql, params });
    if (sql.includes("failure_reason = 'LOGIN_BLOCKED'")) {
      return [{ id: 4, createdAt: '2026-07-01 10:00:00' }];
    }
    return { insertId: 1 };
  };

  try {
    await assert.rejects(
      securityService.assertLoginAllowed({ email: 'runner@example.com', req: requestStub() }),
      (error) => error.statusCode === 429 && error.code === 'LOGIN_BLOCKED'
    );

    assert.equal(queries.filter(({ sql }) => sql.includes('INSERT INTO LoginAttempts')).length, 0);
    assert.equal(queries.filter(({ sql }) => sql.includes('INSERT INTO SecurityEvents')).length, 1);
  } finally {
    db.query = originalQuery;
  }
});

test('assertLoginAllowed persists one block marker when the failure threshold is reached', async () => {
  const originalQuery = db.query;
  const queries = [];
  db.query = async (sql, params) => {
    queries.push({ sql, params });
    if (sql.includes('failureCount')) return [{ failureCount: config.security.loginFailureMax }];
    if (sql.includes('SELECT id, created_at AS createdAt')) return [];
    return { insertId: 1 };
  };

  try {
    await assert.rejects(
      securityService.assertLoginAllowed({ email: 'runner@example.com', req: requestStub() }),
      (error) => error.statusCode === 429 && error.code === 'LOGIN_BLOCKED'
    );

    const marker = queries.find(({ sql }) => sql.includes('INSERT INTO LoginAttempts'));
    assert.equal(marker.params[5], 'LOGIN_BLOCKED');
    assert.equal(queries.filter(({ sql }) => sql.includes('INSERT INTO SecurityEvents')).length, 1);
  } finally {
    db.query = originalQuery;
  }
});

test('recordSecurityEvent serializes safe detail JSON', async () => {
  const originalQuery = db.query;
  let captured;
  db.query = async (sql, params) => {
    captured = { sql, params };
    return { insertId: 8 };
  };

  try {
    await securityService.recordSecurityEvent({
      userId: 2,
      eventType: 'LOGIN_SUCCESS',
      result: 'success',
      resourceType: 'auth',
      resourceId: 'runner@example.com',
      detail: { method: 'password' },
      req: requestStub()
    });

    assert.match(captured.sql, /INSERT INTO SecurityEvents/);
    assert.equal(captured.params[7], JSON.stringify({ method: 'password' }));
  } finally {
    db.query = originalQuery;
  }
});
