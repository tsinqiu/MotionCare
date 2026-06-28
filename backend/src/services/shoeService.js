const db = require('../db');

async function list(userId) {
  return db.query(
    `SELECT s.id, s.name, s.brand, s.model, s.purchase_date AS purchaseDate,
      s.distance_km AS distanceKm, s.is_retired AS isRetired,
      COUNT(a.id) AS activityCount,
      MAX(a.local_start_time) AS lastUsed
    FROM Shoes s
    LEFT JOIN Activities a ON a.shoe_id = s.id
    WHERE s.user_id = ?
    GROUP BY s.id
    ORDER BY s.is_retired, s.created_at DESC`,
    [userId]
  );
}

async function create(userId, body) {
  const { name, brand, model, purchaseDate } = body;
  if (!name || !name.trim()) throw Object.assign(new Error('name is required'), { status: 400 });
  const [r] = await db.query(
    'INSERT INTO Shoes (user_id, name, brand, model, purchase_date) VALUES (?, ?, ?, ?, ?)',
    [userId, name.trim(), brand || null, model || null, purchaseDate || null]
  );
  return { id: r.insertId, name: name.trim(), brand, model, purchaseDate };
}

async function updateShoe(userId, shoeId, body) {
  const sets = []; const params = [];
  if (body.name !== undefined) { sets.push('name = ?'); params.push(body.name); }
  if (body.brand !== undefined) { sets.push('brand = ?'); params.push(body.brand); }
  if (body.model !== undefined) { sets.push('model = ?'); params.push(body.model); }
  if (body.purchaseDate !== undefined) { sets.push('purchase_date = ?'); params.push(body.purchaseDate); }
  if (body.isRetired !== undefined) { sets.push('is_retired = ?'); params.push(body.isRetired); }
  if (body.distanceKm !== undefined) { sets.push('distance_km = ?'); params.push(body.distanceKm); }
  if (!sets.length) return null;
  params.push(shoeId, userId);
  await db.query(`UPDATE Shoes SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`, params);
  return { id: shoeId };
}

async function remove(userId, shoeId) {
  await db.query('DELETE FROM Shoes WHERE id = ? AND user_id = ?', [shoeId, userId]);
}

async function bindActivity(userId, activityId, shoeId) {
  await db.query(
    'UPDATE Activities SET shoe_id = ? WHERE id = ? AND owner_user_id = ?',
    [shoeId || null, activityId, userId]
  );
}

module.exports = { list, create, updateShoe, remove, bindActivity };
