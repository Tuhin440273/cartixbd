import { useCallback, useEffect, useState } from 'react';
import { api, dhakaDateTime } from '../api';
import type { ActivityRow, Paged } from '../api';
import { Skeleton } from '../components/Layout';
import { Pager } from '../components/ui';

/** "product.status_changed" becomes "Product status changed". */
const humanize = (action: string) => {
  const text = action.replace(/[._]/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
};

export function Activity() {
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<(Paged<ActivityRow> & { actions: string[] }) | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<Paged<ActivityRow> & { actions: string[] }>('/activity', { query: { action, page } }).then(setData).catch((e: Error) => setError(e.message));
  }, [action, page]);
  useEffect(load, [load]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Activity Logs</h1>
          <span className="muted">Every change made in the admin panel: who, what, when and from which IP address.</span>
        </div>
      </div>
      <div className="filters">
        <label htmlFor="a-action" className="sr-only">Action</label>
        <select id="a-action" className="input" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}>
          <option value="">All actions</option>
          {data?.actions.map((a) => <option key={a} value={a}>{humanize(a)}</option>)}
        </select>
      </div>
      {error && <div className="alert" role="alert">{error}</div>}
      <section className="card">
        {!data ? <Skeleton rows={8} /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Details</th><th>IP address</th></tr></thead>
              <tbody>
                {data.data.map((a) => (
                  <tr key={a.id}>
                    <td className="num">{dhakaDateTime(a.at)}</td>
                    <td>{a.user ?? <span className="muted">System</span>}</td>
                    <td>{humanize(a.action)}{a.subject_type && <span className="muted"> · {a.subject_type} #{a.subject_id}</span>}</td>
                    <td>{a.properties && <pre className="props">{Object.entries(a.properties).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join('\n')}</pre>}</td>
                    <td className="num muted">{a.ip_address}</td>
                  </tr>
                ))}
                {data.data.length === 0 && <tr><td colSpan={5} className="muted">No activity yet.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pager page={data.meta.current_page} last={data.meta.last_page} onPage={setPage} />}
      </section>
    </>
  );
}
