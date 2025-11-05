// utils/sunCalc.ts
// ------------------------------------------------------
// This file calculates sunrise and sunset times (UTC)
// using the NOAA Solar Position Algorithm.
// ------------------------------------------------------

// Helper: convert degrees to radians
function degToRad(deg: number) {
  return (deg * Math.PI) / 180;
}

// Helper: convert radians to degrees
function radToDeg(rad: number) {
  return (rad * 180) / Math.PI;
}

// Convert date to Julian Day (used in astronomy formulas)
function getJulianDay(date: Date) {
  const time = date.getTime();
  return time / 86400000 + 2440587.5; // UNIX epoch to Julian
}

// Convert Julian Day to centuries since J2000
function getJulianCentury(jd: number) {
  return (jd - 2451545.0) / 36525.0;
}

// Return the equation of center and mean anomaly of the Sun
function getSunEquation(T: number) {
  const M = (357.52911 + T * (35999.05029 - 0.0001537 * T)) % 360;
  const Mrad = degToRad(M);
  const C =
    Math.sin(Mrad) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(2 * Mrad) * (0.019993 - 0.000101 * T) +
    Math.sin(3 * Mrad) * 0.000289;
  const trueLong = M + C + 180 + 102.9372; // 102.9372 = perihelion of Earth
  return { M, trueLong };
}

// Calculate the Sun’s declination (angle above/below equator)
function getSunDeclination(T: number) {
  const { trueLong } = getSunEquation(T);
  const lambda = degToRad(trueLong);
  const epsilon = degToRad(23.439 - 0.00000036 * T); // axial tilt
  return Math.asin(Math.sin(epsilon) * Math.sin(lambda));
}

// Calculate solar noon (UTC, fractional hours)
function getSolarNoonUTC(julianDay: number, lon: number) {
  const T = getJulianCentury(julianDay - lon / 360);
  const eqTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(degToRad(357.52911 + T * 35999.05029)) -
      0.032077 * Math.sin(degToRad(357.52911 + T * 35999.05029)) -
      0.014615 * Math.cos(2 * degToRad(357.52911 + T * 35999.05029)) -
      0.040849 * Math.sin(2 * degToRad(357.52911 + T * 35999.05029)));
  return 720 - 4 * lon - eqTime; // minutes from midnight UTC
}

// Main function: calculate sunrise/sunset for a given date & location
export function calculateSunTimes(
  lat: number,
  lon: number,
  date: Date
): { sunriseUTC: string; sunsetUTC: string; daylightHours: number } {
  const jd = getJulianDay(date);
  const T = getJulianCentury(jd);

  // Sun declination
  const decl = getSunDeclination(T);

  // Hour angle for sunrise/sunset
  const latRad = degToRad(lat);
  const cosH = (Math.cos(degToRad(90.833)) - Math.sin(latRad) * Math.sin(decl)) /
               (Math.cos(latRad) * Math.cos(decl));

  // Handle polar regions (no sunrise/sunset)
  if (cosH > 1) {
    return { sunriseUTC: 'No sunrise', sunsetUTC: 'No sunrise', daylightHours: 0 };
  } else if (cosH < -1) {
    return { sunriseUTC: 'No sunset', sunsetUTC: 'No sunset', daylightHours: 24 };
  }

  const H = radToDeg(Math.acos(cosH)) / 15; // in hours

  // Solar noon in minutes UTC
  const solarNoon = getSolarNoonUTC(jd, lon);
  const solarNoonHours = solarNoon / 60;

  // Sunrise/sunset in UTC (hours)
  const sunriseUTC = solarNoonHours - H;
  const sunsetUTC = solarNoonHours + H;

  // Convert fractional hours to hh:mm format
  const formatTime = (t: number) => {
    const hours = Math.floor(t);
    const minutes = Math.round((t - hours) * 60);
    const h = ((hours % 24) + 24) % 24; // ensure positive
    const hh = h.toString().padStart(2, '0');
    const mm = minutes.toString().padStart(2, '0');
    return `${hh}:${mm}`;
  };

  const daylightHours = (sunsetUTC - sunriseUTC + 24) % 24;

  return {
    sunriseUTC: formatTime(sunriseUTC),
    sunsetUTC: formatTime(sunsetUTC),
    daylightHours,
  };
}
