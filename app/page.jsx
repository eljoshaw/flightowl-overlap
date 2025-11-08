"use client";

import { useState } from "react";
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
      <h1 style={{ fontWeight: 700, marginBottom: 12 }}>
        FlightOwl Light Overlap
      </h1>

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

      {data && <TimelineComparison data={data} />}
    </div>
  );
}

/* ===========================================================
   TIMELINE COMPARISON (order and columns)
   =========================================================== */
function TimelineComparison({ data }) {
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

  const dateUTC = data.meta.dateUTC;

  const utcMidA = localMidnightUTC(dateUTC, offsetA);
  const utcMidB = localMidnightUTC(dateUTC, offsetB);

  const aComesFirst = utcMidA.getTime() < utcMidB.getTime();

  const left = aComesFirst ? data.from : data.to;
  const right = aComesFirst ? data.to : data.from;
  const offsetLeft = aComesFirst ? offsetA : offsetB;
  const offsetRight = aComesFirst ? offsetB : offsetA;
  const offsetDiff = offsetRight - offsetLeft;

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
          label={left.name}
          tz={left.timezone}
          sunrise={left.todayUTC.sunrise}
          sunset={left.todayUTC.sunset}
          dateUTC={dateUTC}
          offsetDiffHours={0}
          labelMode="top00"
          other={{
            label: right.name,
            tz: right.timezone,
            sunriseUTC: right.todayUTC.sunrise,
            sunsetUTC: right.todayUTC.sunset,
          }}
        />
        <VerticalTimeline
          label={right.name}
          tz={right.timezone}
          sunrise={right.todayUTC.sunrise}
          sunset={right.todayUTC.sunset}
          dateUTC={dateUTC}
          offsetDiffHours={offsetDiff}
          labelMode="bottom00"
          other={{
            label: left.name,
            tz: left.timezone,
            sunriseUTC: left.todayUTC.sunrise,
            sunsetUTC: left.todayUTC.sunset,
          }}
        />
      </div>
      <Summary data={data} />
    </>
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
  offsetDiffHours = 0,
  labelMode = "top00",
  other,
}) {
  const hours = Array.from({ length: 25 }, (_, i) => i);

  const sUTC = toMinutes(sunrise);
  const eUTC = toMinutes(sunset);
  const sOtherUTC = toMinutes(other.sunriseUTC);
  const eOtherUTC = toMinutes(other.sunsetUTC);

  const pixelsPerHour = 35;
  const verticalShift = -offsetDiffHours * pixelsPerHour;
  const totalHeight = 24 * pixelsPerHour + Math.abs(offsetDiffHours) * pixelsPerHour;

  const sharedDayStart = Math.max(sUTC, sOtherUTC);
  const sharedDayEnd = Math.min(eUTC, eOtherUTC);
  const sharedNightStart = Math.max(eUTC, eOtherUTC);
  const sharedNightEnd = Math.min(sUTC, sOtherUTC);

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

  const topFadeColor =
    offsetDiffHours >= 0
      ? "linear-gradient(to bottom, rgba(255,224,102,0.3), rgba(255,224,102,0))"
      : "linear-gradient(to bottom, rgba(169,201,255,0.3), rgba(169,201,255,0))";
  const bottomFadeColor =
    offsetDiffHours >= 0
      ? "linear-gradient(to top, rgba(169,201,255,0.3), rgba(169,201,255,0))"
      : "linear-gradient(to top, rgba(255,224,102,0.3), rgba(255,224,102,0))";

  // Determine label base:
  const thisMidnightUTC = localMidnightUTC(dateUTC, offsetDiffHours < 0 ? offsetDiffHours : offsetDiffHours * 0);
  // Actually use timezone’s offset for label base:
  const baseOffset = offsetDiffHours < 0 ? offsetDiffHours : 0;
  const labelBaseUTC =
    labelMode === "bottom00"
      ? new Date(thisMidnightUTC.getTime() - 24 * 3600 * 1000)
      : thisMidnightUTC;

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
        {hours.map((h) => {
          const hh = String(h).padStart(2, "0");
          const tUTC = new Date(labelBaseUTC.getTime() + h * 3600 * 1000);
          const localLabel = tUTC.toLocaleString("en-GB", {
            timeZone: tz,
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          });
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
                {localLabel}
              </span>
            </div>
          );
        })}

        {/* Nighttime */}
        {renderSpan({ start: eUTC, end: sUTC, color: "rgba(169,201,255,0.8)", z: 2 })}
        {/* Daytime */}
        {renderSpan({ start: sUTC, end: eUTC, color: "rgba(255,224,102,0.8)", z: 3 })}

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

        <div
          style={{
            position: "absolute",
            top: `${-Math.max(offsetDiffHours, 0) * pixelsPerHour}px`,
            left: 0,
            right: 0,
            height: `${Math.max(offsetDiffHours, 0) * pixelsPerHour}px`,
            background: topFadeColor,
            zIndex: 0,
            opacity: 0.7,
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: `${-Math.max(-offsetDiffHours, 0) * pixelsPerHour}px`,
            left: 0,
            right: 0,
            height: `${Math.max(-offsetDiffHours, 0) * pixelsPerHour}px`,
            background: bottomFadeColor,
            zIndex: 0,
            opacity: 0.7,
          }}
        />
      </div>

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

function localMidnightUTC(dateUTC, offsetHours) {
  const utc = new Date(`${dateUTC}T00:00:00Z`);
  utc.setUTCHours(utc.getUTCHours() - offsetHours);
  return utc;
}
