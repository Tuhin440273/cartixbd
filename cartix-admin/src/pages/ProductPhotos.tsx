import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api, fieldErrors } from '../api';
import type { Meta, ProductDetail } from '../api';
import { ConfirmButton } from '../components/ui';

const MAX_FILES = 10;
const MAX_BYTES = 4 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

const RAIL_LABEL: Record<string, string> = {
  rail_front: 'Rail: front',
  rail_back: 'Rail: back',
  rail_side: 'Rail: side',
};

/** A photo waiting to be uploaded, with its own color and description. */
interface Pending {
  key: string;
  file: File;
  preview: string;
  color: string; // color value id, or '' for all colors
  alt: string;
  status: 'waiting' | 'uploading' | 'done' | 'error';
  error?: string;
}

/**
 * Photos are linked to a color, not to a single size: the shop shows a color's photos for every size
 * of that color. The API stores the link on one variant of that color.
 */
export function ProductPhotos({ product, meta, manage, onChange }: {
  product: ProductDetail;
  meta: Meta;
  manage: boolean;
  onChange: (p: ProductDetail, msg: string) => void;
}) {
  const [pending, setPending] = useState<Pending[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);

  // Colors this product actually has, in the order of the variants.
  const colors = useMemo(() => {
    const seen = new Map<number, string>();
    product.variants.forEach((v) => {
      if (v.color_value_id && !seen.has(v.color_value_id)) {
        seen.set(v.color_value_id, meta.colors.find((c) => c.id === v.color_value_id)?.value ?? 'Color');
      }
    });
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [product.variants, meta.colors]);

  const variantForColor = (colorId: string) => product.variants.find((v) => String(v.color_value_id) === colorId)?.id ?? null;
  const colorOfVariant = (variantId: number | null) => {
    const v = product.variants.find((x) => x.id === variantId);
    return v?.color_value_id ? String(v.color_value_id) : '';
  };
  const colorName = (variantId: number | null) => colors.find((c) => String(c.id) === colorOfVariant(variantId))?.name;

  // Release preview memory when the page closes (removed photos are released as they go).
  const pendingRef = useRef(pending);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);
  useEffect(() => () => pendingRef.current.forEach((p) => URL.revokeObjectURL(p.preview)), []);

  const gallery = product.images.filter((i) => i.kind === 'gallery');
  const rail = product.images.filter((i) => i.kind !== 'gallery');

  const choose = (files: FileList | null) => {
    setError(null);
    if (!files || files.length === 0) return;
    const list = [...files];
    const problems: string[] = [];
    const accepted = list.filter((f) => {
      if (!ACCEPTED.includes(f.type)) problems.push(`${f.name}: use a JPG, PNG or WebP image.`);
      else if (f.size > MAX_BYTES) problems.push(`${f.name}: the image must be 4 MB or smaller.`);
      else return true;
      return false;
    });
    const room = MAX_FILES - pending.length;
    if (accepted.length > room) problems.push(`You can upload up to ${MAX_FILES} photos at a time.`);

    // Guess the color from the file name, for example "oxford-sky-blue.jpg".
    const guess = (name: string) => {
      const n = name.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
      const match = [...colors].sort((a, b) => b.name.length - a.name.length)
        .find((c) => n.includes(c.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ')));
      return match ? String(match.id) : '';
    };

    const added = accepted.slice(0, Math.max(0, room)).map((file, i) => {
      const color = guess(file.name);
      const colorLabel = colors.find((c) => String(c.id) === color)?.name;
      return {
        key: `${Date.now()}-${i}-${file.name}`,
        file,
        preview: URL.createObjectURL(file),
        color,
        alt: `${product.name}${colorLabel ? ` in ${colorLabel.toLowerCase()}` : ''}`,
        status: 'waiting' as const,
      };
    });
    setPending((p) => [...p, ...added]);
    if (problems.length) setError(problems.join(' '));
    setInputKey((k) => k + 1);
  };

  const update = (key: string, changes: Partial<Pending>) => setPending((list) => list.map((p) => (p.key === key ? { ...p, ...changes } : p)));
  const drop = (key: string) => setPending((list) => {
    const item = list.find((p) => p.key === key);
    if (item) URL.revokeObjectURL(item.preview);
    return list.filter((p) => p.key !== key);
  });

  /** Uploads one by one, so a bad file does not stop the others and each gets its own message. */
  const uploadAll = async (e: FormEvent) => {
    e.preventDefault();
    const queue = pending.filter((p) => p.status !== 'done');
    if (queue.length === 0) {
      setError('Choose one or more photos first.');
      return;
    }
    setBusy(true);
    setError(null);
    let latest: ProductDetail | null = null;
    let ok = 0;
    for (const item of queue) {
      update(item.key, { status: 'uploading', error: undefined });
      const body = new FormData();
      body.append('image', item.file);
      body.append('kind', 'gallery');
      const variantId = item.color ? variantForColor(item.color) : null;
      if (variantId) body.append('variant_id', String(variantId));
      if (item.alt.trim()) body.append('alt', item.alt.trim());
      try {
        const r = await api<{ data: ProductDetail }>(`/products/${product.id}/images`, { method: 'POST', body });
        latest = r.data;
        ok++;
        update(item.key, { status: 'done' });
      } catch (err) {
        update(item.key, { status: 'error', error: fieldErrors(err).image ?? (err as Error).message });
      }
    }
    setBusy(false);
    if (latest) onChange(latest, ok === queue.length ? `${ok} photo${ok === 1 ? '' : 's'} uploaded.` : `${ok} of ${queue.length} photos uploaded.`);
    // Keep only the ones that failed, so they can be fixed and retried.
    setPending((list) => {
      list.filter((p) => p.status === 'done').forEach((p) => URL.revokeObjectURL(p.preview));
      return list.filter((p) => p.status !== 'done');
    });
  };

  const move = async (index: number, dir: -1 | 1) => {
    const ids = gallery.map((g) => g.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j]!, ids[index]!];
    try {
      const r = await api<{ data: ProductDetail }>(`/products/${product.id}/images/order`, { method: 'PUT', body: { ids } });
      onChange(r.data, 'Photo order saved.');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const setColor = async (imageId: number, alt: string | null, colorId: string) => {
    try {
      const r = await api<{ data: ProductDetail }>(`/images/${imageId}`, { method: 'PUT', body: { alt, variant_id: colorId ? variantForColor(colorId) : null } });
      onChange(r.data, 'Photo color saved.');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const remove = async (imageId: number) => {
    try {
      const r = await api<{ data: ProductDetail }>(`/images/${imageId}`, { method: 'DELETE' });
      onChange(r.data, 'Photo removed.');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <section className="card" aria-labelledby="images-title" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h2 id="images-title">Photos</h2>
      <p className="muted" style={{ margin: 0 }}>
        The first photo is the main photo in product lists. Link a photo to a color and the shop shows it when a customer picks that color.
        JPG, PNG or WebP, up to 4 MB each, ideally 4:5 (for example 1200 x 1500 pixels).
      </p>
      {error && <div className="alert" role="alert">{error}</div>}

      {gallery.length === 0 ? <p className="muted">No photos yet.</p> : (
        <div className="gallery">
          {gallery.map((img, i) => (
            <figure key={img.id}>
              <img src={img.url} alt={img.alt ?? ''} />
              <figcaption>
                {i === 0 ? <strong>Main photo</strong> : <span className="muted">Photo {i + 1}</span>}
              </figcaption>
              {manage && colors.length > 0 && (
                <>
                  <label className="sr-only" htmlFor={`img-color-${img.id}`}>Color for photo {i + 1}</label>
                  <select id={`img-color-${img.id}`} className="input" style={{ minHeight: 36 }} value={colorOfVariant(img.variant_id)}
                    onChange={(e) => void setColor(img.id, img.alt, e.target.value)}>
                    <option value="">All colors</option>
                    {colors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </>
              )}
              {!manage && colorName(img.variant_id) && <span className="muted">{colorName(img.variant_id)}</span>}
              {manage && (
                <span className="actions">
                  <button type="button" className="btn btn-sm" disabled={i === 0} onClick={() => void move(i, -1)} aria-label={`Move photo ${i + 1} earlier`}>←</button>
                  <button type="button" className="btn btn-sm" disabled={i === gallery.length - 1} onClick={() => void move(i, 1)} aria-label={`Move photo ${i + 1} later`}>→</button>
                  <ConfirmButton label="Remove" confirmLabel="Remove" onConfirm={() => void remove(img.id)} />
                </span>
              )}
            </figure>
          ))}
        </div>
      )}

      {manage && (
        <form onSubmit={uploadAll} aria-label="Upload photos" style={{ display: 'flex', flexDirection: 'column', gap: 12, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          <div className="field" style={{ maxWidth: 520 }}>
            <label htmlFor="img-files">Add photos (you can select several at once)</label>
            <input key={inputKey} id="img-files" className="input" type="file" multiple accept="image/jpeg,image/png,image/webp"
              onChange={(e) => choose(e.target.files)} disabled={busy} />
            <span className="muted" style={{ fontSize: 13 }}>
              Tip: put the color in the file name (for example oxford-sky-blue.jpg) and the color is chosen for you.
            </span>
          </div>

          {pending.length > 0 && (
            <>
              <div className="gallery">
                {pending.map((p, i) => (
                  <figure key={p.key} aria-label={`New photo ${i + 1}: ${p.file.name}`}>
                    <img src={p.preview} alt="" />
                    <figcaption className="muted" style={{ overflowWrap: 'anywhere' }}>{p.file.name}</figcaption>
                    {colors.length > 0 && (
                      <>
                        <label htmlFor={`new-color-${p.key}`} style={{ fontSize: 13, fontWeight: 600 }}>Color</label>
                        <select id={`new-color-${p.key}`} className="input" style={{ minHeight: 36 }} value={p.color} disabled={busy}
                          onChange={(e) => {
                            const name = colors.find((c) => String(c.id) === e.target.value)?.name;
                            update(p.key, { color: e.target.value, alt: `${product.name}${name ? ` in ${name.toLowerCase()}` : ''}` });
                          }}>
                          <option value="">All colors</option>
                          {colors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </>
                    )}
                    <label htmlFor={`new-alt-${p.key}`} style={{ fontSize: 13, fontWeight: 600 }}>Description</label>
                    <input id={`new-alt-${p.key}`} className="input" style={{ minHeight: 36 }} maxLength={200} value={p.alt} disabled={busy}
                      onChange={(e) => update(p.key, { alt: e.target.value })} />
                    {p.status === 'uploading' && <span className="muted" role="status">Uploading…</span>}
                    {p.status === 'error' && <span className="error-text" role="alert">{p.error}</span>}
                    {!busy && <button type="button" className="btn btn-sm" onClick={() => drop(p.key)}>Don't upload</button>}
                  </figure>
                ))}
              </div>
              <div className="actions">
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? 'Uploading…' : `Upload ${pending.length} photo${pending.length === 1 ? '' : 's'}`}
                </button>
                {!busy && <button type="button" className="btn" onClick={() => { pending.forEach((p) => URL.revokeObjectURL(p.preview)); setPending([]); }}>Clear</button>}
              </div>
            </>
          )}
        </form>
      )}

      <details>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Advanced: hanging rail artwork{rail.length > 0 ? ` (${rail.length})` : ''}</summary>
        <RailArtwork product={product} manage={manage} images={rail} onChange={onChange} onRemove={(id) => void remove(id)} />
      </details>
    </section>
  );
}

/** Transparent garment images for the home page rail: one front, one back and one side view. */
function RailArtwork({ product, manage, images, onChange, onRemove }: {
  product: ProductDetail;
  manage: boolean;
  images: ProductDetail['images'];
  onChange: (p: ProductDetail, msg: string) => void;
  onRemove: (id: number) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState('rail_front');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);

  const upload = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Choose an image first.');
      return;
    }
    setBusy(true);
    setError(null);
    const body = new FormData();
    body.append('image', file);
    body.append('kind', kind);
    body.append('alt', `${product.name}, ${RAIL_LABEL[kind]?.replace('Rail: ', '')} view`);
    try {
      const r = await api<{ data: ProductDetail }>(`/products/${product.id}/images`, { method: 'POST', body });
      setFile(null);
      setInputKey((k) => k + 1);
      onChange(r.data, 'Rail artwork uploaded.');
    } catch (err) {
      setError(fieldErrors(err).image ?? (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
      <p className="muted" style={{ margin: 0 }}>
        Only needed if this product appears on the hanging rail. Use transparent PNG images of the garment on a hanger,
        one each for the front, back and side. Uploading a view again replaces the old one. Normal product photos go in Photos above.
      </p>
      {error && <div className="alert" role="alert">{error}</div>}
      {images.length > 0 && (
        <div className="gallery">
          {images.map((img) => (
            <figure key={img.id}>
              <img src={img.url} alt={img.alt ?? ''} style={{ objectFit: 'contain' }} />
              <figcaption>{RAIL_LABEL[img.kind] ?? img.kind}</figcaption>
              {manage && <ConfirmButton label="Remove" confirmLabel="Remove" onConfirm={() => onRemove(img.id)} />}
            </figure>
          ))}
        </div>
      )}
      {manage && (
        <form onSubmit={upload} className="form-grid" style={{ alignItems: 'end' }} aria-label="Upload rail artwork">
          <div className="field">
            <label htmlFor="rail-file">Transparent PNG</label>
            <input key={inputKey} id="rail-file" className="input" type="file" accept="image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <div className="field">
            <label htmlFor="rail-kind">View</label>
            <select id="rail-kind" className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
              {Object.entries(RAIL_LABEL).map(([v, l]) => <option key={v} value={v}>{l.replace('Rail: ', '')}</option>)}
            </select>
          </div>
          <div><button type="submit" className="btn" disabled={busy}>{busy ? 'Uploading…' : 'Upload rail artwork'}</button></div>
        </form>
      )}
    </div>
  );
}
