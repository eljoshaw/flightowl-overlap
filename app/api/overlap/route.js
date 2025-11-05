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
function getOverlapUTC(a, b) {
  const toMin = (t) => { const [h,m] = t.split(':').map(Number); return h*60 + m; };
  if (a.sunriseUTC.includes('No') || b.sunriseUTC.includes('No')) return { overlap: false };

  const aStart = toMin(a.sunriseUTC);
  const aEnd   = toMin(a.sunsetUTC);
  const bStart = toMin(b.sunriseUTC);
  const bEnd   = toMin(b.sunsetUTC);

  const start = Math.max(aStart, bStart);
  const end   = Math.min(aEnd, bEnd);
  if (end <= start) return { overlap: false };

  const dur = end - start;
  const hh = Math.floor(dur/60), mm = dur % 60;
  const fmt = (m) => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;

  return {
    overlap: true,
    overlapUTC: `${fmt(start)} → ${fmt(end)}`,
    overlapDuration: `${hh}h ${mm}m`
  };
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

    // 2) Compute sunrise/sunset (UTC) for that date
    const d = new Date(date + 'T00:00:00Z'); // midnight UTC for the given date
    const Asun = calculateSunTimes(A.latitude, A.longitude, d);
    const Bsun = calculateSunTimes(B.latitude, B.longitude, d);

    // 3) Overlap (same-day basic first; we'll extend to prev/next day after this works)
    const overlap = getOverlapUTC(Asun, Bsun);

    return NextResponse.json({
      from: { code: from.toUpperCase(), ...A, ...Asun },
      to:   { code: to.toUpperCase(),   ...B, ...Bsun },
      overlap
    });
  } catch (e) {
    return NextResponse.json({ error: e.message || 'Unknown error' }, { status: 500 });
  }
}
