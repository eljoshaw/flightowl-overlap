"use client";

import { useState } from "react";
import { formatInTimeZone, zonedTimeToUtc } from "date-fns-tz";
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

      {/* Input form */}
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

      {/* Visualization */}
      {data && (() => {
        const offsetA =
          data.from.utc_offset_hours ??
          data.from.offsetHours ??
          data.from.utcOffset ??
          0;
        const offsetB =
          data.to.utc_offset_hours ??
          data.to.offsetHours ??
          data.to.utcOffset ??
          0;
        const offsetDiffHours = offsetB - offsetA;

        return (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "flex-start",
                gap: 60,
                position: "relative",
                zIndex: 2,
              }}
            >
              <VerticalTimeline
                label={data.from.name}
                tz={data.from.timezone}
                sunrise={data.from.todayUTC.sunrise}
                sunset={data.from.todayUTC.sunset}
                dateUTC={data.meta.dateUTC}
                offsetDiffHours={0}
                other={{
                  label: data.to.name,
                  tz: data.to.timezone,
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
                offsetDiffHours={offsetDiffHours}
                other={{
                  label: data.from.name,
                  tz: data.from.timezone,
                  sunriseUTC: data.from.todayUTC.sunrise,
                  sunsetUTC: data.from.todayUTC.sunset,
                }}
              />
            </div>

            <Summary data={data} />
          </>
        );
      })()}
    </div>
  );
}

/* ===========================================================
   VERTICAL TIMELINE COMPONENT
   =========================================================== */
function VerticalTimeline({
  label,
  tz,
  sunrise,
  sunset,
  dateUTC,
  other,
}) {
  const hours = Array.from({ length: 25 }, (_, i) => i);

  const sUTC = toMinutes(sunrise);
  const eUTC = toMinutes(sunset);
  const sOtherUTC = toMinutes(other.sunriseUTC);
  const eOtherUTC = toMinutes(other.sunsetUTC);

  // compute offset using real local midnights
  const localMidnightUTC = zonedTimeToUtc(`${dateUTC}T00:00:00`, tz);
  const otherMidnightUTC = zonedTimeToUtc(`${dateUTC}T00:00:00`, other.tz);
  const offsetHoursReal =
    (otherMidnightUTC.getTime() - localMidnightUTC.getTime()) / (1000 * 60 * 60);

  const pixelsPerHour = 35;
  const verticalShift = -offsetHoursReal * pixelsPerHour;
  const totalHeight = 24 * pixelsPerHour + Math.abs(offsetHoursReal) * pixelsPerHour;

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

  const sharedDayStart = Math.max(sUTC, sOtherUTC);
  const sharedDayEnd = Math.min(eUTC, eOtherUTC);
  const sharedNightStart = Math.max(eUTC, eOtherUTC);
  const sharedNightEnd = Math.min(sUTC, sOtherUTC);

  const topFadeColor =
    offsetHoursReal >= 0
      ? "linear-gradient(to bottom, rgba(255,224,102,0.3), rgba(255,224,102,0))"
      : "linear-gradient(to bottom, rgba(169,201,255,0.3), rgba(169,201,255,0))";
  const bottomFadeColor =
    offsetHoursReal >= 0
      ? "linear-gradient(to top, rgba(169,201,255,0.3), rgba(169,201,255,0))"
      : "linear-gradient(to top, rgba(255,224,102,0.3), rgba(255,224,102,0))";

  return (
    <div style={{ textAlign: "center" }}>
      <h3 style={{ marginBottom: 2 }}>{label}</h3>
      <p style={{ margin: 0, fontSize: 12, color: "#666" }}>{tz.replace("_", "/")}</p>

      <div
        style={{
          position: "relative",
          height: totalHeight,
          width: 140,
          margin: "20px auto",
          borderRadius: 10,
          border: "1px solid #ddd",
          background: "#fff",
          overflow: "visible",
          transform: `translateY(${verticalShift}px)`,
          transition: "transform 0.3s ease",
        }}
      >
        {/* Hour grid - full local midnight→midnight */}
        {hours.map((h) => {
          const hh = String(h).padStart(2, "0");
          const localTime = new Date(`${dateUTC}T${hh}:00:00`);
          const labelTime = formatInTimeZone(localTime, tz, "HH:mm");
          return (
            <div
              key={h}
              style={{
                position: "absolute",
                top: `${(h / 24) * 100}%`,
                left: 0,
                right: 0,
                height: 1,
                background: "rgba(0,0,0,0.08)",
                zIndex: 1,
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
                {labelTime}
              </span>
            </div>
          );
        })}

        {/* Nighttime */}
        {renderSpan({ start: eUTC, end: sUTC, color: "rgba(169,201,255,0.8)", z: 2 })}

        {/* Daytime */}
        {renderSpan({ start: sUTC, end: eUTC, color: "rgba(255,224,102,0.8)", z: 3 })}

        {/* Shared sections */}
        {sharedDayEnd > sharedDayStart &&
          renderSpan({
            start: sharedDayStart,
            end: sharedDayEnd,
            color: "rgba(255,165,0,0.18)",
            dashed: true,
            z: 4,
          })}
        {sharedNightEnd > sharedNightStart &&
          renderSpan({
            start: sharedNightStart,
            end: sharedNightEnd,
            color: "rgba(255,165,0,0.12)",
            dashed: true,
            z: 4,
          })}

        {/* Fade bands */}
        <div
          style={{
            position: "absolute",
            top: `${-Math.max(offsetHoursReal, 0) * pixelsPerHour}px`,
            left: 0,
            right: 0,
            height: `${Math.max(offsetHoursReal, 0) * pixelsPerHour}px`,
            background: topFadeColor,
            zIndex: 0,
            opacity: 0.7,
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: `${-Math.max(-offsetHoursReal, 0) * pixelsPerHour}px`,
            left: 0,
            right: 0,
            height: `${Math.max(-offsetHoursReal, 0) * pixelsPerHour}px`,
            background: bottomFadeColor,
            zIndex: 0,
            opacity: 0.7,
          }}
        />
      </div>

      {/* Sunrise / Sunset info */}
      <div style={{ fontSize: 12, marginTop: 4 }}>
        🌅 {sunrise} UTC <br />
        🌇 {sunset} UTC
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
    <div style={{ marginTop: 40, position: "relative", zIndex: 3 }}>
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
