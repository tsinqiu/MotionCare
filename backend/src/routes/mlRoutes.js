const fs = require('node:fs');
const { spawn } = require('node:child_process');
const express = require('express');
const config = require('../config');
const { ApiError } = require('../errors');
const { asyncHandler } = require('../http');
const { sendData } = require('../response');

const MODEL_VERSION = 'running-v1';
const FEATURE_NAMES = [
  'distanceM',
  'durationS',
  'movingDurationS',
  'elapsedDurationS',
  'avgSpeedMps',
  'maxSpeedMps',
  'avgHeartRateBpm',
  'maxHeartRateBpm',
  'avgCadenceSpm',
  'maxCadenceSpm',
  'elevationGainM',
  'elevationLossM',
  'avgStrideLengthCm',
  'normalizedPowerW'
];
const FEATURE_LIMITS = {
  distanceM: { min: 1, max: 200000 },
  durationS: { min: 1, max: 86400 },
  movingDurationS: { min: 1, max: 86400 },
  elapsedDurationS: { min: 1, max: 86400 },
  avgSpeedMps: { min: 0, max: 15 },
  maxSpeedMps: { min: 0, max: 20 },
  avgHeartRateBpm: { min: 30, max: 240 },
  maxHeartRateBpm: { min: 30, max: 260 },
  avgCadenceSpm: { min: 0, max: 300 },
  maxCadenceSpm: { min: 0, max: 350 },
  elevationGainM: { min: 0, max: 10000 },
  elevationLossM: { min: 0, max: 10000 },
  avgStrideLengthCm: { min: 0, max: 300 },
  normalizedPowerW: { min: 0, max: 1000 }
};

function parseRunningFeatures(body, featureNames) {
  const features = {};
  const normalizedBody = {
    ...body
  };

  if (
    (normalizedBody.maxCadenceSpm === undefined || normalizedBody.maxCadenceSpm === null || normalizedBody.maxCadenceSpm === '')
    && normalizedBody.avgCadenceSpm !== undefined
    && normalizedBody.avgCadenceSpm !== null
    && normalizedBody.avgCadenceSpm !== ''
  ) {
    normalizedBody.maxCadenceSpm = normalizedBody.avgCadenceSpm;
  }

  if (normalizedBody.normalizedPowerW === undefined || normalizedBody.normalizedPowerW === null || normalizedBody.normalizedPowerW === '') {
    normalizedBody.normalizedPowerW = normalizedBody.avgPowerW ?? 0;
  }

  for (const name of featureNames) {
    const value = normalizedBody[name];
    const limits = FEATURE_LIMITS[name];

    if (value === undefined || value === null || value === '') {
      throw new ApiError(400, `${name} is required`, 'INVALID_ML_INPUT');
    }

    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      throw new ApiError(400, `${name} must be a number`, 'INVALID_ML_INPUT');
    }

    if (numericValue < limits.min || numericValue > limits.max) {
      throw new ApiError(
        400,
        `${name} must be from ${limits.min} to ${limits.max}`,
        'INVALID_ML_INPUT'
      );
    }

    features[name] = numericValue;
  }

  if (features.movingDurationS > features.elapsedDurationS) {
    throw new ApiError(400, 'movingDurationS must not be greater than elapsedDurationS', 'INVALID_ML_INPUT');
  }

  if (features.durationS > features.elapsedDurationS) {
    throw new ApiError(400, 'durationS must not be greater than elapsedDurationS', 'INVALID_ML_INPUT');
  }

  if (features.avgHeartRateBpm > features.maxHeartRateBpm) {
    throw new ApiError(400, 'avgHeartRateBpm must not be greater than maxHeartRateBpm', 'INVALID_ML_INPUT');
  }

  if (features.avgSpeedMps > features.maxSpeedMps) {
    throw new ApiError(400, 'avgSpeedMps must not be greater than maxSpeedMps', 'INVALID_ML_INPUT');
  }

  return features;
}

async function getHealth() {
  const modelAvailable = fs.existsSync(config.ml.modelPath);
  const scriptAvailable = fs.existsSync(config.ml.scriptPath);

  return {
    status: modelAvailable && scriptAvailable ? 'ok' : 'unavailable',
    modelAvailable,
    scriptAvailable,
    modelVersion: MODEL_VERSION,
    supportedActivityType: 'running',
    featureNames: FEATURE_NAMES,
    sampleNote: 'trained only from running activities with activity_training_load available'
  };
}

function runPrediction(payload) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(config.ml.modelPath)) {
      reject(new ApiError(503, 'running model is not trained yet', 'MODEL_UNAVAILABLE'));
      return;
    }
    if (!fs.existsSync(config.ml.scriptPath)) {
      reject(new ApiError(503, 'running prediction script is missing', 'MODEL_UNAVAILABLE'));
      return;
    }

    const child = spawn(
      config.ml.pythonPath,
      [config.ml.scriptPath, '--model', config.ml.modelPath],
      {
        cwd: process.cwd(),
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        windowsHide: true
      }
    );

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new ApiError(503, 'running prediction timed out', 'MODEL_TIMEOUT'));
    }, config.ml.timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(new ApiError(503, `failed to start python prediction: ${error.message}`, 'MODEL_INFERENCE_FAILED'));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new ApiError(503, stderr.trim() || 'running prediction failed', 'MODEL_INFERENCE_FAILED'));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (_error) {
        reject(new ApiError(503, 'running prediction returned invalid JSON', 'MODEL_INFERENCE_FAILED'));
      }
    });

    child.stdin.end(JSON.stringify(payload));
  });
}

const defaultMlService = {
  FEATURE_NAMES,
  MODEL_VERSION,
  getHealth,
  runPrediction
};

function createMlRouter(mlService = defaultMlService) {
  const router = express.Router();

  router.get(
    '/ml/health',
    asyncHandler(async (req, res) => {
      const status = await mlService.getHealth();
      sendData(res, status);
    })
  );

  router.post(
    '/ml/running-prediction',
    asyncHandler(async (req, res) => {
      const features = parseRunningFeatures(req.body, mlService.FEATURE_NAMES);
      const prediction = await mlService.runPrediction(features);
      sendData(res, prediction);
    })
  );

  return router;
}

module.exports = createMlRouter;
