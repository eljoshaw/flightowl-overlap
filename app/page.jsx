"use client";

import { useState } from "react";

/** ---- small helpers ---- **/
const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

const minutesToPct = (mins) => (mins / 1440) * 100;

const formatLocal = (hhmmUTC, dateISO, timeZone) => {
  // Convert "HH:MM" (UTC) on given date -> time in given IANA timeZone
  const [h, m] = hhmmUTC.split(":").map(Number);
  const base = new Date(`${dateISO}T00:00:00Z`);
  const dt = new Date(base.getTime() + (h * 60 + m) * 60_000);
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone
  }).format(dt);
};

/** ---- UPDATED BAR COMPONENT ---- **/
/** ---- UPDATED BAR COMPONENT WITH 6H GRID LINES ---- **/
function Bar({ airport, sunrise, sunset, dateUTC }) {
  const sunriseMin = toMinutes(sunrise);
  const sunsetMin  = toMinutes(sunset);
  let daySegments = [];

  if (sunriseMin < sunsetMin) {
    daySegments = [{ start: sunriseMin, end: sunsetMin }];
  } else {
    daySegments = [
      { start: 0,         end: sunsetMin },
      { start: sunriseMin, end: 1440    },
    ];
  }

  const renderSegment = (start, end, color) => {
    const left  = (start / 1440) * 100;
    const width = ((end - start) / 1440) * 100;
    return (
      <div
        key={`${color}-${start}-${end}`}
        style={{
          position: "absolute",
          left: `${left}%`,
          width: `${width}%`,
          height: "100%",
          background: color,
          borderRadius: 3,
        }}
      />
    );
  };

  // 6-hour ticks: 00:00, 06:00, 12:00, 18:00, 24:00 (in UTC minutes)
  const ticks = [0, 360, 720, 1080, 1440];

  const labelUTCMinuteAsLocal = (minsUTC) => {
    const base = new Date(`${dateUTC}T00:00:00Z`);
    const dt   = new Date(base.getTime() + minsUTC * 60_000);
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: airport.timezone,
    }).format(dt);
  };

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>
        {airport.name} ({airport.code}) — local time
      </div>

      {/* Timeline container */}
      <div style={{ position: "relative", height: 22, background: "#111", borderRadius: 4, overflow: "hidden" }}>
        {/* --- GRID LINES every 6h (under the segments) --- */}
        {ticks.map((t) => (
          <div
            key={`grid-${t}`}
            style={{
              position: "absolute",
              left: `${(t / 1440) * 100}%`,
              top: 0,
              bottom: 0,
              width: t === 0 || t === 1440 ? 1 : 1,
              background: t === 720 ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.12)", // slightly brighter at 12:00
              pointerEvents: "none",
            }}
          />
        ))}

        {/* Daylight segments on top */}
        {daySegments.map((seg) => renderSegment(seg.start, seg.end, "#FFD966"))}
      </div>

      {/* Local-time tick labels corresponding to those grid lines */}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#666", marginTop: 4 }}>
        {ticks.map((t) => (
          <span key={`label-${t}`}>{labelUTCMinuteAsLocal(t)}</span>
        ))}
      </div>
    </div>
  );
}


