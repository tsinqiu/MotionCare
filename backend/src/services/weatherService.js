const { ApiError } = require('../errors');

const WEATHER_CODE_LABELS = {
  0: '晴',
  1: '大部晴朗',
  2: '局部多云',
  3: '多云',
  45: '雾',
  48: '雾凇',
  51: '小毛毛雨',
  53: '毛毛雨',
  55: '大毛毛雨',
  61: '小雨',
  63: '中雨',
  65: '大雨',
  71: '小雪',
  73: '中雪',
  75: '大雪',
  80: '小阵雨',
  81: '阵雨',
  82: '强阵雨',
  95: '雷暴'
};

function findClosestHourIndex(hours, localStartTime) {
  const target = new Date(localStartTime).getTime();
  if (!Number.isFinite(target)) return -1;

  let closestIdx = 0;
  let closestDiff = Infinity;

  for (let i = 0; i < hours.length; i++) {
    const hourTime = new Date(hours[i]).getTime();
    if (!Number.isFinite(hourTime)) continue;
    const diff = Math.abs(hourTime - target);
    if (diff < closestDiff) {
      closestDiff = diff;
      closestIdx = i;
    }
  }

  if (closestDiff > 36000000) {
    return -1;
  }

  return closestIdx;
}

async function fetchHistoricalWeatherForActivity(activity) {
  if (!activity.startLatitude || !activity.startLongitude || !activity.localStartTime) {
    throw new ApiError(400, 'activity location and start time are required', 'WEATHER_LOCATION_MISSING');
  }

  const localDate = String(activity.localStartTime).slice(0, 10);
  const url = new URL('https://archive-api.open-meteo.com/v1/archive');
  url.searchParams.set('latitude', activity.startLatitude);
  url.searchParams.set('longitude', activity.startLongitude);
  url.searchParams.set('start_date', localDate);
  url.searchParams.set('end_date', localDate);
  url.searchParams.set('hourly', 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code');
  url.searchParams.set('timezone', 'auto');

  const response = await fetch(url);
  if (!response.ok) {
    throw new ApiError(502, 'weather api request failed', 'WEATHER_API_ERROR');
  }

  const data = await response.json();
  const hourly = data?.hourly;

  if (!hourly || !Array.isArray(hourly.time) || !hourly.time.length) {
    throw new ApiError(502, 'weather data is empty', 'WEATHER_API_EMPTY');
  }

  const idx = findClosestHourIndex(hourly.time, activity.localStartTime);
  if (idx === -1) {
    throw new ApiError(502, 'could not find weather data for activity time', 'WEATHER_TIME_MISMATCH');
  }

  const weatherCode = hourly.weather_code?.[idx];
  const weatherCondition = weatherCode !== undefined
    ? (WEATHER_CODE_LABELS[weatherCode] || `code ${weatherCode}`)
    : null;

  return {
    weatherCondition,
    temperatureC: hourly.temperature_2m?.[idx] ?? null,
    humidityPercent: hourly.relative_humidity_2m?.[idx] ?? null,
    feelsLikeC: hourly.apparent_temperature?.[idx] ?? null
  };
}

module.exports = {
  fetchHistoricalWeatherForActivity
};
