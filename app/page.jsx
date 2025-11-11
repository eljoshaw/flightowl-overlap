'use client';

import React, { useMemo, useState, useEffect } from 'react';

/**
 * ==== FlightOwl Vertical Timeline (MVP) ====
 * - Inputs: from (IATA), to (IATA), date (YYYY-MM-DD)
 * - Fetches: /api/overlap?from=..&to=..&date=..
 * - Renders: Two vertical columns (Departure | Arrival), aligned by UTC, bands for Day/Night
 * - Labels: show local times only (no UTC ticks), top/bottom range labels in each local time zone
 * - Scaling: mobile ~32px/hour, desktop ~48px/hour (scrollable container)
 *
 * You can refine styles later; this is intentionally minimal and robust.
 */

const COLORS = {
  day: '#fff9cc',       // Daytime
  night: '#01657e',     // Nighttime
  text: '#222',         // Labels/borders
  rail: '#eaeaea',      // Axis/rail background
};

const pxPerHourMobile = 32;  // ~40h => ~1280px scroll
const pxPerHourDesktop = 48; // ~40h => ~1920px scroll

// ---------- small time helpers ----------
const addDays = (date, days) => new Date(date.getTime() + days * 86400000);

function formatLocal(dt, tz) {
  // ISO-like but in local tz: "YYYY-MM-DD HH:mm (UTC±hh:mm)"
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: tz,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    timeZoneName: 'shortOffset',
  }).formatToParts(dt);

  const kv = Object.fromEntries(parts.map(p => [p.type, p.value]));
  // sv-SE parts: year, month, day, hour, minute, literal, timeZoneName
  // Compose as "YYYY-MM-DD HH:mm (XXX)"
  return `${kv.year}-${kv.month}-${kv.day} ${kv.hour}:${kv.minute} (${kv.timeZoneName})`;
}

function toDate(isoString) {
  // robust parse for "YYYY-MM-DDTHH:mm:ss.sssZ"
  return new Date(isoString);
}

