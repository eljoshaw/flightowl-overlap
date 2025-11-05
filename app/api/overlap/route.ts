import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { calculateSunTimes } from '@/utils/sunCalc';

// Connect to Supabase using environment variables from Vercel
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Helper: find airport info by IATA code
async function getAirportByIATA(iata: string) {
  const { data, error } = await supabase
    .from('airports')
    .select('name, country, latitude, longitude, timezone')
    .eq('iata', iata.toUpperCase())
    .single();

  if (error || !data) throw new Error(`Airport not found for ${iata}`);
  return data;
}

// Main API endpoint
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const date = searchParams.get('date');

    if (!from || !to || !date) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    // 1. Look up both airports in Supabase
    const [fromAirport, toAirport] = await Promise.all([
      getAirportByIATA(from),
      getAirportByIATA(to),
    ]);

    // 2. Calculate sunrise/sunset (in UTC)
    const fromSun = calculateSunTimes(
      fromAirport.latitude,
      fromAirport.longitude,
      new Date(date)
    );
    const toSun = calculateSunTimes(
      toAirport.latitude,
      toAirport.longitude,
      new Date(date)
    );

    // 3. Compute overlap in UTC
    const overlap = getOverlap(fromSun, toSun);

    // 4. Return everything as JSON
    return NextResponse.json({
      from: { ...fromAirport, ...fromSun },
      to: { ...toAirport, ...toSun },
      overlap,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Helper: find overlapping daylight window between two sets of UTC times
function getOverlap(a: any, b: any) {
  const toMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  const aStart = toMinutes(a.sunriseUTC);
  const aEnd = toMinutes(a.sunsetUTC);
  const bStart = toMinutes(b.sunriseUTC);
  const bEnd = toMinutes(b.sunsetUTC);

  const overlapStart = Math.max(aStart, bStart);
  const overlapEnd = Math.min(aEnd, bEnd);

  if (overlapEnd <= overlapStart) return { overlap: false };

  const duration = overlapEnd - overlapStart;
  const hours = Math.floor(duration / 60);
  const minutes = duration % 60;

  return {
    overlap: true,
    overlapUTC: `${String(Math.floor(overlapStart / 60)).padStart(2, '0')}:${String(overlapStart % 60).padStart(2, '0')} → ${String(Math.floor(overlapEnd / 60)).padStart(2, '0')}:${String(overlapEnd % 60).padStart(2, '0')}`,
    overlapDuration: `${hours}h ${minutes}m`,
  };
}
