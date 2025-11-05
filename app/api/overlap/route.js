import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { calculateSunTimes } from '../../../utils/sunCalc';

// Supabase client (env vars set in Vercel → Settings → Environment Variables)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Find airport by IATA (case-insensitive)
async function getAirportByIATA(iata) {
  const code = String(iata || '').toUpperCase();
  const { data, error } = await supabase
    .from('airports')
    .select('name, country, latitude, longitude, timezone')
    .eq('iata', code)
    .single();
  if (error || !data) throw new Error(`Airport not found for ${code}`);
  return data;
}

// Compute overlap between two daylight windows (same-day basic version)
// --- New Improved Overlap Logic (handles cross-midnight daylight) ---
function toMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function minutesToHHMM(mins) {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Takes an array of intervals [ [start,end], [start,end], ... ]
// Returns total overlap in minutes between two sets of intervals
function findOverlap(intervalsA, intervalsB) {
  let total = 0;
  let overlapStart = null;
  let overlapEnd = null;

  for (const [aStart, aEnd] of intervalsA) {
    for (const [bStart, bEnd] of intervalsB) {
      const start = Math.max(aStart, bStart);
      const end = Math.min(aEnd, bEnd);
      if (end > start) {
        total += end - start;
        if (overlapStart === null || start < overlapStart) overlapStart = start;
        if (overlapEnd === null || end > overlapEnd) overlapEnd = end;
      }
    }
  }

  if (total === 0) return { overlap: false };
  return {
    overlap: true,
    overlapUTC: `${minutesToHHMM(overlapStart % 1440)} → ${minutesToHHMM(overlapEnd % 1440)}`,
    overlapDuration: `${Math.floor(total / 60)}h ${total % 60}m`
  };
}

// Build 48-hour daylight intervals to handle overnight cases
function buildDaylightIntervals(sunTimesArray) {
  const intervals = [];
  let base = -1440; // start from previous day
  for (const times of sunTimesArray) {
    if (times.sunriseUTC.includes('No')) continue;
    const start = base + toMinutes(times.sunriseUTC);
    const end = base + toMinutes(times.sunsetUTC);
    if (end > start) intervals.push([start, end]);
    base += 1440; // shift to next day window
  }
  return intervals;
}


export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from');
    const to   = searchParams.get('to');
    const date = searchParams.get('date'); // YYYY-MM-DD

    if (!from || !to || !date) {
      return NextResponse.json({ error: 'Use ?from=DXB&to=SYD&date=2025-11-06' }, { status: 400 });
    }

    // 1) Lookup airports
    const [A, B] = await Promise.all([ getAirportByIATA(from), getAirportByIATA(to) ]);

    // 2) Compute sunrise/sunset (UTC) for that date ±1 day
    const d = new Date(date + 'T00:00:00Z');
    const dayBefore = new Date(d.getTime() - 86400000);
    const dayAfter = new Date(d.getTime() + 86400000);

    const AsunArray = [
      calculateSunTimes(A.latitude, A.longitude, dayBefore),
      calculateSunTimes(A.latitude, A.longitude, d),
      calculateSunTimes(A.latitude, A.longitude, dayAfter)
    ];
    const BsunArray = [
      calculateSunTimes(B.latitude, B.longitude, dayBefore),
      calculateSunTimes(B.latitude, B.longitude, d),
      calculateSunTimes(B.latitude, B.longitude, dayAfter)
    ];
    
    // Build 48h daylight intervals
    const Aintervals = buildDaylightIntervals(AsunArray);
    const Bintervals = buildDaylightIntervals(BsunArray);

    // Find overlap
    const overlap = findOverlap(Aintervals, Bintervals);


    return NextResponse.json({
      from: { code: from.toUpperCase(), ...A, ...Asun },
      to:   { code: to.toUpperCase(),   ...B, ...Bsun },
      overlap
    });
  } catch (e) {
    return NextResponse.json({ error: e.message || 'Unknown error' }, { status: 500 });
  }
}
