const test = require('node:test');
const assert = require('node:assert/strict');

const {
  REQUIRED_SCHEMA,
  verifyDatabase
} = require('../src/services/databaseVerificationService');

function completeRows() {
  const columns = [];
  const indexes = [];
  const foreignKeys = [];

  for (const [tableName, definition] of Object.entries(REQUIRED_SCHEMA)) {
    for (const columnName of definition.columns) {
      columns.push({ tableName, columnName });
    }
    for (const indexName of definition.indexes || []) {
      indexes.push({ tableName, indexName });
    }
    for (const constraintName of definition.foreignKeys || []) {
      foreignKeys.push({ tableName, constraintName });
    }
  }

  return { columns, indexes, foreignKeys };
}

function createQuery(rows = completeRows()) {
  return async (sql) => {
    if (sql.includes('SELECT 1 AS ok')) return [{ ok: 1 }];
    if (sql.includes('INFORMATION_SCHEMA.COLUMNS')) return rows.columns;
    if (sql.includes('INFORMATION_SCHEMA.STATISTICS')) return rows.indexes;
    if (sql.includes('INFORMATION_SCHEMA.TABLE_CONSTRAINTS')) return rows.foreignKeys;
    throw new Error(`unexpected verification query: ${sql}`);
  };
}

test('database verification accepts the required application schema', async () => {
  const result = await verifyDatabase({
    query: createQuery(),
    databaseName: 'MotionAnalysis'
  });

  assert.equal(result.status, 'ready');
  assert.equal(result.database, 'MotionAnalysis');
  assert.ok(result.checkedTables >= 8);
});

test('database verification accepts lowercase table metadata from Windows MySQL', async () => {
  const rows = completeRows();
  rows.columns = rows.columns.map((row) => ({ ...row, tableName: row.tableName.toLowerCase() }));
  rows.indexes = rows.indexes.map((row) => ({ ...row, tableName: row.tableName.toLowerCase() }));
  rows.foreignKeys = rows.foreignKeys.map((row) => ({ ...row, tableName: row.tableName.toLowerCase() }));

  const result = await verifyDatabase({
    query: createQuery(rows),
    databaseName: 'MotionAnalysis'
  });

  assert.equal(result.status, 'ready');
});

test('database verification reports missing security schema with migration guidance', async () => {
  const rows = completeRows();
  rows.columns = rows.columns.filter((row) => !(
    row.tableName === 'LoginAttempts' && row.columnName === 'ip_address'
  ));
  rows.indexes = rows.indexes.filter((row) => row.indexName !== 'IX_SecurityEvents_type_time');

  await assert.rejects(
    verifyDatabase({ query: createQuery(rows), databaseName: 'MotionAnalysis' }),
    (error) => {
      assert.equal(error.code, 'DATABASE_SCHEMA_INCOMPLETE');
      assert.match(error.message, /LoginAttempts\.ip_address/);
      assert.match(error.message, /IX_SecurityEvents_type_time/);
      assert.match(error.message, /17_security_hardening\.sql/);
      return true;
    }
  );
});

test('database verification converts connection failures into actionable startup errors', async () => {
  await assert.rejects(
    verifyDatabase({
      query: async () => {
        throw new Error('connect ECONNREFUSED 127.0.0.1:3306');
      },
      databaseName: 'MotionAnalysis'
    }),
    (error) => {
      assert.equal(error.code, 'DATABASE_UNAVAILABLE');
      assert.match(error.message, /MotionAnalysis/);
      assert.doesNotMatch(error.message, /password/i);
      return true;
    }
  );
});
