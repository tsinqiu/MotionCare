const db = require('../src/db');
const { verifyDatabase } = require('../src/services/databaseVerificationService');

async function main() {
  try {
    const result = await verifyDatabase();
    console.log(`Database ${result.database} is ready (${result.checkedTables} tables checked).`);
  } finally {
    await db.closePool();
  }
}

main().catch((error) => {
  console.error(`${error.code || 'DATABASE_VERIFY_FAILED'}: ${error.message}`);
  process.exitCode = 1;
});
