import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { calculateSunTimes } from '../../../utils/sunCalc';

// --- Supabase client ---
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ---------- helpers ----------
function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
function minutesToHHMM(mins) {
  const m = ((mins % 1440) + 1440) % 1440;
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}
function clampToDayWindow(start, end) {
  const s = Math.max(start, 0);
  const e = Math.min(end, 1440);
  return e > s ? [s, e] : null;
}
function getOffsetHoursForDate(timezone, dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'shortOffset',
  }).formatToParts(d);
  const offsetStr = parts.find(p => p.type === 'timeZoneName')?.value || '';
  const match = offsetStr.match(/GMT([+-]\d{1,2})(?::?(\d{2}))?/);
  if (!match) return 0;
  const hours = parseInt(match[1], 10);
  const mins = match[2] ? parseInt(match[2], 10) : 0;
  return hours + mins / 60;
}

// ---------- build intervals ----------
function buildIntervalsForOneDay(sunriseMin, sunsetMin) {
  if (
    typeof sunriseMin !== 'number' ||
    typeof sunsetMin !== 'number' ||
    Number.isNaN(sunriseMin) ||
    Number.isNaN(sunsetMin)
  ) return { daylight: [], nighttime: [] };

  if (sunsetMin > sunriseMin) {
    return {
      daylight: [[sunriseMin, sunsetMin]],
      nighttime: [[0, sunriseMin], [sunsetMin, 1440]],
    };
  }
  return {
    daylight: [[sunriseMin, 1440], [0, sunsetMin]],
    nighttime: [[sunsetMin, sunriseMin]],
  };
}

// ---------- continuous 3-day intervals ----------
function buildContinuousIntervals(sunResultsYesterday, sunResultsToday, sunResultsTomorrow) {
  const days = [sunResultsYesterday, sunResultsToday, sunResultsTomorrow];
  const offsets = [-1440, 0, 1440];
  const out = { daylight: [], nighttime: [] };

  days.forEach((res, i) => {
    if (!res?.sunriseUTC || !res?.sunsetUTC) return;
    const sunrise = toMinutes(res.sunriseUTC);
    const sunset = toMinutes(res.sunsetUTC);
    const base = buildIntervalsForOneDay(sunrise, sunset);
    const off = offsets[i];
    base.daylight.forEach(([s, e]) => out.daylight.push([s + off, e + off]));
    base.nighttime.forEach(([s, e]) => out.nighttime.push([s + off, e + off]));
  });
  return out;
}

// ---------- find overlap segments across 3 days (with UTC + local times) ----------
// ---------- find overlap segments across 3 days (with UTC + local times + offsets) ----------
function findOverlapSegments(intervalsA, intervalsB, d0, fromTZ, toTZ) {
  const rawSegments = [];

  // Find all overlapping intervals across the 3-day continuous UTC window
  for (const [aStart, aEnd] of intervalsA) {
    for (const [bStart, bEnd] of intervalsB) {
      const start = Math.max(aStart, bStart);
      const end = Math.min(aEnd, bEnd);
      if (end > start) rawSegments.push([start, end]);
    }
  }

  if (rawSegments.length === 0) {
    return { overlap: false, totalMinutes: 0, segments: [] };
  }

  // Sort and merge overlapping segments
  rawSegments.sort((x, y) => x[0] - y[0]);
  const merged = [];
  let cur = rawSegments[0].slice();
  for (let i = 1; i < rawSegments.length; i++) {
    const [s, e] = rawSegments[i];
    if (s <= cur[1]) cur[1] = Math.max(cur[1], e);
    else { merged.push(cur); cur = [s, e]; }
  }
  merged.push(cur);

  // Helper: get numeric UTC offset in hours for a given timezone/date
  // Helper: get numeric UTC offset in hours for a given timezone/date
  const getOffsetHours = (tz, dateObj) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    }).formatToParts(dateObj);
    const tzPart = parts.find(p => p.type === 'timeZoneName')?.value || '';

    // Try multiple possible patterns: GMT+4, UTC+04:00, GMT+0530, etc.
    const regex = /([+-]\d{1,2})(?::?(\d{2}))?/;
    const match = tzPart.match(regex);
    if (!match) return 0;

    const hours = parseInt(match[1], 10);
    const mins = match[2] ? parseInt(match[2], 10) : 0;
    return hours + mins / 60;
  };


  // Convert to UTC + local datetime segments
  const total = merged.reduce((sum, [s, e]) => sum + (e - s), 0);
  const segments = merged.map(([s, e]) => {
    const startUTCDate = new Date(d0.getTime() + s * 60000);
    const endUTCDate = new Date(d0.getTime() + e * 60000);

    const fmtLocal = (d, tz) =>
      d.toLocaleString('sv-SE', {
        timeZone: tz,
        timeZoneName: 'shortOffset',
      }).replace(' ', 'T'); // ISO-like format

    const fromOffset = getOffsetHours(fromTZ, startUTCDate);
    const toOffset = getOffsetHours(toTZ, startUTCDate);

    return {
      startUTC: startUTCDate.toISOString(),
      endUTC: endUTCDate.toISOString(),
      minutes: e - s,
      fromStartLocal: fmtLocal(startUTCDate, fromTZ),
      fromEndLocal: fmtLocal(endUTCDate, fromTZ),
      toStartLocal: fmtLocal(startUTCDate, toTZ),
      toEndLocal: fmtLocal(endUTCDate, toTZ),
      fromOffsetHours: fromOffset,
      toOffsetHours: toOffset,
      spansMidnightUTC: startUTCDate.getUTCDate() !== endUTCDate.getUTCDate()
    };
  });

  return {
    overlap: true,
    totalMinutes: total,
    segments
  };
}

