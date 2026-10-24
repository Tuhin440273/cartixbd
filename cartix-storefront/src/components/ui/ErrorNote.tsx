export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="container-page pt-4">
      <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
        {message}
      </p>
    </div>
  );
}
