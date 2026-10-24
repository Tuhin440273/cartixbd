'use client';

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: 32, textAlign: 'center', color: '#0F172A', background: '#F8FAFC' }}>
        <h1>Something went wrong</h1>
        <p>The store could not be loaded. Please try again in a moment.</p>
        <button type="button" onClick={reset} style={{ padding: '10px 20px', background: '#2563EB', color: '#fff', border: 0, borderRadius: 8 }}>
          Try again
        </button>
      </body>
    </html>
  );
}
