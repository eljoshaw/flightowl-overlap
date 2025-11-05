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
  const overlaps = [];

  for (const [aStart, aEnd] of intervalsA) {
    for (const [bStart, bEnd] of intervalsB) {
      // Normalize all intervals within 24h range
      const start = Math.max(aStart % 1440, bStart % 1440);
      const end = Math.min(aEnd % 1440, bEnd % 1440);

      // Only store overlaps that make physical sense (not 25h+ spans)
      if (end > start && end - start < 1440) {
        overlaps.push([start, end]);
      }
    }
  }

  if (overlaps.length === 0) {
    return { overlap: false };
  }

  // Choose the largest single overlap period
  const [overlapStart, overlapEnd] = overlaps.reduce((max, cur) =>
    cur[1] - cur[0] > max[1] - max[0] ? cur : max
  );

  const durationMin = overlapEnd - overlapStart;

  return {
    overlap: true,
    overlapUTC: `${minutesToHHMM(overlapStart)} → ${minutesToHHMM(overlapEnd)}`,
    overlapDuration: `${Math.floor(durationMin / 60)}h ${durationMin % 60}m`,
  };
}


// Build 48-hour daylight intervals to handle overnight cases
function buildDaylightIntervals(array) {
  // Each element: { sunriseUTC: "HH:MM", sunsetUTC: "HH:MM" }
  const intervals = [];

  array.forEach(day => {
    const [sunriseH, sunriseM] = day.sunriseUTC.split(':').map(Number);
    const [sunsetH, sunsetM] = day.sunsetUTC.split(':').map(Number);

    const sunriseMin = sunriseH * 60 + sunriseM;
    const sunsetMin = sunsetH * 60 + sunsetM;

    // Handle days where sunset is after midnight (e.g. SYD)
    if (sunsetMin < sunriseMin) {
      // Split into two intervals: from sunrise → 1440, then 0 → sunset
      intervals.push([sunriseMin, 1440]);
      intervals.push([0, sunsetMin]);
    } else {
      intervals.push([sunriseMin, sunsetMin]);
    }
  });

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
    
    // Build 48h daylight intervals (for 3-day window)
    const Aintervals = buildDaylightIntervals(AsunArray);
    const Bintervals = buildDaylightIntervals(BsunArray);

    // Debug logging (optional): see if intervals are correct
    // console.log('Aintervals', Aintervals, 'Bintervals', Bintervals);
    
    // Calculate overlap on a continuous 48h UTC timeline
    const overlap = findOverlap(Aintervals, Bintervals);
    
    // If no overlap found, try shifting B’s timeline forward 1 day (to handle wraparound)
    if (!overlap.overlap) {
      const shiftedB = Bintervals.map(([start, end]) => [start + 1440, end + 1440]);
      const retry = findOverlap(Aintervals, shiftedB);
      if (retry.overlap) Object.assign(overlap, retry);
    }



    return NextResponse.json({
      from: { code: from.toUpperCase(), ...A, today: AsunArray[1] },
      to:   { code: to.toUpperCase(),   ...B, today: BsunArray[1] },
      overlap
    });

  } catch (e) {
    return NextResponse.json({ error: e.message || 'Unknown error' }, { status: 500 });
  }
}
