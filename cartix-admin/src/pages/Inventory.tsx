import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, dhakaDateTime } from '../api';
import type { InventoryRow, Paged, StockMovement } from '../api';
import { useAuth } from '../auth';
import { Skeleton } from '../components/Layout';
import { Pager, Toast } from '../components/ui';
import { useToast } from '../components/hooks';

const STATE_LABEL = { in: 'In stock', low: 'Low', out: 'Out of stock' } as const;

type StockResult = { quantity: number; reserved: number; available: number };

function withStock(row: InventoryRow, s: StockResult): InventoryRow {
  const state = s.available <= 0 ? 'out' : s.available <= row.threshold ? 'low' : 'in';
  return { ...row, quantity: s.quantity, reserved: s.reserved, available: s.available, state };
}

export function Inventory() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const stock = params.get('stock') ?? '';
  const page = Number(params.get('page') ?? '1');
  const [search, setSearch] = useState(q);
  const [data, setData] = useState<Paged<InventoryRow> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [toast, showToast] = useToast();

  const load = useCallback(() => {
    api<Paged<InventoryRow>>('/inventory', { query: { q, stock, page } }).then(setData).catch((e: Error) => setError(e.message));
  }, [q, stock, page]);
  useEffect(load, [load]);

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in changes)) next.delete('page');
    setParams(next);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Inventory</h1>
          <span className="muted">Available = on hand minus stock reserved for open orders.</span>
        </div>
      </div>
      <div className="filters">
        <form className="actions" role="search" onSubmit={(e: FormEvent) => { e.preventDefault(); update({ q: search.trim() }); }}>
          <label htmlFor="isearch" className="sr-only">Search stock</label>
          <input id="isearch" className="input" style={{ width: 240 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Product name or SKU" />
          <button className="btn" type="submit">Search</button>
        </form>
        <div className="chips" role="group" aria-label="Stock level">
          {[['', 'All'], ['low', 'Low'], ['out', 'Out of stock'], ['in', 'In stock']].map(([v, l]) => (
            <button key={v} type="button" className="chip" aria-pressed={stock === v} onClick={() => update({ stock: v! })}>{l}</button>
          ))}
        </div>
      </div>
      {error && <div className="alert" role="alert">{error}</div>}
      <section className="card">
        {!data ? <Skeleton rows={8} /> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Product</th><th>SKU</th><th>On hand</th><th>Reserved</th><th>Available</th><th>Alert at</th><th><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody>
                {data.data.map((r) => (
                  <InventoryLine key={r.variant_id} row={r} canAdjust={can('inventory.manage')} open={open === r.variant_id}
                    onToggle={() => setOpen(open === r.variant_id ? null : r.variant_id)}
                    onSaved={(msg, stock) => {
                      // Update the row in place: reloading would re-sort the list and move the row away.
                      showToast(msg);
                      setData((d) => d && { ...d, data: d.data.map((x) => x.variant_id === r.variant_id ? withStock(x, stock) : x) });
                    }} />
                ))}
                {data.data.length === 0 && <tr><td colSpan={7} className="muted">Nothing matches these filters.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pager page={data.meta.current_page} last={data.meta.last_page} onPage={(n) => update({ page: String(n) })} />}
      </section>
      <Toast message={toast} />
    </>
  );
}

function InventoryLine({ row, canAdjust, open, onToggle, onSaved }: {
  row: InventoryRow;
  canAdjust: boolean;
  open: boolean;
  onToggle: () => void;
  onSaved: (msg: string, stock: StockResult) => void;
}) {
  return (
    <>
      <tr>
        <td>
          <Link to={`/products/${row.product_id}`}>{row.product}</Link>
          <br /><span className="muted" style={{ fontSize: 13 }}>{row.variant || 'Default'}{!row.is_active && ' · hidden'}{row.product_status !== 'active' && ` · ${row.product_status}`}</span>
        </td>
        <td className="num muted">{row.sku}</td>
        <td className="num">{row.quantity}</td>
        <td className="num">{row.reserved}</td>
        <td className={`num state-${row.state}`}>{row.available} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{row.state !== 'in' && STATE_LABEL[row.state]}</span></td>
        <td className="num">{row.threshold}</td>
        <td>
          <button type="button" className="btn btn-sm" aria-expanded={open} onClick={onToggle}>
            {canAdjust ? 'Adjust / history' : 'History'}<span className="sr-only"> for {row.sku}</span>
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={7} style={{ background: 'var(--surface-2)' }}>
            <StockPanel row={row} canAdjust={canAdjust} onSaved={onSaved} />
          </td>
        </tr>
      )}
    </>
  );
}

function StockPanel({ row, canAdjust, onSaved }: { row: InventoryRow; canAdjust: boolean; onSaved: (msg: string, stock: StockResult) => void }) {
  const [moves, setMoves] = useState<StockMovement[] | null>(null);
  const [change, setChange] = useState('');
  const [reason, setReason] = useState('purchase');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<{ data: StockMovement[] }>(`/variants/${row.variant_id}/movements`).then((r) => setMoves(r.data)).catch((e: Error) => setError(e.message));
  }, [row.variant_id]);
  useEffect(load, [load]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const n = Number(change);
    if (!Number.isInteger(n) || n === 0) {
      setError('Enter a whole number, for example 10 to add or -2 to remove.');
      return;
    }
    if (n < 0 && reason === 'purchase') {
      setError('A purchase adds stock. Use "Stock count correction" to remove stock.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ data: StockResult }>(`/variants/${row.variant_id}/stock`, { method: 'POST', body: { change: n, reason, note: note.trim() || null } });
      setChange('');
      setNote('');
      onSaved(n > 0 ? `Added ${n} to stock.` : `Removed ${Math.abs(n)} from stock.`, r.data);
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {error && <div className="alert" role="alert">{error}</div>}
      {canAdjust && (
        <form onSubmit={save} className="form-grid" style={{ alignItems: 'end' }} aria-label={`Adjust stock for ${row.sku}`}>
          <div className="field">
            <label htmlFor={`chg-${row.variant_id}`}>Change</label>
            <input id={`chg-${row.variant_id}`} className="input" inputMode="numeric" placeholder="+10 or -2" value={change} onChange={(e) => setChange(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor={`rsn-${row.variant_id}`}>Reason</label>
            <select id={`rsn-${row.variant_id}`} className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="purchase">New stock purchased</option>
              <option value="adjustment">Stock count correction</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor={`note-${row.variant_id}`}>Note (optional)</label>
            <input id={`note-${row.variant_id}`} className="input" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Supplier, invoice number" />
          </div>
          <div><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></div>
        </form>
      )}
      <h3 style={{ fontSize: 15 }}>Stock history</h3>
      {!moves ? <Skeleton rows={2} /> : moves.length === 0 ? <p className="muted">No stock changes yet.</p> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>When</th><th>Change</th><th>Before → after</th><th>Reason</th><th>By</th><th>Note</th></tr></thead>
            <tbody>
              {moves.map((m) => (
                <tr key={m.id}>
                  <td className="num">{dhakaDateTime(m.at)}</td>
                  <td className="num" style={{ fontWeight: 700, color: m.change < 0 ? 'var(--danger)' : undefined }}>{m.change > 0 ? `+${m.change}` : m.change}</td>
                  <td className="num">{m.quantity_before} → {m.quantity_after}</td>
                  <td>{m.reason_label}</td>
                  <td>{m.by ?? <span className="muted">System</span>}</td>
                  <td>{m.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
