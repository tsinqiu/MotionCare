USE MotionAnalysis;

ALTER TABLE Activities
  ADD COLUMN perceived_effort TINYINT NULL,
  ADD COLUMN photo_path VARCHAR(1000) NULL,
  ADD COLUMN photo_original_name VARCHAR(260) NULL,
  ADD COLUMN photo_mime_type VARCHAR(120) NULL,
  ADD COLUMN photo_size_bytes BIGINT NULL;

ALTER TABLE Shoes
  ADD COLUMN photo_path VARCHAR(1000) NULL,
  ADD COLUMN photo_original_name VARCHAR(260) NULL,
  ADD COLUMN photo_mime_type VARCHAR(120) NULL,
  ADD COLUMN photo_size_bytes BIGINT NULL;
