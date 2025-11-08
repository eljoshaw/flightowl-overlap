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

      {!data ? null : <Timelines data={data} />}
    </div>
  );
}

/* ===========================================================
   TIMELINES WRAPPER
   =========================================================== */
function Timelines({ data }) {
  // ---- offsets (hours) from backend (any of these three names) ----
  const offA =
    data.from.utc_offset_hours ?? data.from.offsetHours ?? data.from.utcOffset ?? 0;
  const offB =
    data.to.utc_offset_hours ?? data.to.offsetHours ?? data.to.utcOffset ?? 0;

  // ---- for the selected date, when is *local midnight* (in UTC) for each tz? ----
  const A_midUTC = localMidnightUTC(data.meta.dateUTC, offA); // Date in UTC clock
  const B_midUTC = localMidnightUTC(data.meta.dateUTC, offB); // Date in UTC clock

  // earlier midnight → top-anchored (starts at 00:00)
  // later midnight   → bottom-anchored (ends   at 00:00)
  const aIsEarlier = A_midUTC.getTime() <= B_midUTC.getTime();

  return (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-start",
          gap: 80,
        }}
      >
        {/* Left column is always the one whose midnight is earlier (top-anchored) */}
        <VerticalTimeline
          label={data.from.name}
          tz={data.from.timezone}
          dateUTC={data.meta.dateUTC}
          sunriseUTC={data.from.todayUTC.sunrise}
          sunsetUTC={data.from.todayUTC.sunset}
          offsetHours={offA}
          anchorMode={aIsEarlier ? "top00" : "bottom00"}
          otherSunriseUTC={data.to.todayUTC.sunrise}
          otherSunsetUTC={data.to.todayUTC.sunset}
        />

        <VerticalTimeline
          label={data.to.name}
          tz={data.to.timezone}
          dateUTC={data.meta.dateUTC}
          sunriseUTC={data.to.todayUTC.sunrise}
          sunsetUTC={data.to.todayUTC.sunset}
          offsetHours={offB}
          anchorMode={aIsEarlier ? "bottom00" : "top00"}
          otherSunriseUTC={data.from.todayUTC.sunrise}
          otherSunsetUTC={data.from.todayUTC.sunset}
        />
      </div>

      <Summary data={data} />
    </>
  );
}

/* ===========================================================
   VERTICAL TIMELINE
   =========================================================== */
/**
 * anchorMode:
 * - "top00"    => this column shows its local 00:00 at the TOP
 * - "bottom00" => this column shows its local 00:00 at the BOTTOM
 *
 * We render a fixed 24h viewport (outer). Inside it, we place a 24h track that
 * is vertically shifted so that either its local midnight is at the very top,
 * or (for the later-midnight timezone) at the very bottom.
 *
 * Day/night bands and labels move together (same transform), so alignment stays true.
 */
