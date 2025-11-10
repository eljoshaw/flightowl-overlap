'use client';

import React, { useMemo, useState, useEffect } from 'react';

/**
 * ==== FlightOwl Vertical Timeline (MVP) ====
 * Updated 10 Nov:
 * - Columns narrower (50%)
 * - True local midnight markers (in UTC alignment)
 * - Reliable sunrise/sunset label rendering
 */

const COLORS = {
  day: '#fff9cc',
  night: '#01657e',
  text: '#222',
  rail: '#eaeaea',
};

const pxPerHourMobile = 32;
const pxPerHourDesktop = 48;

// ---------- time helpers ----------
const addDays = (date, days) => new Date(date.getTime() + days * 86400000);

function formatLocal(dt, tz) {
  // Properly render the datetime in the specified airport timezone, not system local
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    timeZoneName: 'shortOffset',
  });

  // Extract offset properly (e.g. "GMT−5" or "GMT+11")
  const parts = fmt.formatToParts(dt);
  const kv = Object.fromEntries(parts.map(p => [p.type, p.value]));
  const tzPart = parts.find(p => p.type === 'timeZoneName')?.value || '';

  return `${kv.year}-${kv.month}-${kv.day} ${kv.hour}:${kv.minute} (${tzPart})`;
}


function toDate(isoString) {
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

function buildDaylightUTC(sunTimes, windowStart, windowEnd) {
  const raw = [];
  for (const d of sunTimes) {
    let sr = toDate(d.sunriseUTC);
    let ss = toDate(d.sunsetUTC);
    if (ss <= sr) ss = addDays(ss, 1);
    raw.push({ start: sr, end: ss });
  }
  const merged = mergeIntervals(raw);
  const clipped = [];
  for (const iv of merged) {
    const c = clipInterval(iv, windowStart, windowEnd);
    if (c) clipped.push(c);
  }
  return clipped;
}

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

// --- helpers to get timezone offset + local midnight in UTC ---
function getOffsetHours(tz, refUtcDate) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    timeZoneName: 'shortOffset',
  }).formatToParts(refUtcDate);
  const tzPart = parts.find(p => p.type === 'timeZoneName')?.value || '';
  const m = tzPart.match(/([+-]\d{1,2})(?::?(\d{2}))?/);
  if (!m) return 0;
  const h = parseInt(m[1], 10);
  const mm = m[2] ? parseInt(m[2], 10) : 0;
  return h + mm / 60;
}

function getLocalMidnightUTC(dateStr, tz) {
  const ref = new Date(dateStr + 'T12:00:00Z');
  const offsetHours = getOffsetHours(tz, ref);
  const utcOfLocalMidnight = new Date(Date.parse(dateStr + 'T00:00:00Z') - offsetHours * 3600_000);
  return utcOfLocalMidnight;
}

