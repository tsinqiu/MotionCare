const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../src/db');
const shoeService = require('../src/services/shoeService');

test('shoeService.create reads insertId from db.query insert results', async () => {
  const originalQuery = db.query;
  const calls = [];

  db.query = async (sql, params = []) => {
    calls.push({ sql, params });
    return { insertId: 123 };
  };

  try {
    const result = await shoeService.create(7, {
      name: '  Race Day  ',
      brand: 'MotionCare',
      model: 'Smoke',
      purchaseDate: '2026-07-02',
      targetDistanceKm: 800,
      initialDistanceKm: 10,
      price: 499
    });

    assert.equal(result.id, 123);
    assert.equal(result.name, 'Race Day');
    assert.match(calls[0].sql, /INSERT INTO Shoes/);
    assert.deepEqual(calls[0].params, [
      7,
      'Race Day',
      'MotionCare',
      'Smoke',
      '2026-07-02',
      null,
      null,
      null,
      null,
      800,
      10,
      499
    ]);
  } finally {
    db.query = originalQuery;
  }
});
