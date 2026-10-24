import { useState } from 'react';

export function Toast({ message }: { message: string | null }) {
  return message ? <div className="toast" role="status">{message}</div> : null;
}

export function Pager({ page, last, onPage }: { page: number; last: number; onPage: (p: number) => void }) {
  if (last <= 1) return null;
  return (
    <nav className="actions" aria-label="Pages" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
      <button className="btn btn-sm" type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
      <span className="muted num">Page {page} of {last}</span>
      <button className="btn btn-sm" type="button" disabled={page >= last} onClick={() => onPage(page + 1)}>Next</button>
    </nav>
  );
}

export function FieldError({ message }: { message?: string }) {
  return message ? <span className="error-text">{message}</span> : null;
}

/** A button that asks "Are you sure?" inline before running a destructive action (no browser dialogs). */
export function ConfirmButton({ label, confirmLabel = 'Yes, continue', onConfirm, disabled, danger = true }: {
  label: string;
  confirmLabel?: string;
  onConfirm: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return <button type="button" className={`btn btn-sm${danger ? ' btn-danger' : ''}`} disabled={disabled} onClick={() => setAsking(true)}>{label}</button>;
  }
  return (
    <span className="actions" role="group" aria-label="Confirm">
      <button type="button" className="btn btn-sm btn-danger" onClick={() => { setAsking(false); onConfirm(); }}>{confirmLabel}</button>
      <button type="button" className="btn btn-sm" onClick={() => setAsking(false)}>Cancel</button>
    </span>
  );
}