function VerticalTimeline({
  label,
  tz,
  dateUTC,
  sunriseUTC,
  sunsetUTC,
  offsetHours,
  anchorMode, // "top00" | "bottom00"
  otherSunriseUTC,
  otherSunsetUTC,
}) {
  const PPH = 35; // pixels per hour
  const TRACK_H = 24 * PPH;

  // UTC minutes for own day/night
  const sUTC = toMinutes(sunriseUTC);
  const eUTC = toMinutes(sunsetUTC);

  // UTC minutes for the "other" location (used to draw shared bands)
  const sOtherUTC = toMinutes(otherSunriseUTC);
  const eOtherUTC = toMinutes(otherSunsetUTC);

  // shared daylight / night (simple intersection in [0,1440))
  const dayOverlapStart = Math.max(sUTC, sOtherUTC);
  const dayOverlapEnd = Math.min(eUTC, eOtherUTC);
  const nightOverlapStart = Math.max(eUTC, eOtherUTC);
  const nightOverlapEnd = Math.min(sUTC, sOtherUTC);

  // ----- VERTICAL SHIFT LOGIC -----
  // local midnight (00:00 local) expressed as a UTC hour offset relative to the UTC 00:00 baseline
  // For a tz offset +H (east), local midnight occurs at UTC = -H.
  // We want the top of the track to be that local midnight when anchorMode === "top00",
  // and we want the bottom of the track to be local midnight when anchorMode === "bottom00".
  const baseShiftHours = -offsetHours; // put local midnight at top
  const shiftHours = anchorMode === "top00" ? baseShiftHours : baseShiftHours + 24;
  const translateYPx = shiftHours * PPH;

  // ----- Faint previous/next-day bands -----
  const showPrevH = Math.max(0, shiftHours); // area scrolled in from previous day
  const showNextH = Math.max(0, -shiftHours); // area scrolled in from next day

  // ----- Hour grid labels -----
  // We print 0..24 lines. Their labels are "local time at this y".
  // For anchorMode "top00": label base = local midnight (00:00) of the selected date.
  // For anchorMode "bottom00": label base = local midnight of NEXT local day (so 00:00 is at bottom).
  const localMidBaseUTC =
    anchorMode === "top00"
      ? localMidnightUTC(dateUTC, offsetHours)
      : addHours(localMidnightUTC(dateUTC, offsetHours), 24);

  const hours = Array.from({ length: 25 }, (_, i) => i);

  return (
    <div style={{ textAlign: "center" }}>
      <h3 style={{ margin: 0 }}>{label}</h3>
      <p style={{ margin: "2px 0 10px 0", fontSize: 12, color: "#666" }}>
        {tz.replace("_", "/")}
      </p>

      {/* Fixed 24h viewport */}
      <div
        style={{
          position: "relative",
          width: 160,
          height: TRACK_H,
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          overflow: "hidden",
          background: "#fff",
        }}
      >
        {/* Inner track (shifted) */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            transform: `translateY(${translateYPx}px)`,
            transition: "transform 0.2s ease",
          }}
        >
          {/* hour grid + labels (move with content) */}
          {hours.map((h) => {
            const y = (h / 24) * 100;
            const tickUTC = addHours(localMidBaseUTC, h); // UTC instant for this grid line *in local sequence*
            const labelText = formatInTimeZone(tickUTC, tz, "HH:mm");
            return (
              <div
                key={h}
                style={{
                  position: "absolute",
                  top: `${y}%`,
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
                    top: -7,
                    fontSize: 11,
                    color: "#8a8a8a",
                  }}
                >
                  {labelText}
                </span>
              </div>
            );
          })}

          {/* Nighttime (blue) */}
          {renderSpan({
            start: eUTC,
            end: sUTC,
            color: "rgba(169,201,255,0.85)",
          })}

          {/* Daytime (yellow) */}
          {renderSpan({
            start: sUTC,
            end: eUTC,
            color: "rgba(255,224,102,0.85)",
          })}

          {/* Shared daylight (soft orange overlay) */}
          {dayOverlapEnd > dayOverlapStart &&
            renderSpan({
              start: dayOverlapStart,
              end: dayOverlapEnd,
              color: "rgba(255,165,0,0.18)",
            })}

          {/* Shared night (soft violet/blue overlay) */}
          {nightOverlapEnd > nightOverlapStart &&
            renderSpan({
              start: nightOverlapStart,
              end: nightOverlapEnd,
              color: "rgba(120,120,255,0.12)",
            })}
        </div>

        {/* Faint prev/next day hints (do NOT move with content) */}
        {showPrevH > 0 && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: showPrevH * PPH,
              background:
                "linear-gradient(to bottom, rgba(0,0,0,0.06), rgba(0,0,0,0))",
              pointerEvents: "none",
            }}
          />
        )}
        {showNextH > 0 && (
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: showNextH * PPH,
              background:
                "linear-gradient(to top, rgba(0,0,0,0.06), rgba(0,0,0,0))",
              pointerEvents: "none",
            }}
          />
        )}
      </div>

      {/* UTC sunrise/sunset (debug/info) */}
      <div style={{ fontSize: 12, marginTop: 6 }}>
        <span style={{ marginRight: 8 }}>🌅 {sunriseUTC} UTC</span>
        <span>🌇 {sunsetUTC} UTC</span>
      </div>
    </div>
  );

  // ---- helpers scoped to component ----
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
            left: 10,
            right: 10,
            borderRadius: 10,
            background: color,
            boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.06)",
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
   PURE HELPERS
   =========================================================== */
function toMinutes(hhmm) {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(":").map(Number);
  return (h * 60 + m) % 1440; // 0..1439
}

function addHours(date, h) {
  const d = new Date(date.getTime());
  d.setUTCHours(d.getUTCHours() + h);
  return d;
}

/**
 * Return a Date (UTC clock) corresponding to **00:00 local** on the given date in that tz.
 * If tz offset is +H (east), 00:00 local happens at UTC = dateUTC 00:00 - H hours.
 */
function localMidnightUTC(dateUTC, offsetHours) {
  const d = new Date(`${dateUTC}T00:00:00Z`);
  d.setUTCHours(d.getUTCHours() - offsetHours, 0, 0, 0);
  return d;
}