function mergeIntervals(intervals) {
  if (!intervals.length) return [];
  const sorted = intervals.slice().sort((a, b) => a.start - b.start);
  const out = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = out[out.length - 1];
    const cur = sorted[i];
    if (cur.start <= prev.end) {
      prev.end = new Date(Math.max(prev.end.getTime(), cur.end.getTime()));
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

function clipInterval({ start, end }, windowStart, windowEnd) {
  const s = new Date(Math.max(start.getTime(), windowStart.getTime()));
  const e = new Date(Math.min(end.getTime(), windowEnd.getTime()));
  return e > s ? { start: s, end: e } : null;
}

/**
 * Build daylight intervals for one airport across the full window
 * sunTimes: [{ date, sunriseUTC, sunsetUTC, sunriseLocal, sunsetLocal }]
 * Returns: merged daylight intervals (UTC Dates) clipped to [windowStart, windowEnd]
 */
function buildDaylightUTC(sunTimes, windowStart, windowEnd) {
  const raw = [];

  for (const d of sunTimes) {
    let sr = toDate(d.sunriseUTC);
    let ss = toDate(d.sunsetUTC);

    // If sunset <= sunrise, it wraps past midnight (sunset next day)
    if (ss <= sr) {
      ss = addDays(ss, 1);
    }

    raw.push({ start: sr, end: ss });
  }

  // Merge across days
  const merged = mergeIntervals(raw);

  // Clip to window
  const clipped = [];
  for (const iv of merged) {
    const c = clipInterval(iv, windowStart, windowEnd);
    if (c) clipped.push(c);
  }
  return clipped;
}

/**
 * Compute night intervals as the complement of daylight within the window
 */
function buildNightUTC(daylightIntervals, windowStart, windowEnd) {
  const day = mergeIntervals(daylightIntervals);
  const out = [];
  let cursor = new Date(windowStart);

  for (const iv of day) {
    if (iv.start > cursor) {
      out.push({ start: new Date(cursor), end: new Date(iv.start) });
    }
    cursor = new Date(Math.max(cursor.getTime(), iv.end.getTime()));
  }
  if (cursor < windowEnd) {
    out.push({ start: new Date(cursor), end: new Date(windowEnd) });
  }
  return out;
}

/**
 * Column renderer:
 * - background "night" (full)
 * - overlay "day" blocks positioned absolutely by UTC time within window
 * - labels: city code, top/bottom local time range
 */

function CityColumn({ city, utcWindowStart, utcWindowEnd, colorDay, colorNight }) {
  const totalDuration =
    (new Date(utcWindowEnd).getTime() - new Date(utcWindowStart).getTime()) / 60000; // minutes

  // Convert a UTC timestamp into a percentage of the full UTC window
  const pctFromUTC = (dt) => {
    const t = new Date(dt).getTime();
    const start = new Date(utcWindowStart).getTime();
    return ((t - start) / (totalDuration * 60000)) * 100;
  };

  // ✅ Reliable conversion: given "local midnight" in that timezone, return UTC equivalent
  const getLocalMidnightUTC = (dateStr, tz, offsetDays = 0) => {
    // start with date 00:00 local
    const localMidnight = new Date(`${dateStr}T00:00:00`);
    // add offset days (for 24:00, offsetDays = 1)
    localMidnight.setUTCDate(localMidnight.getUTCDate() + offsetDays);

    // get the UTC instant corresponding to local 00:00
    const utcMillis =
      Date.parse(
        new Date(localMidnight).toLocaleString('en-US', { timeZone: tz })
      ) - Date.parse(
        new Date(localMidnight).toLocaleString('en-US', { timeZone: 'UTC' })
      );

    return new Date(localMidnight.getTime() - utcMillis);
  };

  const tz = city.timezone;
  const dateStr = city.sunTimes?.[1]?.date; // main day (the center of the 3 pulled)
  const midnightStartUTC = getLocalMidnightUTC(dateStr, tz, 0);
  const midnightEndUTC = getLocalMidnightUTC(dateStr, tz, 1);

  const midnightLines = [
    { label: '🕛 00:00 Local', utc: midnightStartUTC },
    { label: '🕛 24:00 Local', utc: midnightEndUTC },
  ];

  return (
    <div className="flex flex-col items-center w-1/2 relative">
      <h3 className="font-semibold mb-2">{city.name}</h3>
      <div className="relative w-3 rounded-md overflow-hidden bg-gray-200" style={{ height: '500px' }}>
        {/* Day/night background blocks */}
        {city.sunTimes &&
          city.sunTimes.map((s, i) => {
            const sunrise = new Date(s.sunriseUTC);
            const sunset = new Date(s.sunsetUTC);
            const startPct = pctFromUTC(sunrise);
            const endPct = pctFromUTC(sunset);
            return (
              <React.Fragment key={i}>
                <div
                  style={{
                    position: 'absolute',
                    top: `${startPct}%`,
                    height: `${endPct - startPct}%`,
                    backgroundColor: colorDay,
                    width: '100%',
                  }}
                ></div>
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    height: `${startPct}%`,
                    backgroundColor: colorNight,
                    width: '100%',
                  }}
                ></div>
                <div
                  style={{
                    position: 'absolute',
                    top: `${endPct}%`,
                    height: `${100 - endPct}%`,
                    backgroundColor: colorNight,
                    width: '100%',
                  }}
                ></div>
              </React.Fragment>
            );
          })}

        {/* Midnight markers */}
        {midnightLines.map((m, i) => (
          <div
            key={i}
            className="absolute left-0 w-full border-t border-gray-400"
            style={{ top: `${pctFromUTC(m.utc)}%` }}
          >
            <span
              className={`absolute ${
                i === 0 ? '-left-24 text-right' : 'left-full ml-2 text-left'
              } text-xs text-gray-700`}
            >
              {m.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}


export default function Page() {
  const [from, setFrom] = useState('JFK');
  const [to, setTo] = useState('SYD');
  const [date, setDate] = useState('2025-11-09'); // YYYY-MM-DD
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  // responsive scale
  const [pxPerHour, setPxPerHour] = useState(pxPerHourMobile);
  useEffect(() => {
    const update = () => setPxPerHour(window.innerWidth < 768 ? pxPerHourMobile : pxPerHourDesktop);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setErr('');
    setData(null);
    try {
      const url = `/api/overlap?from=${encodeURIComponent(from.trim())}&to=${encodeURIComponent(to.trim())}&date=${encodeURIComponent(date)}`;
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Request failed');
      setData(json);
    } catch (e) {
      setErr(e.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  const timeline = useMemo(() => {
    if (!data?.meta?.utcWindowStart || !data?.meta?.utcWindowEnd) return null;
    const windowStart = new Date(data.meta.utcWindowStart);
    const windowEnd = new Date(data.meta.utcWindowEnd);
    const durHours = (windowEnd - windowStart) / 3600000;
    const heightPx = Math.max(400, Math.round(durHours * pxPerHour));
    const pxPerMs = heightPx / (windowEnd - windowStart);
    return { windowStart, windowEnd, heightPx, pxPerMs };
  }, [data, pxPerHour]);

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '16px 16px 80px' }}>
      {/* Title */}
      <h1 style={{ fontSize: 22, margin: 0, color: COLORS.text, fontWeight: 800 }}>
        FlightOwl · Light Overlap (Vertical · Mobile-first)
      </h1>

      {/* Form */}
      <form onSubmit={handleSubmit} style={{
        display: 'flex', gap: 12, flexWrap: 'wrap',
        alignItems: 'flex-end', marginTop: 16, marginBottom: 16
      }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#444' }}>Departure (IATA)</label>
          <input
            value={from}
            onChange={(e) => setFrom(e.target.value.toUpperCase())}
            maxLength={3}
            required
            style={{
              border: '1px solid #ccc', borderRadius: 8, padding: '8px 10px',
              fontSize: 16, width: 120
            }}
            placeholder="JFK"
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#444' }}>Arrival (IATA)</label>
          <input
            value={to}
            onChange={(e) => setTo(e.target.value.toUpperCase())}
            maxLength={3}
            required
            style={{
              border: '1px solid #ccc', borderRadius: 8, padding: '8px 10px',
              fontSize: 16, width: 120
            }}
            placeholder="SYD"
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#444' }}>Date (YYYY-MM-DD)</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            style={{
              border: '1px solid #ccc', borderRadius: 8, padding: '8px 10px',
              fontSize: 16
            }}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          style={{
            background: '#111', color: 'white', padding: '10px 14px',
            borderRadius: 10, border: '1px solid #111', fontSize: 16, fontWeight: 700,
            opacity: loading ? 0.7 : 1
          }}
        >
          {loading ? 'Loading…' : 'Show timeline'}
        </button>
      </form>

      {/* Error */}
      {err && (
        <div style={{
          color: '#b00020', background: '#ffecec', border: '1px solid #ffd3d3',
          padding: 12, borderRadius: 8, marginBottom: 12
        }}>{err}</div>
      )}

      {/* Timeline */}
      {data && timeline && (
        <>
          {/* Sticky labels: date & airports */}
          <div style={{
            position: 'sticky', top: 0, background: 'white', zIndex: 5,
            padding: '8px 0 12px', borderBottom: `1px solid ${COLORS.rail}`
          }}>
            <div style={{ fontSize: 13, color: '#444', marginBottom: 6 }}>
              Local date: <strong>{data.meta.requestedDateLocal}</strong> ·
              Full UTC window rendered for both: <strong>{new Date(data.meta.utcWindowStart).toISOString().slice(0,16)}</strong> → <strong>{new Date(data.meta.utcWindowEnd).toISOString().slice(0,16)}</strong>
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <div style={{ flex: 1, fontWeight: 700, color: COLORS.text }}>
                {data.from.code} · {data.from.name}
              </div>
              <div style={{ flex: 1, fontWeight: 700, color: COLORS.text }}>
                {data.to.code} · {data.to.name}
              </div>
            </div>
          </div>

          {/* Columns */}
          <div style={{
            display: 'flex', gap: 16, alignItems: 'flex-start',
            marginTop: 12
          }}>
          <CityColumn
            title={`${data.from.code}`}
            tz={data.from.timezone}
            sunTimes={data.from.sunTimes}
            utcWindowStart={timeline.windowStart}
            utcWindowEnd={timeline.windowEnd}
            heightPx={timeline.heightPx}
            pxPerMs={timeline.pxPerMs}
            side="left"
          />
          <CityColumn
            title={`${data.to.code}`}
            tz={data.to.timezone}
            sunTimes={data.to.sunTimes}
            utcWindowStart={timeline.windowStart}
            utcWindowEnd={timeline.windowEnd}
            heightPx={timeline.heightPx}
            pxPerMs={timeline.pxPerMs}
            side="right"
          />

          </div>

          {/* Legend */}
          <div style={{ marginTop: 18 }}>
            <div style={{ fontWeight: 700, color: COLORS.text, marginBottom: 8 }}>Legend</div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 18, height: 18, background: COLORS.night, borderRadius: 4, border: `1px solid ${COLORS.rail}` }} />
                <span style={{ fontSize: 13 }}>Night</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 18, height: 18, background: COLORS.day, borderRadius: 4, border: `1px solid ${COLORS.rail}` }} />
                <span style={{ fontSize: 13 }}>Day</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
