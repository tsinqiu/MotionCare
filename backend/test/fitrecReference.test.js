const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const scriptPath = path.resolve(__dirname, '../ml/analyze_fitrec_reference.py');

function writeFixture(directory) {
  const inputPath = path.join(directory, 'endomondoHR.fixture');
  const baseRun = {
    sport: 'run',
    userId: 42,
    gender: 'male',
    timestamp: [1000, 1300, 1600, 1900],
    latitude: [31.0, 31.01, 31.02, 31.03],
    longitude: [120.0, 120.0, 120.0, 120.0],
    altitude: [5, 7, 9, 8],
    heart_rate: [120, 145, 155, 250]
  };
  const records = [
    baseRun,
    { ...baseRun, userId: 42, timestamp: [2000, 2300, 2600, 2900], heart_rate: [118, 135, 142, 150] },
    { ...baseRun, userId: 7, timestamp: [3000, 3010], latitude: [31.0, 31.0001], longitude: [120.0, 120.0] },
    { ...baseRun, sport: 'bike' },
    { sport: 'run', userId: 8, timestamp: [1, 2, 3], heart_rate: [90, 100, 110] }
  ];
  fs.writeFileSync(inputPath, records.map((record) => JSON.stringify(record).replaceAll('"', "'")).join('\n'), 'utf8');
  return inputPath;
}

test('FitRec reference script parses Python-literal Endomondo records and writes aggregate report', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fitrec-reference-'));
  const inputPath = writeFixture(directory);
  const outputPath = path.join(directory, 'fitrec_reference_report.json');

  const result = spawnSync(
    'python',
    [scriptPath, '--input', inputPath, '--out', outputPath, '--min-activities', '2', '--max-avg-pace-min-km', '12'],
    { encoding: 'utf8' }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'));

  assert.equal(report.source, 'FitRec/Endomondo HR offline reference, academic use only');
  assert.equal(report.counts.validRunningActivities, 2);
  assert.equal(report.counts.similarUsers, 1);
  assert.equal(report.counts.referenceActivities, 2);
  assert.equal(report.quality.valid_run, 2);
  assert.equal(report.quality.too_short, 1);
  assert.equal(report.quality.non_run, 1);
  assert.equal(report.quality.missing_gps_distance, 1);
  assert.ok(report.similarActivityDistribution.paceMinKm.p50 > 0);
  assert.ok(report.similarActivityDistribution.avgHeartRate.p50 > 0);
});
