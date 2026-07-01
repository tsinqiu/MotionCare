USE MotionAnalysis;

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