// ---------- fetch airport ----------
async function getAirportByIATA(iata) {
  const code = String(iata || '').toUpperCase();
  const { data, error } = await supabase
    .from('airports')
    .select('name, country, latitude, longitude, timezone, iata')
    .eq('iata', code)
    .single();
  if (error || !data) throw new Error(`Airport not found for ${code}`);
  return data;
}

// ---------- helper to structure sunrise/sunset in UTC + local ----------
function makeSunTimes(dateObjs, sunResults, tz) {
  const fmtUTC = (d, t) => `${d}T${t}:00Z`;
  const makeLocal = (d, t) =>
    new Date(fmtUTC(d, t)).toLocaleString('sv-SE', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    });

  return [
    {
      date: dateObjs.dM1.toISOString().slice(0, 10),
      sunriseUTC: fmtUTC(dateObjs.dM1.toISOString().slice(0, 10), sunResults.m1.sunriseUTC),
      sunsetUTC: fmtUTC(dateObjs.dM1.toISOString().slice(0, 10), sunResults.m1.sunsetUTC),
      sunriseLocal: makeLocal(dateObjs.dM1.toISOString().slice(0, 10), sunResults.m1.sunriseUTC),
      sunsetLocal: makeLocal(dateObjs.dM1.toISOString().slice(0, 10), sunResults.m1.sunsetUTC),
    },
    {
      date: dateObjs.d0.toISOString().slice(0, 10),
      sunriseUTC: fmtUTC(dateObjs.d0.toISOString().slice(0, 10), sunResults._0.sunriseUTC),
      sunsetUTC: fmtUTC(dateObjs.d0.toISOString().slice(0, 10), sunResults._0.sunsetUTC),
      sunriseLocal: makeLocal(dateObjs.d0.toISOString().slice(0, 10), sunResults._0.sunriseUTC),
      sunsetLocal: makeLocal(dateObjs.d0.toISOString().slice(0, 10), sunResults._0.sunsetUTC),
    },
    {
      date: dateObjs.dP1.toISOString().slice(0, 10),
      sunriseUTC: fmtUTC(dateObjs.dP1.toISOString().slice(0, 10), sunResults.p1.sunriseUTC),
      sunsetUTC: fmtUTC(dateObjs.dP1.toISOString().slice(0, 10), sunResults.p1.sunsetUTC),
      sunriseLocal: makeLocal(dateObjs.dP1.toISOString().slice(0, 10), sunResults.p1.sunriseUTC),
      sunsetLocal: makeLocal(dateObjs.dP1.toISOString().slice(0, 10), sunResults.p1.sunsetUTC),
    },
  ];
}

