function startupErrorMessage(error, host, port) {
  if (error.code === 'EADDRINUSE') {
    return `Failed to start MotionCare API: ${host}:${port} is already in use`;
  }
  if (error.code === 'EACCES') {
    return `Failed to start MotionCare API: permission denied for ${host}:${port}`;
  }
  return `Failed to start MotionCare API: ${error.message}`;
}

function startServer({
  app,
  host,
  port,
  logger = console,
  onError = () => {
    process.exitCode = 1;
  }
}) {
  return app.listen(port, host, (error) => {
    if (error) {
      logger.error(startupErrorMessage(error, host, port));
      onError(error);
      return;
    }
    logger.log(`MotionCare API listening on http://${host}:${port}`);
  });
}

module.exports = {
  startServer,
  startupErrorMessage
};
