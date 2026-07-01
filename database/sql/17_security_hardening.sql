USE MotionAnalysis;

CREATE TABLE IF NOT EXISTS LoginAttempts (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NULL,
    user_id INT NULL,
    ip_address VARCHAR(64) NULL,
    user_agent VARCHAR(500) NULL,
    success BOOLEAN NOT NULL,
    failure_reason VARCHAR(120) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY IX_LoginAttempts_email_ip_time (email, ip_address, created_at),
    KEY IX_LoginAttempts_ip_time (ip_address, created_at),
    CONSTRAINT FK_LoginAttempts_user
        FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS SecurityEvents (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    event_type VARCHAR(80) NOT NULL,
    result VARCHAR(40) NOT NULL DEFAULT 'success',
    ip_address VARCHAR(64) NULL,
    user_agent VARCHAR(500) NULL,
    resource_type VARCHAR(80) NULL,
    resource_id VARCHAR(80) NULL,
    detail_json JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY IX_SecurityEvents_user_time (user_id, created_at),
    KEY IX_SecurityEvents_type_time (event_type, created_at),
    KEY IX_SecurityEvents_ip_time (ip_address, created_at),
    CONSTRAINT FK_SecurityEvents_user
        FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
