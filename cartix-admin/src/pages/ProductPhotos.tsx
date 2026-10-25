import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api, fieldErrors, taka } from '../api';
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

/** Where a color chosen in a dropdown should go once it exists on the product. */
type ColorTarget = { type: 'image'; imageId: number; alt: string | null } | { type: 'pending'; key: string };

/** A color the product does not have yet: confirm adding it as variants, or create a brand-new shop color first. */
type ColorRequest = { step: 'add'; colorId: number; target: ColorTarget } | { step: 'create'; target: ColorTarget };

const NEW_COLOR = '__new';

/**
 * Photos are linked to a color, not to a single size: the shop shows a color's photos for every size
 * of that color. The API stores the link on one variant of that color.
 *
 * The color dropdowns list every shop color. Picking one the product does not have yet offers to add it
 * (one variant per existing size, same prices, stock 0), and a brand-new color can be created on the spot.
 */
export function ProductPhotos({ product, meta, manage, onChange, onMetaChange }: {
  product: ProductDetail;
  meta: Meta;
  manage: boolean;
  onChange: (p: ProductDetail, msg: string) => void;
  onMetaChange?: (m: Meta) => void;
}) {
  const [pending, setPending] = useState<Pending[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [request, setRequest] = useState<ColorRequest | null>(null);

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
  const otherColors = meta.colors.filter((c) => !colors.some((own) => own.id === c.id)).map((c) => ({ id: c.id, name: c.value }));
  const canCreateColor = Boolean(meta.color_attribute_id) && Boolean(onMetaChange);
  // Colors can only be added once the product has at least one variant to copy sizes and prices from.
  const showColorPicker = product.variants.length > 0 && (colors.length > 0 || otherColors.length > 0 || canCreateColor);
  const altFor = (colorLabel?: string) => `${product.name}${colorLabel ? ` in ${colorLabel.toLowerCase()}` : ''}`;

  /** Handles a dropdown change: own colors apply at once, other colors and "new color" open the add panel. */
  const pickColor = (value: string, target: ColorTarget) => {
    setError(null);
    if (value === NEW_COLOR) {
      setRequest({ step: 'create', target });
      return;
    }
    if (value === '' || colors.some((c) => String(c.id) === value)) {
      setRequest(null);
      if (target.type === 'image') void setColor(target.imageId, target.alt, value);
      else update(target.key, { color: value, alt: altFor(colors.find((c) => String(c.id) === value)?.name) });
      return;
    }
    setRequest({ step: 'add', colorId: Number(value), target });
  };

  /** After the color exists on the product: link the photo (saved photo) or preselect it (photo waiting to upload). */
  const applyAddedColor = async (updated: ProductDetail, colorId: number, target: ColorTarget, label: string) => {
    if (target.type === 'pending') {
      update(target.key, { color: String(colorId), alt: altFor(label) });
      onChange(updated, `${label} added to this product with stock 0.`);
      return;
    }
    const variantId = updated.variants.find((v) => v.color_value_id === colorId)?.id ?? null;
    try {
      const r = await api<{ data: ProductDetail }>(`/images/${target.imageId}`, { method: 'PUT', body: { alt: target.alt, variant_id: variantId } });
      onChange(r.data, `${label} added to this product with stock 0, and the photo is linked to it.`);
    } catch (err) {
      onChange(updated, `${label} added to this product with stock 0.`);
      setError((err as Error).message);
    }
  };

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
      {manage && product.variants.length === 0 && (
        <p className="muted" style={{ margin: 0 }}>Add a variant first; then you can link photos to colors.</p>
      )}
      {manage && request?.step === 'add' && (
        <AddColorPanel product={product} meta={meta} colorId={request.colorId} onCancel={() => setRequest(null)}
          onAdded={(updated, label) => { const r = request; setRequest(null); void applyAddedColor(updated, r.colorId, r.target, label); }} />
      )}
      {manage && request?.step === 'create' && meta.color_attribute_id && onMetaChange && (
        <NewColorPanel attributeId={meta.color_attribute_id} onCancel={() => setRequest(null)}
          onCreated={(color) => {
            onMetaChange({ ...meta, colors: [...meta.colors, color] });
            setRequest({ step: 'add', colorId: color.id, target: request.target });
          }} />
      )}

      {gallery.length === 0 ? <p className="muted">No photos yet.</p> : (
        <div className="gallery">
          {gallery.map((img, i) => (
            <figure key={img.id}>
              <img src={img.url} alt={img.alt ?? ''} />
              <figcaption>
                {i === 0 ? <strong>Main photo</strong> : <span className="muted">Photo {i + 1}</span>}
              </figcaption>
              {manage && showColorPicker && (
                <>
                  <label className="sr-only" htmlFor={`img-color-${img.id}`}>Color for photo {i + 1}</label>
                  <ColorOptions id={`img-color-${img.id}`} value={colorOfVariant(img.variant_id)} own={colors} others={otherColors}
                    canCreate={canCreateColor} disabled={busy} onPick={(v) => pickColor(v, { type: 'image', imageId: img.id, alt: img.alt })} />
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
                    {showColorPicker && (
                      <>
                        <label htmlFor={`new-color-${p.key}`} style={{ fontSize: 13, fontWeight: 600 }}>Color</label>
                        <ColorOptions id={`new-color-${p.key}`} value={p.color} own={colors} others={otherColors}
                          canCreate={canCreateColor} disabled={busy} onPick={(v) => pickColor(v, { type: 'pending', key: p.key })} />
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

/** Color dropdown: the product's own colors first, then other shop colors, then "create a new color". */
function ColorOptions({ id, value, own, others, canCreate, disabled, onPick }: {
  id: string;
  value: string;
  own: { id: number; name: string }[];
  others: { id: number; name: string }[];
  canCreate: boolean;
  disabled: boolean;
  onPick: (value: string) => void;
}) {
  return (
    <select id={id} className="input" style={{ minHeight: 36 }} value={value} disabled={disabled} onChange={(e) => onPick(e.target.value)}>
      <option value="">All colors</option>
      {own.length > 0 && (
        <optgroup label="This product's colors">
          {own.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </optgroup>
      )}
      {others.length > 0 && (
        <optgroup label="Other colors (adds them to this product)">
          {others.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </optgroup>
      )}
      {canCreate && <option value={NEW_COLOR}>+ Create a new color…</option>}
    </select>
  );
}

/** Confirms adding a color as variants: one per existing size, same prices, stock 0. */
function AddColorPanel({ product, meta, colorId, onCancel, onAdded }: {
  product: ProductDetail;
  meta: Meta;
  colorId: number;
  onCancel: () => void;
  onAdded: (p: ProductDetail, label: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  // The dropdown can be far below this panel, so bring the panel into view.
  useEffect(() => {
    addButton.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    addButton.current?.focus({ preventScroll: true });
  }, [colorId]);
  const color = meta.colors.find((c) => c.id === colorId);
  const label = color?.value ?? 'This color';

  // One new variant per size the product already has (a product without sizes gets one).
  const sizeIds = [...new Set(product.variants.map((v) => v.size_value_id ?? null))];
  const sizeNames = sizeIds.filter((sid): sid is number => sid !== null).map((sid) => meta.sizes.find((s) => s.id === sid)?.value ?? '?');
  const prices = [...new Set(product.variants.map((v) => Number(v.price)))].sort((a, b) => a - b);
  const priceText = prices.length === 1 ? taka(prices[0]!) : `${taka(prices[0]!)} to ${taka(prices[prices.length - 1]!)}`;

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ data: ProductDetail }>(`/products/${product.id}/colors`, { method: 'POST', body: { color_value_id: colorId } });
      onAdded(r.data, label);
    } catch (err) {
      setError(fieldErrors(err).color_value_id ?? (err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div role="group" aria-labelledby="add-color-title" style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <strong id="add-color-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {color?.color_hex && <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: '50%', background: color.color_hex, border: '1px solid var(--line)' }} />}
        Add {label} to this product?
      </strong>
      <p className="muted" style={{ margin: 0 }}>
        This creates {sizeIds.length} new variant{sizeIds.length === 1 ? '' : 's'}
        {sizeNames.length > 0 ? ` (${sizeNames.join(', ')})` : ''} in {label.toLowerCase()} with the same prices ({priceText}) and stock 0.
        Customers can buy them after you add stock on the Inventory page.
      </p>
      {error && <div className="alert" role="alert">{error}</div>}
      <div className="actions">
        <button ref={addButton} type="button" className="btn btn-primary" disabled={busy} onClick={() => void add()}>{busy ? 'Adding…' : `Add ${label}`}</button>
        <button type="button" className="btn" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

/** Creates a brand-new shop color (for example Brown); the next step adds it to the product. */
function NewColorPanel({ attributeId, onCancel, onCreated }: {
  attributeId: number;
  onCancel: () => void;
  onCreated: (c: { id: number; value: string; color_hex: string | null }) => void;
}) {
  const [name, setName] = useState('');
  const [hex, setHex] = useState('#8B5A2B');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    nameInput.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    nameInput.current?.focus({ preventScroll: true });
  }, []);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setError(null);
    try {
      const r = await api<{ data: { id: number; value: string; color_hex: string | null } }>(`/attributes/${attributeId}/values`, {
        method: 'POST', body: { value: name.trim(), color_hex: hex.toUpperCase() },
      });
      onCreated(r.data);
    } catch (err) {
      const fe = fieldErrors(err);
      setErrors(fe);
      if (!fe.value && !fe.color_hex) setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={create} aria-labelledby="new-color-title" style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <strong id="new-color-title">Create a new color</strong>
      <p className="muted" style={{ margin: 0 }}>The color is added to the shop's color list, so you can use it for other products too.</p>
      {error && <div className="alert" role="alert">{error}</div>}
      <div className="form-grid" style={{ alignItems: 'end' }}>
        <div className="field">
          <label htmlFor="new-color-name">Name</label>
          <input id="new-color-name" className="input" maxLength={100} required placeholder="For example Brown" value={name}
            aria-invalid={Boolean(errors.value)} onChange={(e) => setName(e.target.value)} ref={nameInput} />
          {errors.value && <span className="error-text">{errors.value}</span>}
        </div>
        <div className="field">
          <label htmlFor="new-color-hex">Swatch</label>
          <span style={{ display: 'flex', gap: 8 }}>
            <input id="new-color-hex" type="color" value={hex} onChange={(e) => setHex(e.target.value)}
              style={{ width: 48, height: 40, padding: 2, border: '1px solid var(--line)', borderRadius: 8, background: 'transparent' }} />
            <input className="input" aria-label="Color code" value={hex} maxLength={7} aria-invalid={Boolean(errors.color_hex)}
              onChange={(e) => setHex(e.target.value)} style={{ maxWidth: 120 }} />
          </span>
          {errors.color_hex && <span className="error-text">{errors.color_hex}</span>}
        </div>
      </div>
      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>{busy ? 'Creating…' : 'Create color'}</button>
        <button type="button" className="btn" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </form>
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
