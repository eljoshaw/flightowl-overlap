"use client";

import { useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import "./globals.css";

/* ===========================================================
   PAGE
   =========================================================== */
export default function Page() {
  const [data, setData] = useState(null);
  const [from, setFrom] = useState("LHR");
  const [to, setTo] = useState("SIN");
  const [date, setDate] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    const res = await fetch(`/api/overlap?from=${from}&to=${to}&date=${date}`);
    const json = await res.json();
    setData(json);
  }

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: 20 }}>
      <h1 style={{ fontWeight: 800, marginBottom: 16 }}>FlightOwl Light Overlap</h1>

      <form
        onSubmit={handleSubmit}
        style={{ marginBottom: 20, display: "flex", gap: 10, flexWrap: "wrap" }}
      >
        <input
          placeholder="From (e.g. LHR)"
          value={from}
          onChange={(e) => setFrom(e.target.value.toUpperCase())}
          style={{ padding: 10 }}
        />
        <input
          placeholder="To (e.g. SIN)"
          value={to}
          onChange={(e) => setTo(e.target.value.toUpperCase())}
          style={{ padding: 10 }}
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={{ padding: 10 }}
        />
        <button type="submit" style={{ padding: "10px 14px" }}>
          Show overlap
        </button>
      </form>

      {data && <TimelinePair data={data} />}
    </div>
  );
}

/* ===========================================================
   TIMELINE PAIR LOGIC
   =========================================================== */
function TimelinePair({ data }) {
  const offA =
    data.from.utc_offset_hours ?? data.from.offsetHours ?? data.from.utcOffset ?? 0;
  const offB =
    data.to.utc_offset_hours ?? data.to.offsetHours ?? data.to.utcOffset ?? 0;

  const dateUTC = data.meta.dateUTC;
  const midA = localMidnightUTC(dateUTC, offA);
  const midB = localMidnightUTC(dateUTC, offB);

  // earlier midnight -> starts at top; later midnight -> ends at bottom
  const aEarlier = midA.getTime() <= midB.getTime();

  const first = aEarlier ? data.from : data.to;
  const second = aEarlier ? data.to : data.from;
  const firstOffset = aEarlier ? offA : offB;
  const secondOffset = aEarlier ? offB : offA;

  return (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-start",
          gap: 60,
        }}
      >
        <Timeline
          airport={first}
          offsetHours={firstOffset}
          dateUTC={dateUTC}
          anchor="start"
          other={second}
        />
        <Timeline
          airport={second}
          offsetHours={secondOffset}
          dateUTC={dateUTC}
          anchor="end"
          other={first}
        />
      </div>
      <Summary data={data} />
    </>
  );
}

/* ===========================================================
   SINGLE TIMELINE COMPONENT
   =========================================================== */
function Timeline({ airport, offsetHours, dateUTC, anchor, other }) {
  const tz = airport.timezone;
  const sunrise = airport.todayUTC.sunrise;
  const sunset = airport.todayUTC.sunset;
  const sUTC = toMinutes(sunrise);
  const eUTC = toMinutes(sunset);

  const sOtherUTC = toMinutes(other.todayUTC.sunrise);
  const eOtherUTC = toMinutes(other.todayUTC.sunset);

  const sharedDayStart = Math.max(sUTC, sOtherUTC);
  const sharedDayEnd = Math.min(eUTC, eOtherUTC);
  const sharedNightStart = Math.max(eUTC, eOtherUTC);
  const sharedNightEnd = Math.min(sUTC, sOtherUTC);

  const PPH = 35;
  const TRACK_H = 24 * PPH;

  const midUTC = localMidnightUTC(dateUTC, offsetHours);
  const shiftY = anchor === "start" ? -offsetHours * PPH : (24 - offsetHours) * PPH;

  const hours = Array.from({ length: 25 }, (_, i) => i);
  const labelBaseUTC =
    anchor === "end" ? addHours(midUTC, 24) : midUTC;

  return (
    <div style={{ textAlign: "center" }}>
      <h3 style={{ marginBottom: 2 }}>{airport.name}</h3>
      <p style={{ margin: 0, fontSize: 12, color: "#666" }}>{tz.replace("_", "/")}</p>

      <div
        style={{
          position: "relative",
          width: 150,
          height: TRACK_H,
          borderRadius: 10,
          border: "1px solid #ddd",
          overflow: "hidden",
          background: "#fff",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            transform: `translateY(${shiftY}px)`,
            transition: "transform 0.3s ease",
          }}
        >
          {/* Hour grid */}
          {hours.map((h) => {
            const tickUTC = addHours(labelBaseUTC, h);
            const label = formatInTimeZone(tickUTC, tz, "HH:mm");
            return (
              <div
                key={h}
                style={{
                  position: "absolute",
                  top: `${(h / 24) * 100}%`,
                  left: 0,
                  right: 0,
                  height: 1,
                  background: "rgba(0,0,0,0.06)",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    left: "-44px",
                    top: "-7px",
                    fontSize: 11,
                    color: "#999",
                  }}
                >
                  {label}
                </span>
              </div>
            );
          })}

          {/* Night */}
          {renderSpan({ start: eUTC, end: sUTC, color: "rgba(169,201,255,0.85)" })}
          {/* Day */}
          {renderSpan({ start: sUTC, end: eUTC, color: "rgba(255,224,102,0.85)" })}
          {/* Shared Day */}
          {sharedDayEnd > sharedDayStart &&
            renderSpan({
              start: sharedDayStart,
              end: sharedDayEnd,
              color: "rgba(255,165,0,0.18)",
            })}
          {/* Shared Night */}
          {sharedNightEnd > sharedNightStart &&
            renderSpan({
              start: sharedNightStart,
              end: sharedNightEnd,
              color: "rgba(169,201,255,0.12)",
            })}
        </div>
      </div>

      <div style={{ fontSize: 12, marginTop: 6 }}>
        🌅 {sunrise} UTC <br />
        🌇 {sunset} UTC
      </div>
    </div>
  );

  function renderSpan({ start, end, color }) {
    const blocks = [];
    const push = (a, b) =>
      blocks.push(
        <div
          key={`${a}-${b}-${color}`}
          style={{
            position: "absolute",
            top: `${(a / 1440) * 100}%`,
            height: `${((b - a) / 1440) * 100}%`,
            left: 0,
            right: 0,
            background: color,
            borderRadius: 6,
          }}
        />
      );
    if (end > start) push(start, end);
    else {
      push(start, 1440);
      push(0, end);
    }
    return blocks;
  }
}

/* ===========================================================
   SUMMARY
   =========================================================== */
function Summary({ data }) {
  const dayM = data.overlap.daylight.totalMinutes || 0;
  const nightM = data.overlap.nighttime.totalMinutes || 0;

  return (
    <div style={{ marginTop: 30 }}>
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

function localMidnightUTC(dateUTC, offsetHours) {
  const d = new Date(`${dateUTC}T00:00:00Z`);
  d.setUTCHours(d.getUTCHours() - offsetHours);
  return d;
}

function addHours(date, h) {
  const d = new Date(date);
  d.setUTCHours(d.getUTCHours() + h);
  return d;
}
