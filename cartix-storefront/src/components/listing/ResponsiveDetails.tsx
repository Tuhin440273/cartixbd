'use client';

import { useEffect, useRef } from 'react';

/** A details element that starts open on large screens and collapsed on phones. */
export function ResponsiveDetails({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (ref.current && window.matchMedia('(min-width: 1024px)').matches) ref.current.open = true;
  }, []);
  return (
    <details ref={ref} className={className}>
      {children}
    </details>
  );
}
