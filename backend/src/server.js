const createApp = require('./app');
const config = require('./config');
const db = require('./db');
const { startServer } = require('./serverStartup');

const app = createApp();
const server = startServer({
  app,
  host: config.server.host,
  port: config.server.port
});

const SHUTDOWN_TIMEOUT_MS = 30000;
let shuttingDown = false;

function closeServer() {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`${signal} received, shutting down`);

  const timer = setTimeout(() => {
    console.error(`Graceful shutdown timed out after ${SHUTDOWN_TIMEOUT_MS}ms`);
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  timer.unref?.();

  try {
    await closeServer();
    await db.closePool();
    clearTimeout(timer);
    process.exit(0);
  } catch (error) {
    clearTimeout(timer);
    console.error(`Graceful shutdown failed: ${error.message}`);
    process.exit(1);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