// --- main column renderer ---
function CityColumn({ title, tz, sunTimes, utcWindowStart, utcWindowEnd, heightPx, pxPerMs, side = 'left' }) {
  const daylight = useMemo(
    () => buildDaylightUTC(sunTimes, utcWindowStart, utcWindowEnd),
    [sunTimes, utcWindowStart, utcWindowEnd]
  );

  const mainDay = sunTimes?.[1];
  const sunrise = mainDay ? new Date(mainDay.sunriseUTC) : null;
  const sunset = mainDay ? new Date(mainDay.sunsetUTC) : null;
  const localMidnight = mainDay ? getLocalMidnightUTC(mainDay.date, tz) : null;

  const posFor = (dt) => (dt ? (dt.getTime() - utcWindowStart.getTime()) * pxPerMs : null);
  const yMidnight = posFor(localMidnight);
  const ySunrise = posFor(sunrise);
  const ySunset = posFor(sunset);

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
      />
    );
  });

  const labelStyle = (y) => ({
    position: 'absolute',
    top: y + 0.5,
    [side === 'left' ? 'left' : 'right']: '0.25rem',
    textAlign: side === 'left' ? 'left' : 'right',
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

  const timeLabel = (dt) => (dt ? formatLocal(dt, tz).split(' ')[1] : '');

  const labels = (
    <>
      {[{ y: yMidnight, dt: localMidnight, icon: '🕛', text: 'midnight' },
        { y: ySunrise, dt: sunrise, icon: '☀️', text: 'sunrise' },
        { y: ySunset, dt: sunset, icon: '🌙', text: 'sunset' }]
        .filter(ev => ev.y !== null && ev.y >= 0 && ev.y <= heightPx)
        .map((ev, i) => (
          <React.Fragment key={i}>
            <div style={labelLine(ev.y)} />
            <div style={labelStyle(ev.y)}>
              {ev.icon} {timeLabel(ev.dt)} {ev.text}
            </div>
          </React.Fragment>
        ))}
    </>
  );

  const localStartLabel = formatLocal(utcWindowStart, tz);
  const localEndLabel = formatLocal(utcWindowEnd, tz);

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontWeight: 700, color: COLORS.text, fontSize: 16 }}>{title}</div>
        <div style={{ fontSize: 12, color: '#555' }}>{tz}</div>
        <div style={{ marginTop: 6, fontSize: 12, color: COLORS.text }}>
          <div><strong>Start:</strong> {localStartLabel}</div>
          <div><strong>End:</strong> {localEndLabel}</div>
        </div>
      </div>
      <div style={{
        position: 'relative',
        background: COLORS.night,
        border: `1px solid ${COLORS.rail}`,
        borderRadius: 8,
        height: heightPx,
        overflow: 'visible',
        width: '50%',
        margin: side === 'left' ? '0 auto 0 0' : '0 0 0 auto',
      }}>
        {dayBlocks}
        {labels}
      </div>
    </div>
  );
}

// --- main page ---
export default function Page() {
  const [from, setFrom] = useState('JFK');
  const [to, setTo] = useState('SYD');
  const [date, setDate] = useState('2025-11-09');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
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
      <h1 style={{ fontSize: 22, margin: 0, color: COLORS.text, fontWeight: 800 }}>
        FlightOwl · Light Overlap (Vertical · Mobile-first)
      </h1>
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
            style={{ border: '1px solid #ccc', borderRadius: 8, padding: '8px 10px', fontSize: 16, width: 120 }}
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
            style={{ border: '1px solid #ccc', borderRadius: 8, padding: '8px 10px', fontSize: 16, width: 120 }}
            placeholder="SYD"
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#444' }}>Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            style={{ border: '1px solid #ccc', borderRadius: 8, padding: '8px 10px', fontSize: 16 }}
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

      {err && (
        <div style={{
          color: '#b00020', background: '#ffecec', border: '1px solid #ffd3d3',
          padding: 12, borderRadius: 8, marginBottom: 12
        }}>{err}</div>
      )}

      {data && timeline && (
        <>
          <div style={{
            position: 'sticky', top: 0, background: 'white', zIndex: 5,
            padding: '8px 0 12px', borderBottom: `1px solid ${COLORS.rail}`
          }}>
            <div style={{ fontSize: 13, color: '#444', marginBottom: 6 }}>
              Local date: <strong>{data.meta.requestedDateLocal}</strong> · Full UTC window:
              <strong> {new Date(data.meta.utcWindowStart).toISOString().slice(0, 16)}</strong> →
              <strong> {new Date(data.meta.utcWindowEnd).toISOString().slice(0, 16)}</strong>
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <div style={{ flex: 1, fontWeight: 700, color: COLORS.text }}>{data.from.code} · {data.from.name}</div>
              <div style={{ flex: 1, fontWeight: 700, color: COLORS.text }}>{data.to.code} · {data.to.name}</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginTop: 12 }}>
            <CityColumn {...data.from} utcWindowStart={timeline.windowStart} utcWindowEnd={timeline.windowEnd} heightPx={timeline.heightPx} pxPerMs={timeline.pxPerMs} side="left" />
            <CityColumn {...data.to} utcWindowStart={timeline.windowStart} utcWindowEnd={timeline.windowEnd} heightPx={timeline.heightPx} pxPerMs={timeline.pxPerMs} side="right" />
          </div>

          <div style={{ marginTop: 18 }}>
            <div style={{ fontWeight: 700, color: COLORS.text, marginBottom: 8 }}>Legend</div>
            <div style={{ display: 'flex', gap: 16 }}>
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