// ---------- main API route ----------
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const fromCode = (searchParams.get('from') || '').toUpperCase();
    const toCode = (searchParams.get('to') || '').toUpperCase();
    const dateStr = searchParams.get('date');

    if (!fromCode || !toCode)
      return NextResponse.json(
        { error: 'Use ?from=DXB&to=SYD&date=YYYY-MM-DD (date optional)' },
        { status: 400 }
      );

    const d0 = dateStr
      ? new Date(dateStr + 'T00:00:00Z')
      : new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
    const dM1 = new Date(d0.getTime() - 86400000);
    const dP1 = new Date(d0.getTime() + 86400000);
    
    // --- Dynamic UTC window calculation ---
    const fromOffset = getOffsetHoursForDate(await (await getAirportByIATA(fromCode)).timezone, dateStr);
    const toOffset = getOffsetHoursForDate(await (await getAirportByIATA(toCode)).timezone, dateStr);
    
    const fromStartUTC = new Date(`${dateStr}T00:00:00Z`);
    fromStartUTC.setUTCHours(fromStartUTC.getUTCHours() - fromOffset);
    const fromEndUTC = new Date(fromStartUTC.getTime() + 24 * 60 * 60 * 1000);
    
    const toStartUTC = new Date(`${dateStr}T00:00:00Z`);
    toStartUTC.setUTCHours(toStartUTC.getUTCHours() - toOffset);
    const toEndUTC = new Date(toStartUTC.getTime() + 24 * 60 * 60 * 1000);
    
    const windowStartUTC = new Date(Math.min(fromStartUTC, toStartUTC));
    const windowEndUTC = new Date(Math.max(fromEndUTC, toEndUTC));



    const [A, B] = await Promise.all([
      getAirportByIATA(fromCode),
      getAirportByIATA(toCode),
    ]);
    
    const fromOffset = getOffsetHoursForDate(A.timezone, dateStr);
    const toOffset = getOffsetHoursForDate(B.timezone, dateStr);
    
    const fromStartUTC = new Date(`${dateStr}T00:00:00Z`);
    fromStartUTC.setUTCHours(fromStartUTC.getUTCHours() - fromOffset);
    const fromEndUTC = new Date(fromStartUTC.getTime() + 24 * 60 * 60 * 1000);
    
    const toStartUTC = new Date(`${dateStr}T00:00:00Z`);
    toStartUTC.setUTCHours(toStartUTC.getUTCHours() - toOffset);
    const toEndUTC = new Date(toStartUTC.getTime() + 24 * 60 * 60 * 1000);
    
    const utcWindowStart = new Date(Math.min(fromStartUTC, toStartUTC));
    const utcWindowEnd = new Date(Math.max(fromEndUTC, toEndUTC));


    const [A_m1, A_0, A_p1] = [
      calculateSunTimes(A.latitude, A.longitude, dM1),
      calculateSunTimes(A.latitude, A.longitude, d0),
      calculateSunTimes(A.latitude, A.longitude, dP1),
    ];
    const [B_m1, B_0, B_p1] = [
      calculateSunTimes(B.latitude, B.longitude, dM1),
      calculateSunTimes(B.latitude, B.longitude, d0),
      calculateSunTimes(B.latitude, B.longitude, dP1),
    ];

    const AIntervals = buildContinuousIntervals(A_m1, A_0, A_p1);
    const BIntervals = buildContinuousIntervals(B_m1, B_0, B_p1);

    const daylight = findOverlapSegments(AIntervals.daylight, BIntervals.daylight, d0, A.timezone, B.timezone);
    const nighttime = findOverlapSegments(AIntervals.nighttime, BIntervals.nighttime, d0, A.timezone, B.timezone);

    return NextResponse.json({
    meta: {
      requestedDateLocal: dateStr,
      utcWindowStart: windowStartUTC.toISOString(),
      utcWindowEnd: windowEndUTC.toISOString(),
      utcDurationMinutes: (windowEndUTC - windowStartUTC) / 60000,
    },


      from: {
        code: A.iata,
        name: A.name,
        country: A.country,
        timezone: A.timezone,
        sunTimes: makeSunTimes({ dM1, d0, dP1 }, { m1: A_m1, _0: A_0, p1: A_p1 }, A.timezone),
      },
      to: {
        code: B.iata,
        name: B.name,
        country: B.country,
        timezone: B.timezone,
        sunTimes: makeSunTimes({ dM1, d0, dP1 }, { m1: B_m1, _0: B_0, p1: B_p1 }, B.timezone),
      },
      overlap: { daylight, nighttime },
    });

  } catch (e) {
    return NextResponse.json({ error: e.message || 'Unknown error' }, { status: 500 });
  }
}
