"use client";

import { useState } from "react";
import { formatInTimeZone } from "date-fns-tz";

export default function Page() {
  const [data, setData] = useState(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [date, setDate] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    const res = await fetch(`/api/overlap?from=${from}&to=${to}&date=${date}`);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || "Request failed");
    }
    const json = await res.json();
    setData(json);
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 20 }}>
      <h1>FlightOwl Light Overlap</h1>

      <form onSubmit={handleSubmit} style={{ marginBottom: 24, display: "flex", gap: 8 }}>
        <input
          placeholder="From (e.g. LHR)"
          value={from}
          onChange={(e) => setFrom(e.target.value.toUpperCase())}
          style={{ padding: 8 }}
        />
        <input
          placeholder="To (e.g. SIN)"
          value={to}
          onChange={(e) => setTo(e.target.value.toUpperCase())}
          style={{ padding: 8 }}
        />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ padding: 8 }} />
        <button type="submit" style={{ padding: "8px 12px" }}>Show overlap</button>
      </form>

      {data && (
        <>
          {/* FROM city bar */}
          <Bar
            airport={data.from}
            sunrise={data.from.todayUTC.sunrise}
            sunset={data.from.todayUTC.sunset}
            dateUTC={data.meta.dateUTC}
            other={{
              label: data.to.name || data.to.code,
              timezone: data.to.timezone,
              sunriseUTC: data.to.todayUTC.sunrise,
              sunsetUTC: data.to.todayUTC.sunset,
            }}
          />

          {/* TO city bar */}
          <Bar
            airport={data.to}
            sunrise={data.to.todayUTC.sunrise}
            sunset={data.to.todayUTC.sunset}
            dateUTC={data.meta.dateUTC}
            other={{
              label: data.from.name || data.from.code,
              timezone: data.from.timezone,
              sunriseUTC: data.from.todayUTC.sunrise,
              sunsetUTC: data.from.todayUTC.sunset,
            }}
          />

          <div style={{ marginTop: 24 }}>
            <Summary data={data} />
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- TIMELINE BAR ---------- */

function Bar({ airport, sunrise, sunset, dateUTC, other }) {
  const ticks = [0, 6, 12, 18, 24];

  return (
    <div style={{ marginBottom: 40 }}>
      <h3 style={{ marginBottom: 8 }}>{airport.name}</h3>

      <div style={{ position: "relative", height: 22, background: "var(--axis-bg)", borderRadius: 4, overflow: "hidden" }}>
        {/* Base night layer across 0–24 UTC */}
        <div style={{ position: "absolute", inset: 0, background: "var(--night-opaque)" }} />

        {/* Faint spillover = OTHER city's daylight on this UTC rail */}
        {renderDaySegment(other.sunriseUTC, other.sunsetUTC, "var(--day-faint)")}

        {/* Opaque local daylight for THIS city */}
        {renderDaySegment(sunrise, sunset, "var(--day-opaque)")}

        {/* Hour grid */}
        {ticks.map((h) => (
          <div
            key={h}
            style={{
              position: "absolute",
              left: `${(h / 24) * 100}%`,
              top: 0,
              bottom: 0,
              width: 1,
              background: h % 12 === 0 ? "var(--grid-12)" : "var(--grid)",
            }}
          />
        ))}
      </div>

      {/* Tick labels */}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 4 }}>
        {ticks.map((h) => (
          <span key={h}>{String(h).padStart(2, "0")}:00</span>
        ))}
      </div>

      {/* Own + translated labels (under the bar for readability) */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
        <div style={{ fontSize: 12, lineHeight: 1.3 }}>
          <div style={{ fontWeight: 600 }}>
            00:00 • Sunrise {formatLocal(sunrise, dateUTC, airport.timezone)} • Sunset {formatLocal(sunset, dateUTC, airport.timezone)}
          </div>
          <div style={{ color: "#777" }}>
            {other.label} → Sunrise {formatLocal(other.sunriseUTC, dateUTC, airport.timezone)} • Sunset {formatLocal(other.sunsetUTC, dateUTC, airport.timezone)}
          </div>
        </div>
        <div style={{ fontSize: 12, color: "#777" }}>{airport.timezone}</div>
      </div>
    </div>
  );
}

/* ---------- SUMMARY BOXES ---------- */

function Summary({ data }) {
  const dayM = data.overlap.daylight.totalMinutes || 0;
  const nightM = data.overlap.nighttime.totalMinutes || 0;

  return (
    <>
      <div
        style={{
          padding: 12,
          background: "var(--chip-day-bg)",
          border: "1px solid var(--chip-day-border)",
          borderRadius: 8,
          marginBottom: 12,
        }}
      >
        <strong>Shared Daylight:</strong> {Math.floor(dayM / 60)} h {dayM % 60} m
      </div>

      <div
        style={{
          padding: 12,
          background: "var(--chip-night-bg)",
          border: "1px solid var(--chip-night-border)",
          borderRadius: 8,
        }}
      >
        <strong>Shared Night:</strong> {Math.floor(nightM / 60)} h {nightM % 60} m
      </div>
    </>
  );
}

/* ---------- HELPERS ---------- */

function renderDaySegment(sunriseHHMM, sunsetHHMM, color) {
  if (!sunriseHHMM || !sunsetHHMM) return null;
  const start = toMinutes(sunriseHHMM);
  const end = toMinutes(sunsetHHMM);

  // Normal daytime case (sunrise < sunset)
  if (end > start) {
    return (
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: `${(start / 1440) * 100}%`,
          width: `${((end - start) / 1440) * 100}%`,
          background: color,
        }}
      />
    );
  }

  // Polar/edge case (sunset after midnight): split into two segments
  return (
    <>
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: `${(start / 1440) * 100}%`,
          width: `${((1440 - start) / 1440) * 100}%`,
          background: color,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: "0%",
          width: `${(end / 1440) * 100}%`,
          background: color,
        }}
      />
    </>
  );
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return (h * 60 + m) % 1440;
}

function formatLocal(hhmmUTC, dateUTC, tz) {
  if (!hhmmUTC) return "";
  const utcDate = new Date(`${dateUTC}T${hhmmUTC}:00Z`);
  return formatInTimeZone(utcDate, tz, "HH:mm");
}
