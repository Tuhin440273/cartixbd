'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import type { ProductCard } from '@/lib/types';
import { formatPrice } from '@/lib/format';
import './HangingRail.css';

export interface HangingRailProps {
  title: string;
  /** Products shown on the rail; only products with rail artwork are rendered. */
  products: ProductCard[];
  eyebrow?: string;
  subtitle?: string;
  /** Auto-scroll speed in pixels per second. */
  speed?: number;
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/**
 * Garments hang side-on from a rod and slowly drift past. Hover (or focus, or the centre item on
 * touch screens) turns a garment to face the shopper; clicking opens the product page.
 * Motion stops for users who prefer reduced motion, and the arrow buttons work without it.
 */
export function HangingRail({ title, products, eyebrow, subtitle, speed = 38 }: HangingRailProps) {
  const router = useRouter();
  const railProducts = useMemo(() => products.filter((p) => p.rail?.front), [products]);
  const tabs = useMemo(() => {
    const seen = new Map<string, string>();
    railProducts.forEach((p) => p.category && seen.set(p.category.slug, p.category.name));
    return [...seen.entries()].map(([slug, name]) => ({ slug, name }));
  }, [railProducts]);

  const [tab, setTab] = useState<string>('all');
  const visible = useMemo(
    () => (tab === 'all' ? railProducts : railProducts.filter((p) => p.category?.slug === tab)),
    [railProducts, tab],
  );

  const [copies, setCopies] = useState(2);
  const [hovered, setHovered] = useState<ProductCard | null>(null);
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const isTouch = useMediaQuery('(hover: none)');

  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const offset = useRef(0); // current position in px, always within (-setWidth, 0]
  const setWidth = useRef(0); // width of one full set of garments
  const slotWidth = useRef(0);
  const paused = useRef({ hover: false, focus: false, drag: false });
  const drag = useRef({ startX: 0, startOffset: 0, moved: false, pointerId: -1 });
  const nudge = useRef<{ from: number; to: number; start: number } | null>(null);
  const centerEl = useRef<HTMLElement | null>(null);
  const centerIdx = useRef(-1);

  const apply = useCallback(() => {
    if (trackRef.current) trackRef.current.style.transform = `translate3d(${offset.current}px,0,0)`;
  }, []);
  const wrap = useCallback(() => {
    const w = setWidth.current;
    if (!w) return;
    while (offset.current <= -w) offset.current += w;
    while (offset.current > 0) offset.current -= w;
  }, []);

  useEffect(() => {
    offset.current = 0;
    nudge.current = null;
    centerIdx.current = -1;
    apply();
  }, [tab, apply]);

  // Measure how many copies of the set are needed to fill the screen.
  useLayoutEffect(() => {
    const vp = viewportRef.current;
    const tr = trackRef.current;
    if (!vp || !tr) return;
    const measure = () => {
      const first = tr.firstElementChild as HTMLElement | null;
      if (!first || visible.length === 0) {
        setWidth.current = 0;
        return;
      }
      slotWidth.current = first.getBoundingClientRect().width;
      const w = slotWidth.current * visible.length;
      setWidth.current = w;
      const needed = Math.max(2, Math.ceil(vp.clientWidth / w) + 1);
      setCopies((c) => (c === needed ? c : needed));
      wrap();
      apply();
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(vp);
    return () => ro.disconnect();
  }, [visible, copies, wrap, apply]);

  // On touch screens the garment in the middle turns to the front by itself.
  const updateCenter = useCallback(() => {
    const vp = viewportRef.current;
    const tr = trackRef.current;
    if (!vp || !tr || !slotWidth.current || visible.length === 0) return;
    const idx = Math.floor((vp.clientWidth / 2 - offset.current) / slotWidth.current);
    if (idx === centerIdx.current) return;
    centerIdx.current = idx;
    centerEl.current?.classList.remove('is-center');
    const el = tr.children[idx] as HTMLElement | undefined;
    if (el) {
      el.classList.add('is-center');
      centerEl.current = el;
      setHovered(visible[idx % visible.length] ?? null);
    }
  }, [visible]);

  useEffect(() => {
    if (!isTouch) {
      centerEl.current?.classList.remove('is-center');
      centerEl.current = null;
      centerIdx.current = -1;
    }
  }, [isTouch]);

  // Animation loop: moves the track directly, without React re-renders.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(now - last, 50) / 1000;
      last = now;
      const n = nudge.current;
      if (n) {
        const t = Math.min((now - n.start) / 420, 1);
        offset.current = n.from + (n.to - n.from) * (1 - Math.pow(1 - t, 3));
        if (t >= 1) nudge.current = null;
      } else {
        const p = paused.current;
        if (!reducedMotion && !p.hover && !p.focus && !p.drag) offset.current -= speed * dt;
      }
      wrap();
      apply();
      if (isTouch) updateCenter();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [speed, reducedMotion, isTouch, updateCenter, wrap, apply]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag.current = { startX: e.clientX, startOffset: offset.current, moved: false, pointerId: e.pointerId };
    nudge.current = null;
    paused.current.drag = true;
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== drag.current.pointerId) return;
      const dx = ev.clientX - drag.current.startX;
      if (Math.abs(dx) > 6) drag.current.moved = true;
      if (drag.current.moved) offset.current = drag.current.startOffset + dx;
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== drag.current.pointerId) return;
      paused.current.drag = false;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const shift = (dir: 1 | -1) => {
    const step = (slotWidth.current || 96) * 3;
    nudge.current = { from: offset.current, to: offset.current - dir * step, start: performance.now() };
  };

