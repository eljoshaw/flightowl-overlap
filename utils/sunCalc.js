// utils/sunCalc.js
// Sunrise/Sunset (UTC) using NOAA-like approach

function degToRad(deg) { return (deg * Math.PI) / 180; }
function radToDeg(rad) { return (rad * 180) / Math.PI; }

function getJulianDay(date) {
  const time = date.getTime();
  return time / 86400000 + 2440587.5; // UNIX epoch -> Julian
}

function getJulianCentury(jd) {
  return (jd - 2451545.0) / 36525.0;
}

function getSunEquation(T) {
  const M = (357.52911 + T * (35999.05029 - 0.0001537 * T)) % 360;
  const Mrad = degToRad(M);
  const C =
    Math.sin(Mrad) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(2 * Mrad) * (0.019993 - 0.000101 * T) +
    Math.sin(3 * Mrad) * 0.000289;
  const trueLong = M + C + 180 + 102.9372; // perihelion term
  return { M, trueLong };
}

function getSunDeclination(T) {
  const { trueLong } = getSunEquation(T);
  const lambda = degToRad(trueLong);
  const epsilon = degToRad(23.439 - 0.00000036 * T);
  return Math.asin(Math.sin(epsilon) * Math.sin(lambda));
}

function getSolarNoonUTC(julianDay, lon) {
  const T = getJulianCentury(julianDay - lon / 360);
  const M = degToRad(357.52911 + T * 35999.05029);
  const eqTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(M) -
      0.032077 * Math.sin(M) -
      0.014615 * Math.cos(2 * M) -
      0.040849 * Math.sin(2 * M));
  return 720 - 4 * lon - eqTime; // minutes from midnight UTC
}

// Main: compute UTC sunrise/sunset for date+lat/lon
export function calculateSunTimes(lat, lon, date) {
  const jd = getJulianDay(date);
  const T = getJulianCentury(jd);
  const decl = getSunDeclination(T);

  const latRad = degToRad(lat);
  const cosH =
    (Math.cos(degToRad(90.833)) - Math.sin(latRad) * Math.sin(decl)) /
    (Math.cos(latRad) * Math.cos(decl));

  if (cosH > 1) return { sunriseUTC: 'No sunrise', sunsetUTC: 'No sunrise', daylightHours: 0 };
  if (cosH < -1) return { sunriseUTC: 'No sunset', sunsetUTC: 'No sunset', daylightHours: 24 };

  const H = radToDeg(Math.acos(cosH)) / 15; // hours
  const solarNoonMin = getSolarNoonUTC(jd, lon);
  const solarNoonHours = solarNoonMin / 60;

  const sunriseH = solarNoonHours - H;
  const sunsetH  = solarNoonHours + H;

  const fmt = (t) => {
    const hours = Math.floor(t);
    const minutes = Math.round((t - hours) * 60);
    const h = ((hours % 24) + 24) % 24;
    return `${String(h).padStart(2,'0')}:${String(minutes).padStart(2,'0')}`;
    // (UTC hh:mm)
  };

  const daylightHours = (sunsetH - sunriseH + 24) % 24;

  return {
    sunriseUTC: fmt(sunriseH),
    sunsetUTC: fmt(sunsetH),
    daylightHours
  };
}
