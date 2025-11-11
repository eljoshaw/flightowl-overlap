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
  )
    return { daylight: [], nighttime: [] };

  if (sunsetMin > sunriseMin) {
    return {
      daylight: [[sunriseMin, sunsetMin]],
      nighttime: [
        [0, sunriseMin],
        [sunsetMin, 1440],
      ],
    };
  }
  return {
    daylight: [
      [sunriseMin, 1440],
      [0, sunsetMin],
    ],
    nighttime: [[sunsetMin, sunriseMin]],
  };
}

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

// ---------- find overlap segments ----------
function findOverlapSegments(intervalsA, intervalsB, d0, fromTZ, toTZ) {
  const rawSegments = [];

  for (const [aStart, aEnd] of intervalsA) {
    for (const [bStart, bEnd] of intervalsB) {
      const start = Math.max(aStart, bStart);
      const end = Math.min(aEnd, bEnd);
      if (end > start) rawSegments.push([start, end]);
    }
  }

  if (rawSegments.length === 0)
    return { overlap: false, totalMinutes: 0, segments: [] };

  rawSegments.sort((x, y) => x[0] - y[0]);
  const merged = [];
  let cur = rawSegments[0].slice();
  for (let i = 1; i < rawSegments.length; i++) {
    const [s, e] = rawSegments[i];
    if (s <= cur[1]) cur[1] = Math.max(cur[1], e);
    else {
      merged.push(cur);
      cur = [s, e];
    }
  }
  merged.push(cur);

  const getOffsetHours = (tz, dateObj) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    }).formatToParts(dateObj);
    const tzPart = parts.find(p => p.type === 'timeZoneName')?.value || '';
    const regex = /([+-]\d{1,2})(?::?(\d{2}))?/;
    const match = tzPart.match(regex);
    if (!match) return 0;
    const hours = parseInt(match[1], 10);
    const mins = match[2] ? parseInt(match[2], 10) : 0;
    return hours + mins / 60;
  };

  const total = merged.reduce((sum, [s, e]) => sum + (e - s), 0);
  const segments = merged.map(([s, e]) => {
    const startUTCDate = new Date(d0.getTime() + s * 60000);
    const endUTCDate = new Date(d0.getTime() + e * 60000);
    const fmtLocal = (d, tz) =>
      d
        .toLocaleString('sv-SE', {
          timeZone: tz,
          timeZoneName: 'shortOffset',
        })
        .replace(' ', 'T');

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
      spansMidnightUTC: startUTCDate.getUTCDate() !== endUTCDate.getUTCDate(),
    };
  });

  return { overlap: true, totalMinutes: total, segments };
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

// ---------- timezone translation helper ----------
function translateToOtherTZ(utcISO, otherTZ) {
  const d = new Date(utcISO);
  return d.toLocaleString('sv-SE', {
    timeZone: otherTZ,
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'shortOffset',
  });
}

