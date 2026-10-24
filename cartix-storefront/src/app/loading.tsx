export default function Loading() {
  return (
    <div className="container-page py-8" role="status" aria-label="Loading">
      <div className="mb-6 h-8 w-48 animate-pulse rounded-lg bg-line" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="card overflow-hidden">
            <div className="aspect-[4/5] animate-pulse bg-line/60" />
            <div className="space-y-2 p-3">
              <div className="h-4 w-3/4 animate-pulse rounded bg-line" />
              <div className="h-4 w-1/3 animate-pulse rounded bg-line" />
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">Loading...</span>
    </div>
  );
}
