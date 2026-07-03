CREATE TABLE IF NOT EXISTS AiCoachFeedback (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  suggestion_date DATE NULL,
  suggestion_type VARCHAR(40) NOT NULL,
  model_version VARCHAR(80) NULL,
  feedback VARCHAR(40) NOT NULL,
  note VARCHAR(500) NULL,
  ml_provider VARCHAR(40) NULL,
  ml_risk_level VARCHAR(20) NULL,
  ml_load_action VARCHAR(20) NULL,
  ml_weather_risk VARCHAR(20) NULL,
  raw_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT FK_AiCoachFeedback_user FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
  KEY IX_AiCoachFeedback_user_date (user_id, suggestion_date),
  KEY IX_AiCoachFeedback_feedback (feedback)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS MorningReadinessFeedback (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  feedback_date DATE NOT NULL,
  readiness_score TINYINT NOT NULL,
  muscle_soreness VARCHAR(20) NOT NULL,
  mental_state VARCHAR(20) NOT NULL,
  training_willingness VARCHAR(20) NOT NULL,
  note VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT UQ_MorningReadinessFeedback_user_date UNIQUE (user_id, feedback_date),
  CONSTRAINT FK_MorningReadinessFeedback_user FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
  KEY IX_MorningReadinessFeedback_user_date (user_id, feedback_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
