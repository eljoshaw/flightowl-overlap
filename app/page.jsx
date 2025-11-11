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
  function CityColumn({ title, tz, sunTimes, midnights, utcWindowStart, utcWindowEnd, heightPx, pxPerMs, side = 'left' }) {
    // --- build daylight intervals ---
    const daylight = useMemo(
      () => buildDaylightUTC(sunTimes, utcWindowStart, utcWindowEnd),
      [sunTimes, utcWindowStart, utcWindowEnd]
    );
  
    // --- convert to vertical positions ---
    const posFor = (dt) => (dt ? (dt.getTime() - utcWindowStart.getTime()) * pxPerMs : null);
  
    // --- pull local midnight start/end UTC from API ---
    const midnightStartUTC = midnights?.startUTC ? new Date(midnights.startUTC) : null;
    const midnightEndUTC = midnights?.endUTC ? new Date(midnights.endUTC) : null;
    const yMidnightStart = posFor(midnightStartUTC);
    const yMidnightEnd = posFor(midnightEndUTC);
  
    // --- draw daylight blocks ---
    const dayBlocks = daylight.map((iv, idx) => {
      const startMs = iv.start.getTime() - utcWindowStart.getTime();
      const durMs = iv.end.getTime() - iv.start.getTime();
      const top = startMs * pxPerMs;
      const h = Math.max(1, durMs * pxPerMs);
  
      return (
        <div
          key={idx}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top,
            height: h,
            background: COLORS.day,
            border: `1px solid ${COLORS.rail}`,
            borderRadius: 6,
          }}
          title={`${formatLocal(iv.start, tz)} → ${formatLocal(iv.end, tz)} (Day)`}
        />
      );
    });
  
    // --- labels for midnights only (00:00 / 24:00 local) ---
    const labelStyle = (y, align = 'left') => ({
      position: 'absolute',
      top: y,
      [align]: '0.25rem',
      textAlign: align === 'left' ? 'left' : 'right',
      fontSize: 11,
      color: COLORS.text,
      transform: 'translateY(-50%)',
      background: 'rgba(255,255,255,0.7)',
      padding: '0 4px',
      borderRadius: 3,
      whiteSpace: 'nowrap',
    });
  
    const labelLine = (y) => ({
      position: 'absolute',
      top: y,
      left: 0,
      right: 0,
      height: 1,
      background: '#aaa',
      opacity: 0.4,
    });
  
    const midnightLabels = [
      { y: yMidnightStart, text: '🕛 00:00 Local' },
      { y: yMidnightEnd, text: '🕛 24:00 Local' },
    ];
        // --- sunrise/sunset labels from API ---
        // --- sunrise/sunset labels with local time ---
        const sunLabels = (sunTimes || []).flatMap((s, i) => {
          const sunriseUTC = new Date(s.sunriseUTC);
          const sunsetUTC = new Date(s.sunsetUTC);
      
          // Format local time label (just HH:MM)
          const fmtLocalTime = (isoStr) => {
            const d = new Date(isoStr);
            return d
              .toLocaleTimeString('en-GB', {
                timeZone: tz,
                hour: '2-digit',
                minute: '2-digit',
              })
              .replace(':00', ':00'); // ensures 2-digit format
          };
      
          const sunriseLabel = `☀️ Sunrise ${fmtLocalTime(s.sunriseUTC)}`;
          const sunsetLabel = `🌙 Sunset ${fmtLocalTime(s.sunsetUTC)}`;
      
          return [
            { y: posFor(sunriseUTC), text: sunriseLabel },
            { y: posFor(sunsetUTC), text: sunsetLabel },
          ];
        });

  
    const eventLabels = [...midnightLabels, ...sunLabels]
      .filter(ev => ev.y !== null && ev.y >= 0 && ev.y <= heightPx)
      .map((ev, i) => (
        <React.Fragment key={i}>
          <div style={labelLine(ev.y)} />
          <div
            style={labelStyle(
              ev.y,
              side === 'left' ? 'left' : 'right'
            )}
          >
            {ev.text}
          </div>
        </React.Fragment>
      ));

  
    const labels = midnightLabels
      .filter(ev => ev.y !== null && ev.y >= 0 && ev.y <= heightPx)
      .map((ev, i) => (
        <React.Fragment key={i}>
          <div style={labelLine(ev.y)} />
          <div style={labelStyle(ev.y, side === 'left' ? 'left' : 'right')}>
            {ev.text}
          </div>
        </React.Fragment>
      ));
  
    // --- local labels for top/bottom ---
    const localStartLabel = formatLocal(utcWindowStart, tz);
    const localEndLabel = formatLocal(utcWindowEnd, tz);
  
    return (
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontWeight: 700, color: COLORS.text, fontSize: 16 }}>{title}</div>
          <div style={{ fontSize: 12, color: '#555' }}>{tz}</div>
          <div style={{ marginTop: 6, fontSize: 12, color: COLORS.text }}>
            <div><strong>Start:</strong> {localStartLabel}</div>
            <div><strong>End:</strong> {localEndLabel}</div>
          </div>
        </div>
  
        {/* Rail */}
        <div style={{ 
        display: 'flex', 
        flexDirection: side === 'left' ? 'row' : 'row-reverse',
        alignItems: 'stretch',
        gap: '8px',
      }}>
        {/* Label area (outside the bar) */}
        <div style={{ 
          position: 'relative', 
          width: '60px', // or 80px for more room
          height: heightPx, 
        }}>
          {eventLabels.map((label, i) => (
            <div key={i} style={{ position: 'absolute', top: label.props.children[0].props.style.top }}>
              {label.props.children[1]}
            </div>
          ))}
        </div>
      
        {/* The actual timeline bar */}
        <div
          style={{
            position: 'relative',
            flex: 1,
            minWidth: 0,
            background: COLORS.night,
            border: `1px solid ${COLORS.rail}`,
            borderRadius: 8,
            height: heightPx,
            overflow: 'visible',
          }}
        >
          {dayBlocks}
          {/* just the horizontal lines */}
          {eventLabels.map((label, i) => label.props.children[0])}
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
            midnights={data.from.midnights}
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
            midnights={data.to.midnights}
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
