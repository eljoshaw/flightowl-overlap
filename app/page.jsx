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
    const json = await res.json();
    setData(json);
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 20 }}>
      <h1>FlightOwl Light Overlap</h1>

      <form onSubmit={handleSubmit} style={{ marginBottom: 24 }}>
        <input
          placeholder="From (e.g. LHR)"
          value={from}
          onChange={(e) => setFrom(e.target.value.toUpperCase())}
          style={{ marginRight: 8 }}
        />
        <input
          placeholder="To (e.g. SIN)"
          value={to}
          onChange={(e) => setTo(e.target.value.toUpperCase())}
          style={{ marginRight: 8 }}
        />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <button type="submit">Show overlap</button>
      </form>

      {data && (
        <>
          <Bar
            airport={data.from}
            sunrise={data.from.todayUTC.sunrise}
            sunset={data.from.todayUTC.sunset}
            dateUTC={data.meta.dateUTC}
            otherSunrise={data.to.todayUTC.sunrise}
            otherSunset={data.to.todayUTC.sunset}
            otherLabel={data.to.name || data.to.code}
          />

          <Bar
            airport={data.to}
            sunrise={data.to.todayUTC.sunrise}
            sunset={data.to.todayUTC.sunset}
            dateUTC={data.meta.dateUTC}
            otherSunrise={data.from.todayUTC.sunrise}
            otherSunset={data.from.todayUTC.sunset}
            otherLabel={data.from.name || data.from.code}
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
function Bar({
  airport,
  sunrise,
  sunset,
  dateUTC,
  otherSunrise,
  otherSunset,
  otherLabel = "",
}) {
  const ticks = [0, 6, 12, 18, 24];

  return (
    <div style={{ marginBottom: 40 }}>
      <h3>{airport.name}</h3>
      <div style={{ position: "relative", height: 22, background: "var(--axis-bg)" }}>
        {/* Base night layer */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "var(--night-opaque)",
          }}
        />

        {/* Day segment */}
        {renderDaySegment(sunrise, sunset)}

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
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
        {ticks.map((h) => (
          <span key={h}>{h.toString().padStart(2, "0")}:00</span>
        ))}
      </div>

      {/* Own + translated labels */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
        <div style={{ fontSize: 12, lineHeight: 1.3 }}>
          <div style={{ fontWeight: 600 }}>
            00:00 • Sunrise {formatLocal(sunrise, dateUTC, airport.timezone)} • Sunset{" "}
            {formatLocal(sunset, dateUTC, airport.timezone)}
          </div>
          <div style={{ color: "#777" }}>
            {otherLabel} → Sunrise {formatLocal(otherSunrise, dateUTC, airport.timezone)} •
            Sunset {formatLocal(otherSunset, dateUTC, airport.timezone)}
          </div>
        </div>
        <div style={{ fontSize: 12, color: "#777" }}>{airport.timezone}</div>
      </div>
    </div>
  );
}

/* ---------- SUMMARY BOXES ---------- */
function Summary({ data }) {
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
        <strong>Shared Daylight:</strong> {Math.round(data.overlap.daylight.totalMinutes / 60)} h 
        {data.overlap.daylight.totalMinutes % 60} m
      </div>

      <div
        style={{
          padding: 12,
          background: "var(--chip-night-bg)",
          border: "1px solid var(--chip-night-border)",
          borderRadius: 8,
        }}
      >
        <strong>Shared Night:</strong> {Math.round(data.overlap.nighttime.totalMinutes / 60)} h 
        {data.overlap.nighttime.totalMinutes % 60} m
      </div>
    </>
  );
}

/* ---------- HELPERS ---------- */
function renderDaySegment(sunrise, sunset) {
  const start = toMinutes(sunrise);
  const end = toMinutes(sunset);
  const left = (start / 1440) * 100;
  const width = ((end - start) / 1440) * 100;
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: `${left}%`,
        width: `${width}%`,
        background: "var(--day-opaque)",
      }}
    />
  );
}

function toMinutes(hhmm) {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function formatLocal(hhmmUTC, dateUTC, tz) {
  if (!hhmmUTC) return "";
  const [h, m] = hhmmUTC.split(":").map(Number);
  const utcDate = new Date(`${dateUTC}T${hhmmUTC}:00Z`);
  return formatInTimeZone(utcDate, tz, "HH:mm");
}
