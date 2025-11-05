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

function Bar({ label, segments, color, height = 18 }) {
  // segments: [{ startUTC, endUTC }] (times as "HH:MM")
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{label}</div>
      <div style={{ position: "relative", height, background: "#eee", borderRadius: 6 }}>
        {/* baseline night background */}
        <div
          style={{
            position: "absolute", inset: 0, background:
              "repeating-linear-gradient(90deg,#f7f7f7 0 40px,#f1f1f1 40px 80px)"
          }}
        />
        {segments.map((seg, idx) => {
          const left = minutesToPct(toMinutes(seg.startUTC));
          const right = minutesToPct(toMinutes(seg.endUTC));
          const width = Math.max(0, right - left);
          return (
            <div
              key={idx}
              title={`${seg.startUTC} → ${seg.endUTC}`}
              style={{
                position: "absolute",
                left: `${left}%`,
                width: `${width}%`,
                top: 0,
                bottom: 0,
                background: color,
                borderRadius: 4,
                opacity: 0.9,
              }}
            />
          );
        })}
        {/* tick marks each 6 hours */}
        {[0, 360, 720, 1080, 1440].map((t) => (
          <div
            key={t}
            style={{
              position: "absolute",
              left: `${minutesToPct(t)}%`,
              top: 0,
              bottom: 0,
              width: 1,
              background: "rgba(0,0,0,0.08)"
            }}
          />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#666" }}>
        <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span>
      </div>
    </div>
  );
}

export default function Page() {
  const [from, setFrom] = useState("DXB");
  const [to, setTo] = useState("SYD");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/overlap?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error(err);
      setData({ error: "Failed to fetch" });
    } finally {
      setLoading(false);
    }
  }

  // Build per-airport day/night bars from todayUTC sunrise/sunset
  const daySegs = (sunrise, sunset) => [{ startUTC: sunrise, endUTC: sunset }];
  const nightSegs = (sunrise, sunset) => [
    { startUTC: "00:00", endUTC: sunrise },
    { startUTC: sunset,  endUTC: "24:00" },
  ];

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
        <button type="submit" disabled={loading}>{loading ? "Checking..." : "Check"}</button>
      </form>

      {!data && <p style={{ color: "#666" }}>Enter two IATA codes (e.g., DXB and SYD) and press “Check”.</p>}
      {data?.error && <p style={{ color: "crimson" }}>{String(data.error)}</p>}

      {data && !data.error && (
        <>
          <div style={{ marginBottom: 14, color: "#333" }}>
            <strong>UTC Date:</strong> {data.meta?.dateUTC} &nbsp;•&nbsp; <strong>Window:</strong> {data.meta?.windowUTC}
          </div>

          {/* Airport day/night bars */}
          <Bar
            label={`${data.from.name} (${data.from.code}) — daylight`}
            segments={daySegs(data.from.todayUTC.sunrise, data.from.todayUTC.sunset)}
            color="#FFD966"
          />
          <Bar
            label={`${data.from.name} (${data.from.code}) — nighttime`}
            segments={nightSegs(data.from.todayUTC.sunrise, data.from.todayUTC.sunset)}
            color="#2F2F86"
          />

          <Bar
            label={`${data.to.name} (${data.to.code}) — daylight`}
            segments={daySegs(data.to.todayUTC.sunrise, data.to.todayUTC.sunset)}
            color="#FFD966"
          />
          <Bar
            label={`${data.to.name} (${data.to.code}) — nighttime`}
            segments={nightSegs(data.to.todayUTC.sunrise, data.to.todayUTC.sunset)}
            color="#2F2F86"
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
                      <span>UTC: {s.startUTC} → {s.endUTC} ({Math.round(s.minutes/60)}h {s.minutes%60}m)</span>
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
                      <span>UTC: {s.startUTC} → {s.endUTC} ({Math.round(s.minutes/60)}h {s.minutes%60}m)</span>
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
