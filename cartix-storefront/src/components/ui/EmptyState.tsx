import Link from 'next/link';

export function EmptyState({
  title,
  text,
  action,
  level = 2,
}: {
  title: string;
  text?: string;
  action?: { href: string; label: string };
  /** Use 1 when the empty state is the whole page. */
  level?: 1 | 2;
}) {
  const Heading = level === 1 ? 'h1' : 'h2';
  return (
    <div className="card mx-auto flex max-w-lg flex-col items-center gap-3 px-6 py-12 text-center">
      <Heading className="text-lg font-semibold">{title}</Heading>
      {text && <p className="text-sm text-muted">{text}</p>}
      {action && (
        <Link href={action.href} className="btn-primary mt-2">
          {action.label}
        </Link>
      )}
    </div>
  );
}
