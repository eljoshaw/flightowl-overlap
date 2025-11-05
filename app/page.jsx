'use client';
import { useState } from 'react';
import { supabase } from '../utils/supabaseClient';

export default function Home() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [result, setResult] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();

    const { data: fromAirport } = await supabase
      .from('airports')
      .select('name, country, latitude, longitude, timezone')
      .eq('iata', from)
      .single();

    const { data: toAirport } = await supabase
      .from('airports')
      .select('name, country, latitude, longitude, timezone')
      .eq('iata', to)
      .single();

    if (!fromAirport || !toAirport) {
      setResult('Could not find one or both airports.');
      return;
    }

    setResult({
      from: fromAirport,
      to: toAirport,
    });
  }

  return (
    <main style={{ maxWidth: 700, margin: '40px auto', padding: 16, fontFamily: 'system-ui' }}>
      <h1>FlightOwl • Daylight Overlap Tool</h1>
      <form onSubmit={handleSubmit}>
        <label>
          From: <input value={from} onChange={e => setFrom(e.target.value.toUpperCase())} required />
        </label>
        <br />
        <label>
          To: <input value={to} onChange={e => setTo(e.target.value.toUpperCase())} required />
        </label>
        <br />
        <button type="submit">Check</button>
      </form>

      {result && (
        <div style={{ marginTop: 30 }}>
          <h3>Results</h3>
          {typeof result === 'string' ? (
            <p>{result}</p>
          ) : (
            <>
              <p><strong>From:</strong> {result.from.name} ({result.from.country})</p>
              <p><strong>To:</strong> {result.to.name} ({result.to.country})</p>
            </>
          )}
        </div>
      )}
    </main>
  );
}