/** ---- MAIN PAGE ---- **/
export default function Page() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10)); // default to today

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(
        `/api/overlap?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&date=${encodeURIComponent(date)}`
      );
      const json = await res.json();
      setData(json);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 900, margin: "40px auto", padding: "0 20px" }}>
      <h1 style={{ fontSize: 28, marginBottom: 12 }}>FlightOwl • Daylight Overlap</h1>

      <form onSubmit={handleSubmit} style={{ marginBottom: 18 }}>
        <label style={{ marginRight: 10 }}>
          From:{" "}
          <input
            value={from}
            onChange={(e) => setFrom(e.target.value.toUpperCase())}
            placeholder="DXB"
            maxLength={3}
            required
          />
        </label>
        <label style={{ marginRight: 10 }}>
          To:{" "}
          <input
            value={to}
            onChange={(e) => setTo(e.target.value.toUpperCase())}
            placeholder="SYD"
            maxLength={3}
            required
          />
        </label>
        <label style={{ marginRight: 10 }}>
          Date (UTC):{" "}
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </label>
        <button type="submit" disabled={loading}>{loading ? "Checking..." : "Check"}</button>
      </form>

      {!data && <p style={{ color: "#666" }}>Enter two IATA codes (e.g., DXB and SYD) and press “Check”.</p>}
      {data?.error && <p style={{ color: "crimson" }}>{String(data.error)}</p>}

      {data && !data.error && (
        <>
          <div style={{ marginBottom: 14, color: "#333" }}>
            <strong>UTC Date:</strong> {data.meta?.dateUTC} &nbsp;•&nbsp; <strong>Window:</strong> {data.meta?.windowUTC}
          </div>

          {/* --- UPDATED BAR CALLS --- */}
          <Bar
            airport={data.from}
            sunrise={data.from.todayUTC.sunrise}
            sunset={data.from.todayUTC.sunset}
            dateUTC={data.meta.dateUTC}
          />

          <Bar
            airport={data.to}
            sunrise={data.to.todayUTC.sunrise}
            sunset={data.to.todayUTC.sunset}
            dateUTC={data.meta.dateUTC}
          />

          {/* Shared overlap bands */}
          <h2 style={{ marginTop: 24 }}>Shared Overlap (UTC & Local)</h2>
          <div style={{ display: "grid", gap: 12 }}>
            {/* Daylight overlap */}
            <div style={{ padding: 12, background: "#FFF8E1", border: "1px solid #F5E6A3", borderRadius: 8 }}>
              <strong>Shared Daylight</strong>
              {data.overlap?.daylight?.overlap ? (
                <ul style={{ marginTop: 6 }}>
                  {data.overlap.daylight.segments.map((s, i) => (
                    <li key={i} style={{ lineHeight: 1.6 }}>
                      <span>UTC: {s.startUTC} → {s.endUTC} ({Math.round(s.minutes / 60)}h {s.minutes % 60}m)</span>
                      <br />
                      <span>
                        {data.from.code} local: {formatLocal(s.startUTC, data.meta.dateUTC, data.from.timezone)} → {formatLocal(s.endUTC, data.meta.dateUTC, data.from.timezone)}
                      </span>
                      <br />
                      <span>
                        {data.to.code} local: {formatLocal(s.startUTC, data.meta.dateUTC, data.to.timezone)} → {formatLocal(s.endUTC, data.meta.dateUTC, data.to.timezone)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div style={{ color: "#666" }}>No shared daylight in this UTC day.</div>
              )}
            </div>

            {/* Nighttime overlap */}
            <div style={{ padding: 12, background: "#E9EEFF", border: "1px solid #C9D4FF", borderRadius: 8 }}>
              <strong>Shared Night</strong>
              {data.overlap?.nighttime?.overlap ? (
                <ul style={{ marginTop: 6 }}>
                  {data.overlap.nighttime.segments.map((s, i) => (
                    <li key={i} style={{ lineHeight: 1.6 }}>
                      <span>UTC: {s.startUTC} → {s.endUTC} ({Math.round(s.minutes / 60)}h {s.minutes % 60}m)</span>
                      <br />
                      <span>
                        {data.from.code} local: {formatLocal(s.startUTC, data.meta.dateUTC, data.from.timezone)} → {formatLocal(s.endUTC, data.meta.dateUTC, data.from.timezone)}
                      </span>
                      <br />
                      <span>
                        {data.to.code} local: {formatLocal(s.startUTC, data.meta.dateUTC, data.to.timezone)} → {formatLocal(s.endUTC, data.meta.dateUTC, data.to.timezone)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div style={{ color: "#666" }}>No shared night in this UTC day.</div>
              )}
            </div>
          </div>

          {/* Raw JSON (debug) */}
          <details style={{ marginTop: 18 }}>
            <summary>Debug JSON</summary>
            <pre style={{ background: "#f6f6f6", padding: 12, borderRadius: 6 }}>
              {JSON.stringify(data, null, 2)}
            </pre>
          </details>
        </>
      )}
    </main>
  );
}
