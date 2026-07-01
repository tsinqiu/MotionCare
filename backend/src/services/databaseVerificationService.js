const db = require('../db');
const config = require('../config');

const REQUIRED_SCHEMA = Object.freeze({
  Users: { columns: ['id', 'role', 'status'] },
  Activities: { columns: ['id', 'owner_user_id', 'data_source', 'is_manual'] },
  ActivitySummaries: { columns: ['activity_id', 'activity_training_load'] },
  TrackPoints: { columns: ['activity_id', 'sample_index', 'sample_time_utc'] },
  DailyHealthSummaries: { columns: ['user_id', 'summary_date'] },
  SleepSummaries: { columns: ['user_id', 'sleep_date'] },
  TrainingStatusSnapshots: { columns: ['user_id', 'snapshot_date'] },
  LoginAttempts: {
    columns: ['id', 'email', 'user_id', 'ip_address', 'user_agent', 'success', 'failure_reason', 'created_at'],
    indexes: ['IX_LoginAttempts_email_ip_time', 'IX_LoginAttempts_ip_time'],
    foreignKeys: ['FK_LoginAttempts_user']
  },
  SecurityEvents: {
    columns: [
      'id',
      'user_id',
      'event_type',
      'result',
      'ip_address',
      'user_agent',
      'resource_type',
      'resource_id',
      'detail_json',
      'created_at'
    ],
    indexes: ['IX_SecurityEvents_user_time', 'IX_SecurityEvents_type_time', 'IX_SecurityEvents_ip_time'],
    foreignKeys: ['FK_SecurityEvents_user']
  }
});

class DatabaseVerificationError extends Error {
  constructor(message, code, missing = undefined) {
    super(message);
    this.name = 'DatabaseVerificationError';
    this.code = code;
    this.missing = missing;
  }
}

function toKey(tableName, objectName) {
  return `${String(tableName).toLowerCase()}.${String(objectName).toLowerCase()}`;
}

function findMissing(rows, rowName, requirementName) {
  const available = new Set(rows.map((row) => toKey(row.tableName, row[rowName])));
  const missing = [];

  for (const [tableName, definition] of Object.entries(REQUIRED_SCHEMA)) {
    for (const objectName of definition[requirementName] || []) {
      const key = toKey(tableName, objectName);
      if (!available.has(key)) missing.push(`${tableName}.${objectName}`);
    }
  }

  return missing;
}

async function verifyDatabase({ query = db.query, databaseName = config.db.database } = {}) {
  try {
    const pingRows = await query('SELECT 1 AS ok');
    if (pingRows[0]?.ok !== 1) {
      throw new Error('database ping returned an unexpected result');
    }

    const columns = await query(
      `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ?`,
      [databaseName]
    );
    const indexes = await query(
      `SELECT DISTINCT TABLE_NAME AS tableName, INDEX_NAME AS indexName
       FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = ?`,
      [databaseName]
    );
    const foreignKeys = await query(
      `SELECT TABLE_NAME AS tableName, CONSTRAINT_NAME AS constraintName
       FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
       WHERE TABLE_SCHEMA = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
      [databaseName]
    );

    const missing = {
      columns: findMissing(columns, 'columnName', 'columns'),
      indexes: findMissing(indexes, 'indexName', 'indexes'),
      foreignKeys: findMissing(foreignKeys, 'constraintName', 'foreignKeys')
    };
    const missingItems = Object.values(missing).flat();

    if (missingItems.length) {
      throw new DatabaseVerificationError(
        `Database schema is incomplete: ${missingItems.join(', ')}. `
          + 'If the database was rebuilt manually, apply database/sql/17_security_hardening.sql before starting. '
          + 'database/scripts/import_shared_seed.ps1 already replays this migration automatically.',
        'DATABASE_SCHEMA_INCOMPLETE',
        missing
      );
    }

    return {
      status: 'ready',
      database: databaseName,
      checkedTables: Object.keys(REQUIRED_SCHEMA).length
    };
  } catch (error) {
    if (error instanceof DatabaseVerificationError) throw error;
    throw new DatabaseVerificationError(
      `Cannot connect to database ${databaseName}. Start MySQL and check the DB_* configuration.`,
      'DATABASE_UNAVAILABLE'
    );
  }
}

module.exports = {
  DatabaseVerificationError,
  REQUIRED_SCHEMA,
  verifyDatabase
};
