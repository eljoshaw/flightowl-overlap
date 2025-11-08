"use client";

import { useState } from "react";
import { formatInTimeZone } from "date-fns-tz";

/* ===========================================================
   MAIN PAGE
   =========================================================== */
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
      <h1 style={{ fontWeight: 700, marginBottom: 12 }}>FlightOwl Light Overlap</h1>

      <form
        onSubmit={handleSubmit}
        style={{ marginBottom: 24, display: "flex", gap: 8, flexWrap: "wrap" }}
      >
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
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={{ padding: 8 }}
        />
        <button type="submit" style={{ padding: "8px 12px" }}>
          Show overlap
        </button>
      </form>

      {data && (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "flex-start",
              gap: 60,
              height: 520,
            }}
          >
            <VerticalTimeline
              label={data.from.name}
              tz={data.from.timezone}
              sunrise={data.from.todayUTC.sunrise}
              sunset={data.from.todayUTC.sunset}
              dateUTC={data.meta.dateUTC}
              other={{
                label: data.to.name,
                sunriseUTC: data.to.todayUTC.sunrise,
                sunsetUTC: data.to.todayUTC.sunset,
              }}
            />
            <VerticalTimeline
              label={data.to.name}
              tz={data.to.timezone}
              sunrise={data.to.todayUTC.sunrise}
              sunset={data.to.todayUTC.sunset}
              dateUTC={data.meta.dateUTC}
              other={{
                label: data.from.name,
                sunriseUTC: data.from.todayUTC.sunrise,
                sunsetUTC: data.from.todayUTC.sunset,
              }}
            />
          </div>

          <Summary data={data} />
        </>
      )}
    </div>
  );
}

/* ===========================================================
   VERTICAL TIMELINE COMPONENT
   =========================================================== */
function VerticalTimeline({ label, tz, sunrise, sunset, dateUTC, other }) {
  const hours = Array.from({ length: 25 }, (_, i) => i); // 0–24

  // convert hh:mm → fraction of 24 h
  const s = toMinutes(sunrise) / 1440;
  const e = toMinutes(sunset) / 1440;
  const otherS = toMinutes(other.sunriseUTC) / 1440;
  const otherE = toMinutes(other.sunsetUTC) / 1440;

  return (
    <div style={{ textAlign: "center" }}>
      <h3 style={{ marginBottom: 4 }}>{label}</h3>
      <p style={{ margin: 0, fontSize: 12, color: "#666" }}>{tz}</p>

      <div
        style={{
          position: "relative",
          height: 440,
          width: 130,
          margin: "10px auto",
          border: "1px solid #ddd",
          borderRadius: 6,
          background: "var(--night-opaque)",
          overflow: "hidden",
        }}
      >
        {/* --- Other city's daylight (faint spillover) --- */}
        <div
          style={{
            position: "absolute",
            top: `${otherS * 100}%`,
            height: `${(otherE - otherS) * 100}%`,
            left: 0,
            right: 0,
            background: "var(--day-faint)",
          }}
        />

        {/* --- This city's daylight (solid yellow) --- */}
        <div
          style={{
            position: "absolute",
            top: `${s * 100}%`,
            height: `${(e - s) * 100}%`,
            left: 0,
            right: 0,
            background: "var(--day-opaque)",
          }}
        />

        {/* --- Grid lines --- */}
        {hours.map((h) => (
          <div
            key={h}
            style={{
              position: "absolute",
              top: `${(h / 24) * 100}%`,
              left: 0,
              right: 0,
              borderTop: h % 6 === 0 ? "1px solid #bbb" : "1px solid #eee",
              fontSize: 10,
              color: "#666",
              paddingLeft: 4,
              display: "flex",
              alignItems: "center",
            }}
          >
            {h % 6 === 0 ? `${String(h).padStart(2, "0")}:00` : ""}
          </div>
        ))}
      </div>

      <div style={{ fontSize: 12, marginTop: 4 }}>
        🌅 Sunrise {formatLocal(sunrise, dateUTC, tz)} <br />
        🌇 Sunset {formatLocal(sunset, dateUTC, tz)}
      </div>
    </div>
  );
}

/* ===========================================================
   SUMMARY BOXES
   =========================================================== */
function Summary({ data }) {
  const dayM = data.overlap.daylight.totalMinutes || 0;
  const nightM = data.overlap.nighttime.totalMinutes || 0;

  return (
    <div style={{ marginTop: 24 }}>
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
    </div>
  );
}

/* ===========================================================
   HELPERS
   =========================================================== */
function toMinutes(hhmm) {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function formatLocal(hhmmUTC, dateUTC, tz) {
  if (!hhmmUTC) return "";
  const utcDate = new Date(`${dateUTC}T${hhmmUTC}:00Z`);
  return formatInTimeZone(utcDate, tz, "HH:mm");
}
