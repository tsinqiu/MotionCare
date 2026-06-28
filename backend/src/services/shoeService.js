const db = require('../db');

function paceLabel(avgPaceSecPerKm) {
  if (avgPaceSecPerKm == null || avgPaceSecPerKm === 0) return null;
  const min = Math.floor(avgPaceSecPerKm / 60);
  const sec = Math.round(avgPaceSecPerKm % 60);
  return `${min}:${String(sec).padStart(2, '0')} /km`;
}

async function list(userId) {
  return db.query(
    `SELECT s.id, s.name, s.brand, s.model, s.purchase_date AS purchaseDate,
      s.distance_km AS distanceKm, s.is_retired AS isRetired,
      s.photo_path AS photoPath,
      s.target_distance_km AS targetDistanceKm,
      s.initial_distance_km AS initialDistanceKm,
      s.price,
      COUNT(a.id) AS activityCount,
      MAX(a.local_start_time) AS lastUsed,
      ROUND(COALESCE(SUM(js.distance_m), 0) / 1000, 2) AS boundDistanceKm,
      ROUND(AVG(js.duration_s / NULLIF(js.distance_m / 1000, 0)), 2) AS avgPaceSecPerKm
    FROM Shoes s
    LEFT JOIN Activities a ON a.shoe_id = s.id
    LEFT JOIN ActivitySummaries js ON js.activity_id = a.id
    WHERE s.user_id = ?
    GROUP BY s.id
    ORDER BY s.is_retired, s.created_at DESC`,
    [userId]
  );
}

async function create(userId, body) {
  const { name, brand, model, purchaseDate, photoPath, photoOriginalName, photoMimeType, photoSizeBytes,
    targetDistanceKm, initialDistanceKm, price } = body;
  if (!name || !name.trim()) throw Object.assign(new Error('name is required'), { status: 400 });
  const [r] = await db.query(
    `INSERT INTO Shoes (user_id, name, brand, model, purchase_date, photo_path, photo_original_name, photo_mime_type, photo_size_bytes,
      target_distance_km, initial_distance_km, price)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, name.trim(), brand || null, model || null, purchaseDate || null,
      photoPath || null, photoOriginalName || null, photoMimeType || null, photoSizeBytes || null,
      targetDistanceKm || null, initialDistanceKm || 0, price || null]
  );
  return { id: r.insertId, name: name.trim(), brand, model, purchaseDate };
}

async function getById(shoeId, userId) {
  const rows = await db.query(
    `SELECT s.id, s.name, s.brand, s.model, s.purchase_date AS purchaseDate,
      s.distance_km AS distanceKm, s.is_retired AS isRetired,
      s.photo_path AS photoPath,
      s.target_distance_km AS targetDistanceKm,
      s.initial_distance_km AS initialDistanceKm,
      s.price
    FROM Shoes s
    WHERE s.id = ? AND s.user_id = ?`,
    [shoeId, userId]
  );
  return rows[0] || null;
}

async function updateShoe(userId, shoeId, body) {
  const sets = []; const params = [];
  if (body.name !== undefined) { sets.push('name = ?'); params.push(body.name); }
  if (body.brand !== undefined) { sets.push('brand = ?'); params.push(body.brand); }
  if (body.model !== undefined) { sets.push('model = ?'); params.push(body.model); }
  if (body.purchaseDate !== undefined) { sets.push('purchase_date = ?'); params.push(body.purchaseDate); }
  if (body.isRetired !== undefined) { sets.push('is_retired = ?'); params.push(body.isRetired); }
  if (body.distanceKm !== undefined) { sets.push('distance_km = ?'); params.push(body.distanceKm); }
  if (body.targetDistanceKm !== undefined) { sets.push('target_distance_km = ?'); params.push(body.targetDistanceKm); }
  if (body.initialDistanceKm !== undefined) { sets.push('initial_distance_km = ?'); params.push(body.initialDistanceKm); }
  if (body.price !== undefined) { sets.push('price = ?'); params.push(body.price); }
  if (!sets.length) return null;
  params.push(shoeId, userId);
  await db.query(`UPDATE Shoes SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`, params);
  return getById(shoeId, userId);
}

async function remove(userId, shoeId) {
  await db.query('DELETE FROM Shoes WHERE id = ? AND user_id = ?', [shoeId, userId]);
}

async function bindActivity(userId, activityId, shoeId) {
  if (shoeId !== null && shoeId !== undefined) {
    const shoes = await db.query('SELECT id FROM Shoes WHERE id = ? AND user_id = ?', [shoeId, userId]);
    if (!shoes.length) {
      const err = new Error('shoe not found or does not belong to current user');
      err.status = 404;
      throw err;
    }
  }

  await db.query(
    'UPDATE Activities SET shoe_id = ? WHERE id = ? AND owner_user_id = ?',
    [shoeId || null, activityId, userId]
  );
}

async function getActivities(userId, shoeId) {
  const shoes = await db.query('SELECT id FROM Shoes WHERE id = ? AND user_id = ?', [shoeId, userId]);
  if (!shoes.length) {
    const err = new Error('shoe not found');
    err.status = 404;
    throw err;
  }

  return db.query(
    `SELECT
      a.id,
      a.activity_name AS activityName,
      a.activity_type AS activityType,
      a.local_start_time AS localStartTime,
      a.perceived_effort AS perceivedEffort,
      a.photo_path AS photoPath,
      ROUND(js.distance_m, 2) AS distanceM,
      js.duration_s AS durationS,
      js.calories,
      js.avg_speed_mps AS avgSpeedMps
    FROM Activities a
    LEFT JOIN ActivitySummaries js ON js.activity_id = a.id
    WHERE a.shoe_id = ?
    ORDER BY a.local_start_time DESC`,
    [shoeId]
  );
}

async function updatePhoto(userId, shoeId, fileInfo) {
  const shoes = await db.query('SELECT id FROM Shoes WHERE id = ? AND user_id = ?', [shoeId, userId]);
  if (!shoes.length) {
    const err = new Error('shoe not found');
    err.status = 404;
    throw err;
  }

  await db.query(
    `UPDATE Shoes SET photo_path = ?, photo_original_name = ?, photo_mime_type = ?, photo_size_bytes = ? WHERE id = ?`,
    [fileInfo.path, fileInfo.originalName || null, fileInfo.mimeType || null, fileInfo.size != null ? Number(fileInfo.size) : null, shoeId]
  );

  return { id: shoeId, photoPath: fileInfo.path };
}

module.exports = { list, create, getById, updateShoe, remove, bindActivity, getActivities, updatePhoto };
