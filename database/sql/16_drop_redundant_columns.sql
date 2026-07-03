USE MotionAnalysis;
SET FOREIGN_KEY_CHECKS = 0;

ALTER TABLE DailyHealthSummaries
  DROP COLUMN created_at,
  DROP COLUMN updated_at;

ALTER TABLE HeartRateSamples
  DROP COLUMN raw_json;

ALTER TABLE HrvSamples
  DROP COLUMN raw_json;

ALTER TABLE StressSamples
  DROP COLUMN raw_json;

ALTER TABLE StepSamples
  DROP COLUMN raw_json;

ALTER TABLE IntensityMinuteSamples
  DROP COLUMN raw_json;

ALTER TABLE SleepStageSamples
  DROP COLUMN raw_json;

ALTER TABLE SleepMovementSamples
  DROP COLUMN raw_json;

ALTER TABLE TrainingStatusSnapshots
  DROP COLUMN raw_json;

ALTER TABLE RacePredictions
  DROP COLUMN raw_json;

ALTER TABLE LactateThresholds
  DROP COLUMN raw_json;

ALTER TABLE CyclingFtpSnapshots
  DROP COLUMN raw_json;

SET FOREIGN_KEY_CHECKS = 1;
