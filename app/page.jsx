"use client";

import { useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import "./globals.css";

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
  const hours = Array.from({ length: 25 }, (_, i) => i);

  // convert this city's times
  const sLocal = toMinutes(sunrise);
  const eLocal = toMinutes(sunset);

  // convert other city's UTC → this city's local
  const otherSunriseLocal = formatLocal(other.sunriseUTC, dateUTC, tz);
  const otherSunsetLocal = formatLocal(other.sunsetUTC, dateUTC, tz);
  const sOtherLocal = toMinutes(otherSunriseLocal);
  const eOtherLocal = toMinutes(otherSunsetLocal);

  // helper to draw a block that might cross midnight
  const renderSpan = ({ start, end, color, dashed = false, z = 2 }) => {
    const blocks = [];
    const push = (a, b) =>
      blocks.push(
        <div
          key={`${a}-${b}-${color}-${dashed}`}
          style={{
            position: "absolute",
            top: `${(a / 1440) * 100}%`,
            height: `${((b - a) / 1440) * 100}%`,
            left: 0,
            right: 0,
            background: color,
            border: dashed ? "2px dashed orange" : "none",
            borderRadius: 6,
            zIndex: z,
          }}
        />
      );

    if (end > start) push(start, end);
    else {
      push(start, 1440);
      push(0, end);
    }
    return blocks;
  };

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
        {/* Faint band of the other city's daylight */}
        {renderSpan({
          start: sOtherLocal,
          end: eOtherLocal,
          color: "var(--day-faint)",
          z: 2,
        })}

        {/* This city's daylight */}
        {renderSpan({
          start: sLocal,
          end: eLocal,
          color: "var(--day-opaque)",
          z: 3,
        })}

        {/* Orange dashed overlap */}
        {renderSpan({
          start: Math.max(sLocal, sOtherLocal),
          end: Math.min(eLocal, eOtherLocal),
          color: "rgba(255,165,0,0.15)",
          dashed: true,
          z: 4,
        })}

        {/* Hour grid lines */}
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
              zIndex: 1,
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
          background: "rgba(255,224,102,0.18)",
          border: "1px solid rgba(255,224,102,0.6)",
          borderRadius: 8,
          marginBottom: 12,
        }}
      >
        <strong>Shared Daylight:</strong> {Math.floor(dayM / 60)} h {dayM % 60} m
      </div>

      <div
        style={{
          padding: 12,
          background: "rgba(169,201,255,0.18)",
          border: "1px solid rgba(169,201,255,0.6)",
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
