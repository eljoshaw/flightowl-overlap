import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { calculateSunTimes } from '../../../utils/sunCalc';

// --- Supabase client (env vars set in Vercel) ---
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ---------- small helpers ----------
function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
function minutesToHHMM(mins) {
  const m = ((mins % 1440) + 1440) % 1440; // wrap to 0..1439
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}
function clampToDayWindow(start, end) {
  const s = Math.max(start, 0);
  const e = Math.min(end, 1440);
  return e > s ? [s, e] : null;
}

// ---------- build intervals for ONE day ----------
function buildIntervalsForOneDay(sunriseMin, sunsetMin) {
  if (
    typeof sunriseMin !== 'number' ||
    typeof sunsetMin !== 'number' ||
    Number.isNaN(sunriseMin) ||
    Number.isNaN(sunsetMin)
  ) {
    return { daylight: [], nighttime: [] };
  }
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

// ---------- build 3-day continuous intervals ----------
function buildContinuousIntervals(sunResultsYesterday, sunResultsToday, sunResultsTomorrow) {
  const days = [sunResultsYesterday, sunResultsToday, sunResultsTomorrow];
  const offsets = [-1440, 0, 1440];
  const out = { daylight: [], nighttime: [] };

  days.forEach((res, i) => {
    if (!res || typeof res.sunriseUTC !== 'string' || typeof res.sunsetUTC !== 'string') return;
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
function findOverlapSegments(intervalsA, intervalsB) {
  const rawSegments = [];
  for (const [aStart, aEnd] of intervalsA) {
    for (const [bStart, bEnd] of intervalsB) {
      const start = Math.max(aStart, bStart);
      const end = Math.min(aEnd, bEnd);
      if (end > start) rawSegments.push([start, end]);
    }
  }
  const clipped = [];
  for (const [s, e] of rawSegments) {
    const clippedSeg = clampToDayWindow(s, e);
    if (clippedSeg) clipped.push(clippedSeg);
  }
  if (clipped.length === 0) {
    return { overlap: false, totalMinutes: 0, segments: [] };
  }
  clipped.sort((x, y) => x[0] - y[0]);
  const merged = [];
  let cur = clipped[0].slice();
  for (let i = 1; i < clipped.length; i++) {
    const [s, e] = clipped[i];
    if (s <= cur[1]) {
      cur[1] = Math.max(cur[1], e);
    } else {
      merged.push(cur);
      cur = [s, e];
    }
  }
  merged.push(cur);
  const total = merged.reduce((sum, [s, e]) => sum + (e - s), 0);

  return {
    overlap: true,
    totalMinutes: total,
    segments: merged.map(([s, e]) => ({
      startUTC: minutesToHHMM(s),
      endUTC: minutesToHHMM(e),
      minutes: e - s,
    })),
  };
}

// ---------- fetch airport by IATA ----------
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

// ---------- helper to build sunrise/sunset with UTC + local ----------
function makeSunTimes(dateObjs, sunResults, tz) {
  const fmtUTC = (date, time) => `${date}T${time}:00Z`;
  const makeLocal = (date, time) =>
    new Date(fmtUTC(date, time)).toLocaleString('sv-SE', {
      timeZone: tz,
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

// ---------- API route ----------
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const fromCode = (searchParams.get('from') || '').toUpperCase();
    const toCode = (searchParams.get('to') || '').toUpperCase();
    const dateStr = searchParams.get('date');

    if (!fromCode || !toCode) {
      return NextResponse.json(
        { error: 'Use ?from=DXB&to=SYD&date=YYYY-MM-DD (date optional for now)' },
        { status: 400 }
      );
    }

    const d0 = dateStr
      ? new Date(dateStr + 'T00:00:00Z')
      : new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
    const dM1 = new Date(d0.getTime() - 86400000);
    const dP1 = new Date(d0.getTime() + 86400000);

    const [A, B] = await Promise.all([getAirportByIATA(fromCode), getAirportByIATA(toCode)]);

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

    const daylight = findOverlapSegments(AIntervals.daylight, BIntervals.daylight);
    const nighttime = findOverlapSegments(AIntervals.nighttime, BIntervals.nighttime);

    return NextResponse.json({
      meta: {
        requestedDateUTC: d0.toISOString().slice(0, 10),
        windowUTC: '00:00–24:00',
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
      overlap: {
        daylight,
        nighttime,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e.message || 'Unknown error' }, { status: 500 });
  }
}
