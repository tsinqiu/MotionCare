const db = require('../src/db');
const weatherService = require('../src/services/weatherService');

async function main() {
  const activities = await db.query(
    `SELECT id, start_latitude AS startLatitude, start_longitude AS startLongitude, local_start_time AS localStartTime
     FROM Activities
     WHERE start_latitude IS NOT NULL AND start_longitude IS NOT NULL
       AND (weather_condition IS NULL AND temperature_c IS NULL)
     ORDER BY local_start_time ASC`
  );

  console.log(`Found ${activities.length} activities needing weather`);

  let done = 0;
  let fail = 0;

  for (const act of activities) {
    try {
      const payload = await weatherService.fetchHistoricalWeatherForActivity(act);
      const { weatherCondition, temperatureC, humidityPercent, feelsLikeC } = payload;
      if (temperatureC !== null || humidityPercent !== null || feelsLikeC !== null) {
        await db.query(
          `UPDATE Activities SET weather_condition = ?, temperature_c = ?, humidity_percent = ?, feels_like_c = ?, weather_source = 'open_meteo', weather_updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [weatherCondition, temperatureC, humidityPercent, feelsLikeC, act.id]
        );
      }
      done++;
    } catch (err) {
      fail++;
    }

    if ((done + fail) % 50 === 0) {
      console.log(`Progress: ${done} done, ${fail} failed / ${activities.length}`);
    }
  }

  console.log(`Backfill complete: ${done} success, ${fail} failed`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