// ---------- sunrise/sunset builder with cross-translation ----------
function makeSunTimes(dateObjs, sunResults, tz, otherTZ, otherCode) {
  const fmtUTC = (d, t) => `${d}T${t}:00Z`;
  const makeLocal = (d, t, zone) =>
    new Date(fmtUTC(d, t)).toLocaleString('sv-SE', {
      timeZone: zone,
      timeZoneName: 'shortOffset',
    });

  return [
    ...['m1', '_0', 'p1'].map((key, i) => {
      const date = [dateObjs.dM1, dateObjs.d0, dateObjs.dP1][i];
      const r = sunResults[key];
      const sunriseUTC = fmtUTC(date.toISOString().slice(0, 10), r.sunriseUTC);
      const sunsetUTC = fmtUTC(date.toISOString().slice(0, 10), r.sunsetUTC);
      return {
        date: date.toISOString().slice(0, 10),
        sunriseUTC,
        sunsetUTC,
        sunriseLocal: makeLocal(date.toISOString().slice(0, 10), r.sunriseUTC, tz),
        sunsetLocal: makeLocal(date.toISOString().slice(0, 10), r.sunsetUTC, tz),
        // translated into the other airport's timezone
        translatedForOther: {
          sunriseLabel: `${otherCode} Sunrise`,
          sunriseLocal: translateToOtherTZ(sunriseUTC, otherTZ),
          sunsetLabel: `${otherCode} Sunset`,
          sunsetLocal: translateToOtherTZ(sunsetUTC, otherTZ),
        },
      };
    }),
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
      ? new Date(`${dateStr}T00:00:00Z`)
      : new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
    const dM1 = new Date(d0.getTime() - 86400000);
    const dP1 = new Date(d0.getTime() + 86400000);

    const [A, B] = await Promise.all([
      getAirportByIATA(fromCode),
      getAirportByIATA(toCode),
    ]);

    const fromOffset = getOffsetHoursForDate(A.timezone, dateStr);
    const toOffset = getOffsetHoursForDate(B.timezone, dateStr);

    const fromDayStartUTC = new Date(`${dateStr}T00:00:00Z`);
    fromDayStartUTC.setUTCHours(fromDayStartUTC.getUTCHours() - fromOffset);
    const fromDayEndUTC = new Date(fromDayStartUTC.getTime() + 24 * 60 * 60 * 1000);

    const toDayStartUTC = new Date(`${dateStr}T00:00:00Z`);
    toDayStartUTC.setUTCHours(toDayStartUTC.getUTCHours() - toOffset);
    const toDayEndUTC = new Date(toDayStartUTC.getTime() + 24 * 60 * 60 * 1000);

    const utcWindowStart = new Date(Math.min(fromDayStartUTC, toDayStartUTC));
    const utcWindowEnd = new Date(Math.max(fromDayEndUTC, toDayEndUTC));

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

    const daylight = findOverlapSegments(
      AIntervals.daylight,
      BIntervals.daylight,
      d0,
      A.timezone,
      B.timezone
    );
    const nighttime = findOverlapSegments(
      AIntervals.nighttime,
      BIntervals.nighttime,
      d0,
      A.timezone,
      B.timezone
    );

    function getLocalMidnightUTC(dateStr, tz, offsetDays = 0) {
      const localDate = new Date(`${dateStr}T00:00:00`);
      localDate.setUTCDate(localDate.getUTCDate() + offsetDays);
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        timeZoneName: 'shortOffset',
      }).formatToParts(localDate);
      const tzPart = parts.find(p => p.type === 'timeZoneName')?.value || 'UTC';
      const match = tzPart.match(/([+-]\d{1,2})(?::?(\d{2}))?/);
      const hours = match ? parseInt(match[1], 10) : 0;
      const mins = match?.[2] ? parseInt(match[2], 10) : 0;
      const offsetMinutes = hours * 60 + (hours >= 0 ? mins : -mins);
      return new Date(localDate.getTime() - offsetMinutes * 60000);
    }

    const fromMidnights = {
      startUTC: getLocalMidnightUTC(dateStr, A.timezone, 0),
      endUTC: getLocalMidnightUTC(dateStr, A.timezone, 1),
    };
    const toMidnights = {
      startUTC: getLocalMidnightUTC(dateStr, B.timezone, 0),
      endUTC: getLocalMidnightUTC(dateStr, B.timezone, 1),
    };

    return NextResponse.json({
      meta: {
        requestedDateLocal: dateStr,
        utcWindowStart: utcWindowStart.toISOString(),
        utcWindowEnd: utcWindowEnd.toISOString(),
        utcDurationMinutes: (utcWindowEnd - utcWindowStart) / 60000,
      },
      from: {
        code: A.iata,
        name: A.name,
        country: A.country,
        timezone: A.timezone,
        sunTimes: makeSunTimes({ dM1, d0, dP1 }, { m1: A_m1, _0: A_0, p1: A_p1 }, A.timezone, B.timezone, B.iata),
        midnights: {
          startUTC: fromMidnights.startUTC.toISOString(),
          endUTC: fromMidnights.endUTC.toISOString(),
        },
      },
      to: {
        code: B.iata,
        name: B.name,
        country: B.country,
        timezone: B.timezone,
        sunTimes: makeSunTimes({ dM1, d0, dP1 }, { m1: B_m1, _0: B_0, p1: B_p1 }, B.timezone, A.timezone, A.iata),
        midnights: {
          startUTC: toMidnights.startUTC.toISOString(),
          endUTC: toMidnights.endUTC.toISOString(),
        },
      },
      overlap: { daylight, nighttime },
    });
  } catch (e) {
    return NextResponse.json({ error: e.message || 'Unknown error' }, { status: 500 });
  }
}
