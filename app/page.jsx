'use client';

import React, { useMemo, useState, useEffect } from 'react';

const COLORS = {
  day: '#fff9cc',
  night: '#01657e',
  text: '#222',
  rail: '#eaeaea',
};

// Visual compression + fixed column geometry
const pxPerHourMobile = 20;   // was 32
const pxPerHourDesktop = 25;  // was 48

const COLUMN_WIDTH_MOBILE = 90;     // px
const COLUMN_WIDTH_DESKTOP = 120;   // px
const COLUMNS_GAP_MOBILE = 40;      // px
const COLUMNS_GAP_DESKTOP = 60;     // px

// ---------- small time helpers ----------
const addDays = (date, days) => new Date(date.getTime() + days * 86400000);

function formatLocal(dt, tz) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: tz,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    timeZoneName: 'shortOffset',
  }).formatToParts(dt);
  const kv = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${kv.year}-${kv.month}-${kv.day} ${kv.hour}:${kv.minute} (${kv.timeZoneName})`;
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
    if (iv.start > cursor) out.push({ start: new Date(cursor), end: new Date(iv.start) });
    cursor = new Date(Math.max(cursor.getTime(), iv.end.getTime()));
  }
  if (cursor < windowEnd) out.push({ start: new Date(cursor), end: new Date(windowEnd) });
  return out;
}

/**
 * CityColumn: renders one vertical timeline (day/night + events)
 * Now also displays other city's translated sunrise/sunset labels.
 */
function CityColumn({
  title,
  tz,
  sunTimes,
  otherSunTimes,
  otherCode,
  midnights,
  utcWindowStart,
  utcWindowEnd,
  heightPx,
  pxPerMs,
  side = 'left',
  columnWidth,               // NEW
}) {

  const daylight = useMemo(
    () => buildDaylightUTC(sunTimes, utcWindowStart, utcWindowEnd),
    [sunTimes, utcWindowStart, utcWindowEnd]
  );

  const posFor = (dt) => (dt ? (dt.getTime() - utcWindowStart.getTime()) * pxPerMs : null);

  const midnightStartUTC = midnights?.startUTC ? new Date(midnights.startUTC) : null;
  const midnightEndUTC = midnights?.endUTC ? new Date(midnights.endUTC) : null;
  const yMidnightStart = posFor(midnightStartUTC);
  const yMidnightEnd = posFor(midnightEndUTC);

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

  // --- midnight labels ---
  const midnightLabels = [
    { y: yMidnightStart, text: '🕛 00:00 Local' },
    { y: yMidnightEnd, text: '🕛 24:00 Local' },
  ];

  // --- own sunrise/sunset labels ---
  const sunLabels = (sunTimes || []).flatMap((s) => {
    const sunriseUTC = new Date(s.sunriseUTC);
    const sunsetUTC = new Date(s.sunsetUTC);
    const fmt = (isoStr) =>
      new Date(isoStr).toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
    return [
      { y: posFor(sunriseUTC), text: `☀️ Sunrise ${fmt(s.sunriseUTC)}` },
      { y: posFor(sunsetUTC), text: `🌙 Sunset ${fmt(s.sunsetUTC)}` },
    ];
  });

  // --- other city's translated sunrise/sunset labels ---
  const otherSunLabels = (otherSunTimes || []).flatMap((s) => {
    const sunriseUTC = new Date(s.sunriseUTC);
    const sunsetUTC = new Date(s.sunsetUTC);
    const sunriseLabel = `${otherCode} Sunrise`;
    const sunsetLabel = `${otherCode} Sunset`;
    const sunriseTime = s.translatedForOther?.sunriseLocal?.match(/(\d{2}:\d{2})/)?.[1];
    const sunsetTime = s.translatedForOther?.sunsetLocal?.match(/(\d{2}:\d{2})/)?.[1];
    return [
      { y: posFor(sunriseUTC), text: `${sunriseLabel} ${sunriseTime || ''}` },
      { y: posFor(sunsetUTC), text: `${sunsetLabel} ${sunsetTime || ''}` },
    ];
  });

  const allEventLabels = [...midnightLabels, ...sunLabels, ...otherSunLabels]
    .filter((ev) => ev.y !== null && ev.y >= 0 && ev.y <= heightPx)
    .map((ev, i) => (
      <React.Fragment key={i}>
        <div style={labelLine(ev.y)} />
        <div style={labelStyle(ev.y, side === 'left' ? 'left' : 'right')}>{ev.text}</div>
      </React.Fragment>
    ));

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

      <div
        style={{
          position: 'relative',
          background: COLORS.night,
          border: `1px solid ${COLORS.rail}`,
          borderRadius: 8,
          height: heightPx,
          overflow: 'visible',
          width: columnWidth,   // fixed px width for a slimmer rail
          margin: 0,            // bring the two rails closer; gap is handled by parent
        }}
      >

        {dayBlocks}
        {/* Hourly gridlines (UTC → localized per city) */}
        {(() => {
          const tickLines = [];
          for (
            let t = utcWindowStart.getTime();
            t <= utcWindowEnd.getTime();
            t += 60 * 60 * 1000 // 1-hour step
          ) {
            tickLines.push(new Date(t));
          }
        
          return tickLines.map((tick, i) => {
            const y = (tick.getTime() - utcWindowStart.getTime()) * pxPerMs;
            const label = tick.toLocaleTimeString('en-GB', {
              timeZone: tz,
              hour: '2-digit',
              minute: '2-digit',
            });
        
            return (
              <React.Fragment key={`tick-${i}`}>
                {/* Line */}
                <div
                  style={{
                    position: 'absolute',
                    top: y,
                    left: 0,
                    right: 0,
                    height: 1,
                    background: 'rgba(0,0,0,0.15)',
                    zIndex: 2, // sits above background but below text labels
                  }}
                />
                {/* Label every hour (works for half-hour and 45-min offsets) */}
                {(i % 1 === 0) && (
                  <div
                    style={{
                      position: 'absolute',
                      top: y,
                      [side === 'left' ? 'right' : 'left']: '105%',
                      fontSize: 10,
                      color: COLORS.text,
                      transform: 'translateY(-50%)',
                      zIndex: 3,
                    }}
                  >
                    {label}
                  </div>
                )}

              </React.Fragment>
            );
          });
        })()}

        {allEventLabels}
      </div>
    </div>
  );
}

export default function Page() {
  const [from, setFrom] = useState('DEPARTURE');
  const [to, setTo] = useState('ARRIVAL');
  const [date, setDate] = useState('2025-11-09');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const [isMobile, setIsMobile] = useState(true);
  const [pxPerHour, setPxPerHour] = useState(pxPerHourMobile);
  
  useEffect(() => {
  const update = () => {
  const mobile = window.innerWidth < 768;
  setIsMobile(mobile);
  setPxPerHour(mobile ? pxPerHourMobile : pxPerHourDesktop);
  };
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
      const url = `/api/overlap?from=${encodeURIComponent(from.trim())}&to=${encodeURIComponent(
        to.trim()
      )}&date=${encodeURIComponent(date)}`;
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
const columnWidth = isMobile ? COLUMN_WIDTH_MOBILE : COLUMN_WIDTH_DESKTOP;
const columnsGap = isMobile ? COLUMNS_GAP_MOBILE : COLUMNS_GAP_DESKTOP;


  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '16px 16px 80px' }}>
      <h1 style={{ fontSize: 22, margin: 0, color: COLORS.text, fontWeight: 800 }}>
        FlightOwl · Light Overlap Tool
      </h1>

      {/* Form */}
      <form
        onSubmit={handleSubmit}
        style={{
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'flex-end',
          marginTop: 16,
          marginBottom: 16,
        }}
      >
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#444' }}>Departure (IATA)</label>
          <input
            value={from}
            onChange={(e) => setFrom(e.target.value.toUpperCase())}
            maxLength={3}
            required
            style={{
              border: '1px solid #ccc',
              borderRadius: 8,
              padding: '8px 10px',
              fontSize: 16,
              width: 120,
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
              border: '1px solid #ccc',
              borderRadius: 8,
              padding: '8px 10px',
              fontSize: 16,
              width: 120,
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
              border: '1px solid #ccc',
              borderRadius: 8,
              padding: '8px 10px',
              fontSize: 16,
            }}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          style={{
            background: '#111',
            color: 'white',
            padding: '10px 14px',
            borderRadius: 10,
            border: '1px solid #111',
            fontSize: 16,
            fontWeight: 700,
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Loading…' : 'Show timeline'}
        </button>
      </form>

      {err && (
        <div
          style={{
            color: '#b00020',
            background: '#ffecec',
            border: '1px solid #ffd3d3',
            padding: 12,
            borderRadius: 8,
            marginBottom: 12,
          }}
        >
          {err}
        </div>
      )}

      {data && timeline && (
        <>
          <div
            style={{
              position: 'sticky',
              top: 0,
              background: 'white',
              zIndex: 5,
              padding: '8px 0 12px',
              borderBottom: `1px solid ${COLORS.rail}`,
            }}
          >
            <div style={{ fontSize: 13, color: '#444', marginBottom: 6 }}>
              Local date: <strong>{data.meta.requestedDateLocal}</strong> · Full UTC window rendered:{' '}
              <strong>{new Date(data.meta.utcWindowStart).toISOString().slice(0, 16)}</strong> →{' '}
              <strong>{new Date(data.meta.utcWindowEnd).toISOString().slice(0, 16)}</strong>
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

          {/* Center-anchored container (Option B layout) */}
          {/* Centered pair using flex (Option A layout) */}
          <div
            style={{
              position: 'relative',
              width: '100vw',                 // full viewport width
              left: '50%',
              transform: 'translateX(-50%)',  // center the pair relative to the viewport
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'flex-start',
              gap: 16, // narrow gap between columns
              minHeight: timeline.heightPx + 25,
              marginTop: 20,
              paddingBottom: 25,
              overflowX: 'hidden',            // prevent side scrollbars
            }}
          >
          {/* Left column — anchored to centerline */}
            <div style={{ transform: `translateX(${columnWidth / 2 - 22}px)` }}>
            <CityColumn
              title={data.from.code}
              tz={data.from.timezone}
              sunTimes={data.from.sunTimes}
              otherSunTimes={data.to.sunTimes}
              otherCode={data.to.code}
              midnights={data.from.midnights}
              utcWindowStart={timeline.windowStart}
              utcWindowEnd={timeline.windowEnd}
              heightPx={timeline.heightPx}
              pxPerMs={timeline.pxPerMs}
              side="left"
              columnWidth={columnWidth}
            />
          </div>
          
          {/* Right column — anchored to centerline */}
          <div style={{ transform: `translateX(-${columnWidth / 2 - 22}px)` }}>
            <CityColumn
              title={data.to.code}
              tz={data.to.timezone}
              sunTimes={data.to.sunTimes}
              otherSunTimes={data.from.sunTimes}
              otherCode={data.from.code}
              midnights={data.to.midnights}
              utcWindowStart={timeline.windowStart}
              utcWindowEnd={timeline.windowEnd}
              heightPx={timeline.heightPx}
              pxPerMs={timeline.pxPerMs}
              side="right"
              columnWidth={columnWidth}
            />
          </div>



          </div>

            <div style={{ marginTop: 18, textAlign: 'center' }}>
              <div style={{ fontWeight: 700, color: COLORS.text, marginBottom: 8 }}>Legend</div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: 16,
                  flexWrap: 'wrap',
                  width: '100%',
                  margin: '0 auto',
                }}
              >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    width: 18,
                    height: 18,
                    background: COLORS.night,
                    borderRadius: 4,
                    border: `1px solid ${COLORS.rail}`,
                  }}
                />
                <span style={{ fontSize: 13 }}>Night</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    width: 18,
                    height: 18,
                    background: COLORS.day,
                    borderRadius: 4,
                    border: `1px solid ${COLORS.rail}`,
                  }}
                />
                <span style={{ fontSize: 13 }}>Daylight</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
