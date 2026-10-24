'use client';

import { useEffect } from 'react';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="container-page py-16">
      <div className="card mx-auto flex max-w-lg flex-col items-center gap-3 px-6 py-12 text-center" role="alert">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="text-sm text-muted">We could not load this page. Please try again in a moment.</p>
        <button type="button" className="btn-primary mt-2" onClick={reset}>Try again</button>
      </div>
    </div>
  );
}
