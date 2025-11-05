export default function Home() {
  return (
    <main style={{maxWidth: 700, margin: "40px auto", padding: 16, fontFamily: "system-ui"}}>
      <h1>FlightOwl • Daylight Overlap Tool</h1>
      <p>Enter two airports and a date:</p>
      <form action="/api/overlap" method="GET">
        <label>From: <input name="from" placeholder="DXB" required /></label><br />
        <label>To: <input name="to" placeholder="SYD" required /></label><br />
        <label>Date (YYYY-MM-DD): <input name="date" required /></label><br />
        <button type="submit">Calculate</button>
      </form>
    </main>
  );
}