  const open = (p: ProductCard) => {
    if (drag.current.moved) {
      drag.current.moved = false; // releasing after a drag is not a click
      return;
    }
    router.push(`/product/${p.slug}`);
  };

  if (railProducts.length === 0) return null;

  const items = [];
  for (let c = 0; c < copies; c++) {
    for (let i = 0; i < visible.length; i++) {
      const p = visible[i]!;
      const isCopy = c > 0;
      items.push(
        <button
          key={`${c}-${p.id}`}
          type="button"
          className="hr-item"
          style={{ '--sway-delay': `${-((i * 0.73) % 3.2)}s` } as CSSProperties}
          aria-label={`${p.name}, ${formatPrice(p.price)}`}
          tabIndex={isCopy ? -1 : 0}
          aria-hidden={isCopy || undefined}
          onClick={() => open(p)}
          onMouseEnter={() => setHovered(p)}
          onFocus={() => setHovered(p)}
          draggable={false}
        >
          <span className="hr-swing">
            <span className="hr-art hr-art--photo">
              {/* eslint-disable-next-line @next/next/no-img-element -- transparent vector art, swapped by CSS */}
              <img className="hr-img hr-img--side" src={p.rail!.side ?? p.rail!.front} alt="" draggable={false} loading="lazy" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="hr-img hr-img--front" src={p.rail!.front} alt="" draggable={false} loading="lazy" />
            </span>
          </span>
          <span className="hr-tag" aria-hidden="true">
            {formatPrice(p.price)}
          </span>
        </button>,
      );
    }
  }

  return (
    <section className="hr" aria-label={title}>
      <div className="hr-head">
        {eyebrow && <span className="hr-eyebrow">{eyebrow}</span>}
        <h2 className="hr-title">{title}</h2>
        {subtitle && <p className="hr-sub">{subtitle}</p>}
        {tabs.length > 1 && tabs.length <= 5 && (
          <div className="hr-tabs" role="group" aria-label="Filter the rail by category">
            <button type="button" aria-pressed={tab === 'all'} onClick={() => setTab('all')}>All</button>
            {tabs.map((t) => (
              <button key={t.slug} type="button" aria-pressed={tab === t.slug} onClick={() => setTab(t.slug)}>
                {t.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="hr-stage">
        <div className="hr-rod" aria-hidden="true" />
        <div
          ref={viewportRef}
          className="hr-viewport"
          onPointerDown={onPointerDown}
          onPointerEnter={(e) => {
            if (e.pointerType === 'mouse') paused.current.hover = true;
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === 'mouse') {
              paused.current.hover = false;
              setHovered(null);
            }
          }}
          onFocus={() => (paused.current.focus = true)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              paused.current.focus = false;
              if (!isTouch) setHovered(null);
            }
          }}
        >
          <div ref={trackRef} className="hr-track">
            {items}
          </div>
        </div>
      </div>

      <div className="hr-foot">
        <div className="hr-info" aria-live="polite">
          {hovered ? (
            <>
              <span className="hr-info-name">{hovered.name}</span>
              <span className="hr-info-price">
                {formatPrice(hovered.price)}
                {hovered.compare_at_price && Number(hovered.compare_at_price) > Number(hovered.price) && (
                  <s>{formatPrice(hovered.compare_at_price)}</s>
                )}
              </span>
            </>
          ) : (
            <span className="hr-info-hint">
              {isTouch ? 'Swipe to browse, tap a garment to see details' : 'Hover to turn a garment around, or drag the rail'}
            </span>
          )}
        </div>
        <div className="hr-arrows">
          <button type="button" aria-label="Previous garments" onClick={() => shift(-1)}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <button type="button" aria-label="Next garments" onClick={() => shift(1)}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
}
