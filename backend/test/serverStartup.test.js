const test = require('node:test');
const assert = require('node:assert/strict');

const { startServer } = require('../src/serverStartup');

function loggerStub() {
  const info = [];
  const errors = [];
  return {
    info,
    errors,
    logger: {
      log(message) { info.push(message); },
      error(message) { errors.push(message); }
    }
  };
}

test('server startup reports listen errors without logging a false success', () => {
  const output = loggerStub();
  const startupErrors = [];
  const app = {
    listen(_port, _host, callback) {
      const error = new Error('address already in use');
      error.code = 'EADDRINUSE';
      callback(error);
      return { close() {} };
    }
  };

  startServer({
    app,
    host: '127.0.0.1',
    port: 8089,
    logger: output.logger,
    onError: (error) => startupErrors.push(error)
  });

  assert.deepEqual(output.info, []);
  assert.deepEqual(output.errors, ['Failed to start MotionCare API: 127.0.0.1:8089 is already in use']);
  assert.equal(startupErrors[0].code, 'EADDRINUSE');
});

test('server startup logs the listening address only after success', () => {
  const output = loggerStub();
  const app = {
    listen(_port, _host, callback) {
      callback();
      return { close() {} };
    }
  };

  startServer({ app, host: '127.0.0.1', port: 8089, logger: output.logger });

  assert.deepEqual(output.info, ['MotionCare API listening on http://127.0.0.1:8089']);
  assert.deepEqual(output.errors, []);
});
