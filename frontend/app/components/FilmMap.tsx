"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { HUE_BINS, histOf, paletteDistance, type MapFilm, type Variant } from "@/lib/film-map";

interface Node extends MapFilm {
  x: number;
  y: number;
  color: string;
}

const R = 320; // colour universe radius
const R_INNER = 30; // keeps the darkest films off the exact centre
const BW_R = 130; // black-and-white universe radius
const BW_CX = R * 2 + 60 + BW_R; // B/W universe sits to the right
const SIZE = { w: BW_CX + BW_R + 40, h: R * 2 + 40 };
const CX = R + 20;
const CY = R + 20;
const NEIGHBOURS = 2;
const GOLDEN_ANGLE = 2.39996;

// Log scale from the darkest to the brightest film: log(1 + k·t) / log(1 + k).
// k = 0 is linear; larger k spreads the dark end and squeezes the bright end.
function radius(
  l: number,
  lo: number,
  hi: number,
  inner: number,
  outer: number,
  k: number,
) {
  const t = hi > lo ? (l - lo) / (hi - lo) : 0.5;
  const s = k > 0 ? Math.log1p(k * t) / Math.log1p(k) : t;
  return inner + s * (outer - inner);
}

const r2 = (n: number) => Math.round(n * 100) / 100; // same on server and client, see hue wheel
const onScreen = (a: Node, b: Node) => Math.hypot(a.x - b.x, a.y - b.y);

// ponytail: O(n²) nearest-neighbour scan, fine to a few thousand films; use a k-d tree past that
function links(nodes: Node[], dist: (a: Node, b: Node) => number): [Node, Node][] {
  const seen = new Set<string>();
  const out: [Node, Node][] = [];
  for (const a of nodes) {
    const nearest = nodes
      .filter((b) => b !== a)
      .sort((p, q) => dist(a, p) - dist(a, q))
      .slice(0, NEIGHBOURS);
    for (const b of nearest) {
      const key = [a.job_id, b.job_id].sort().join();
      if (!seen.has(key)) {
        seen.add(key);
        out.push([a, b]);
      }
    }
  }
  return out;
}

// Force layout for the similarity variant: linked films (most similar palettes) pull together with a rest
// length that grows with their palette distance, every pair pushes apart, and gravity keeps it centred.
// Only + - * / and sqrt, so server and client agree exactly and hydration holds.
// ponytail: O(n²) per tick, fine to a few hundred films; use d3-force (Barnes-Hut) past that
function similarityLayout(nodes: Node[], edges: [Node, Node][]) {
  const idx = new Map(nodes.map((n, i) => [n.job_id, i]));
  const springs = edges.map(([a, b]) => [idx.get(a.job_id)!, idx.get(b.job_id)!, 15 + 20 * paletteDistance(a, b)]);
  const p = nodes.map((n) => ({ x: n.x, y: n.y }));
  const TICKS = 300;
  for (let t = 0; t < TICKS; t++) {
    const f = p.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < p.length; i++) {
      for (let j = i + 1; j < p.length; j++) {
        const dx = p[i].x - p[j].x;
        const dy = p[i].y - p[j].y;
        const d2 = Math.max(dx * dx + dy * dy, 1);
        const push = 600 / d2 / Math.sqrt(d2);
        f[i].x += dx * push;
        f[i].y += dy * push;
        f[j].x -= dx * push;
        f[j].y -= dy * push;
      }
      f[i].x += (CX - p[i].x) * 0.01;
      f[i].y += (CY - p[i].y) * 0.01;
    }
    for (const [i, j, rest] of springs) {
      const dx = p[j].x - p[i].x;
      const dy = p[j].y - p[i].y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const pull = ((d - rest) * 0.05) / d;
      f[i].x += dx * pull;
      f[i].y += dy * pull;
      f[j].x -= dx * pull;
      f[j].y -= dy * pull;
    }
    const cap = 10 * (1 - t / TICKS) + 0.1; // cooling, so it settles
    for (let i = 0; i < p.length; i++) {
      const m = Math.sqrt(f[i].x * f[i].x + f[i].y * f[i].y);
      const s = m > cap ? cap / m : 1;
      p[i].x += f[i].x * s;
      p[i].y += f[i].y * s;
    }
  }
  // Fit into the colour universe's circle
  const mx = p.reduce((s, q) => s + q.x, 0) / p.length;
  const my = p.reduce((s, q) => s + q.y, 0) / p.length;
  const far = Math.max(...p.map((q) => Math.sqrt((q.x - mx) ** 2 + (q.y - my) ** 2)), 1);
  const scale = (R - 20) / far;
  nodes.forEach((n, i) => {
    n.x = r2(CX + (p[i].x - mx) * scale);
    n.y = r2(CY + (p[i].y - my) * scale);
  });
}

// The film's hue histogram as petals round its position, in screen pixels (callers divide by zoom)
function petals(n: Node, k: number) {
  const hist = histOf(n);
  const step = (2 * Math.PI) / HUE_BINS;
  return hist.flatMap((s, i) => {
    if (s < 0.005) return [];
    const len = (5 + 28 * Math.sqrt(s)) / k; // sqrt so minor colours still show
    const a0 = i * step;
    const a1 = a0 + step;
    const pt = (a: number) => `${r2(n.x + len * Math.cos(a))},${r2(n.y - len * Math.sin(a))}`;
    return [{ d: `M${n.x},${n.y} L${pt(a0)} L${pt(a1)} Z`, fill: `oklch(0.7 0.14 ${(i + 0.5) * (360 / HUE_BINS)})` }];
  });
}

// Greedy label placement, in screen pixels so it holds at any zoom: the hovered film first,
// then each neighbour tries right, left, then steps up/down until it clears placed labels.
// ponytail: text width is estimated from character count; measure with getBBox if it misfires
function placeLabels(nodes: Node[], hover: Node, k: number) {
  const boxes: { x0: number; x1: number; y0: number; y1: number }[] = [];
  return nodes.map((n) => {
    const text = `${n.title}${n.year ? ` (${n.year})` : ""}${n.edition ? ` · ${n.edition}` : ""}`;
    const px = n === hover ? 13 : 11;
    const w = text.length * px * 0.55;
    const h = px * 1.3;
    const sx = n.x * k;
    const sy = n.y * k;
    for (let step = 0; step < 40; step++) {
      // step 0: right, 1: left, then right/left at ±1, ±2… line heights
      const side = step % 2 === 0 ? 1 : -1;
      const t = Math.floor(step / 2);
      const dy = (t % 2 === 1 ? -1 : 1) * Math.ceil(t / 2) * h;
      const x0 = side > 0 ? sx + 11 : sx - 11 - w;
      const box = { x0, x1: x0 + w, y0: sy + dy - h / 2, y1: sy + dy + h / 2 };
      if (boxes.every((b) => box.x1 < b.x0 || box.x0 > b.x1 || box.y1 < b.y0 || box.y0 > b.y1)) {
        boxes.push(box);
        return {
          n,
          text,
          size: px / k,
          x: (side > 0 ? box.x0 : box.x1) / k,
          y: (sy + dy + px * 0.35) / k,
          anchor: side > 0 ? ("start" as const) : ("end" as const),
          moved: dy !== 0,
        };
      }
    }
    return { n, text, size: px / k, x: (sx + 11) / k, y: (sy + px * 0.35) / k, anchor: "start" as const, moved: false };
  });
}

export function FilmMap({ films, variant }: { films: MapFilm[]; variant: Variant }) {
  const byPalette = variant === "palette-links" || variant === "similarity" || variant === "glyphs";
  const wheel = variant !== "similarity"; // similarity positions have no hue/lightness axes
  const router = useRouter();
  // Keyed by job_id: nodes are rebuilt with each layout, so object identity isn't stable
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [logK, setLogK] = useState(20);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  const ls = films.map((f) => f.lightness);
  const lo = Math.min(...ls);
  const hi = Math.max(...ls);

  const { colour, mono, edges } = useMemo(() => {
    const colour: Node[] = [];
    const mono: Node[] = [];
    // Identical analyses land on the same spot; ring them round it so each stays reachable
    const stacked = new Map<string, number>();
    const unstack = (x: number, y: number) => {
      const key = `${x.toFixed(1)},${y.toFixed(1)}`;
      const i = stacked.get(key) ?? 0;
      stacked.set(key, i + 1);
      const a = i * GOLDEN_ANGLE;
      return i === 0
        ? { x: r2(x), y: r2(y) }
        : { x: r2(x + 9 * Math.cos(a)), y: r2(y + 9 * Math.sin(a)) };
    };
    for (const f of films) {
      if (f.hue === null) {
        // No hue to place by, so spread B/W films round their disc with the golden angle
        const a = mono.length * GOLDEN_ANGLE;
        const r = radius(f.lightness, lo, hi, 10, BW_R - 10, logK);
        mono.push({
          ...f,
          ...unstack(BW_CX + r * Math.cos(a), CY + r * Math.sin(a)),
          color: `oklch(${f.lightness} 0 0)`,
        });
      } else {
        const angle = variant === "mean-hue" ? (f.mean_hue ?? f.hue) : f.hue;
        const a = (angle * Math.PI) / 180;
        const r = radius(f.lightness, lo, hi, R_INNER, R - 10, logK);
        // SVG y points down, so negate it to run hue counter-clockwise like a colour wheel
        colour.push({
          ...f,
          ...unstack(CX + r * Math.cos(a), CY - r * Math.sin(a)),
          color: `oklch(${f.lightness} 0.12 ${f.hue})`,
        });
      }
    }
    const colourEdges = links(colour, byPalette ? paletteDistance : onScreen);
    if (!wheel) similarityLayout(colour, colourEdges);
    return { colour, mono, edges: [...colourEdges, ...links(mono, onScreen)] };
  }, [films, lo, hi, logK, variant, byPalette, wheel]);

  const all = [...colour, ...mono];
  const hover = all.find((n) => n.job_id === hoverId) ?? null;
  const near = new Set(
    edges.flatMap(([a, b]) =>
      a.job_id === hoverId ? [b.job_id] : b.job_id === hoverId ? [a.job_id] : [],
    ),
  );

  // Client pixels -> viewBox units
  const toSvg = (x: number, y: number) =>
    new DOMPoint(x, y).matrixTransform(svgRef.current!.getScreenCTM()!.inverse());

  // Wheel zoom about the cursor. React's onWheel is passive, so it can't stop the page scrolling.
  useEffect(() => {
    const svg = svgRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM()!.inverse());
      const f = Math.exp(-e.deltaY * 0.0015);
      setView((v) => {
        const k = Math.min(20, Math.max(0.5, v.k * f));
        const g = k / v.k;
        return { k, x: p.x - (p.x - v.x) * g, y: p.y - (p.y - v.y) * g };
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  const k = view.k; // dots, lines and text divide by k to stay the same size on screen
  const ringR = (l: number) => radius(l, lo, hi, R_INNER, R - 10, logK);
  const rings = [0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5].filter((l) => l >= lo && l <= hi);

  return (
    <>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SIZE.w} ${SIZE.h}`}
        className="fixed inset-0 w-screen h-screen touch-none select-none cursor-grab active:cursor-grabbing"
        role="img"
        aria-label="Map of films by primary hue and lightness"
        onPointerDown={(e) => {
          const p = toSvg(e.clientX, e.clientY);
          drag.current = { x: p.x, y: p.y, moved: false };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const p = toSvg(e.clientX, e.clientY);
          const dx = p.x - drag.current.x;
          const dy = p.y - drag.current.y;
          if (Math.hypot(dx, dy) < 2 && !drag.current.moved) return; // let clicks be clicks
          drag.current = { x: p.x, y: p.y, moved: true };
          setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
        }}
        // Cleared after the click event so a drag that ends on a dot doesn't open it
        onPointerUp={() => setTimeout(() => (drag.current = null))}
        onPointerLeave={() => (drag.current = null)}
      >
        <defs>
          <filter id="glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation={4 / k} result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Faint hue wheel behind the colour universe */}
          <radialGradient id="fade">
            <stop offset="0%" stopColor="#000" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#000" stopOpacity="0" />
          </radialGradient>
        </defs>

        <g transform={`translate(${view.x} ${view.y}) scale(${k})`}>
          {wheel && Array.from({ length: 72 }, (_, i) => {
            // Rounded: server and browser Math.cos can differ in the last digit, breaking hydration
            const pt = (deg: number) =>
              `${(CX + R * Math.cos((deg * Math.PI) / 180)).toFixed(2)},${(CY - R * Math.sin((deg * Math.PI) / 180)).toFixed(2)}`;
            return (
              <path
                key={i}
                d={`M${CX},${CY} L${pt(i * 5)} A${R},${R} 0 0 0 ${pt(i * 5 + 5)} Z`}
                fill={`oklch(0.45 0.1 ${i * 5 + 2.5})`}
                opacity={0.12}
              />
            );
          })}
          <circle cx={CX} cy={CY} r={R} fill="url(#fade)" />
          <circle
            cx={BW_CX}
            cy={CY}
            r={BW_R}
            fill="#888"
            opacity={0.08}
            stroke="#888"
            strokeOpacity={0.3}
          />

          {wheel && rings.map((l) => (
            <g key={l} className="kalmus-text-muted">
              <circle
                cx={CX}
                cy={CY}
                r={ringR(l)}
                fill="none"
                stroke="currentColor"
                strokeOpacity={0.15}
                strokeWidth={1 / k}
                strokeDasharray={`${2 / k} ${4 / k}`}
              />
              <text
                x={CX + ringR(l) * Math.SQRT1_2 + 4 / k}
                y={CY + ringR(l) * Math.SQRT1_2 + 4 / k}
                fontSize={10 / k}
                fill="currentColor"
                opacity={0.6}
              >
                L {l}
              </text>
            </g>
          ))}
          <text
            x={CX}
            y={SIZE.h - 2}
            textAnchor="middle"
            fontSize={12}
            fill="currentColor"
            className="kalmus-text-secondary"
          >
            Colour
          </text>
          <text
            x={BW_CX}
            y={CY + BW_R + 20}
            textAnchor="middle"
            fontSize={12}
            fill="currentColor"
            className="kalmus-text-secondary"
          >
            Black &amp; white
          </text>

          {edges.map(([a, b]) => {
            const lit = a.job_id === hoverId || b.job_id === hoverId;
            return (
              <line
                key={a.job_id + b.job_id}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={lit ? "#fff" : "#aaa"}
                strokeOpacity={lit ? 0.7 : hover ? 0.05 : 0.18}
                strokeWidth={(lit ? 1.2 : 0.8) / k}
              />
            );
          })}

          {all.map((n) => {
            const dim = hover !== null && hover !== n && !near.has(n.job_id);
            const glyph = variant === "glyphs" && n.hue !== null;
            // Dashed: no palette data, so palette variants fall back to the dominant hue alone
            const approx = byPalette && n.hue !== null && !n.hue_hist;
            return (
              <g
                key={n.job_id}
                opacity={dim ? 0.25 : 1}
                className="cursor-pointer transition-opacity"
                onMouseEnter={() => setHoverId(n.job_id)}
                onMouseLeave={() => setHoverId(null)}
                onClick={() => {
                  if (!drag.current?.moved) router.push(`/results/${n.job_id}`);
                }}
              >
                {glyph &&
                  petals(n, hover === n ? k / 1.5 : k).map((p, i) => (
                    <path key={i} d={p.d} fill={p.fill} opacity={0.85} />
                  ))}
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={(glyph ? 3.5 : hover === n ? 9 : 6) / k}
                  fill={n.color}
                  stroke="#fff"
                  strokeOpacity={0.5}
                  strokeWidth={0.8 / k}
                  strokeDasharray={approx ? `${2 / k} ${1.5 / k}` : undefined}
                  filter={glyph ? undefined : "url(#glow)"}
                />
                {/* Invisible hit area, so the gaps between petals still hover */}
                {glyph && <circle cx={n.x} cy={n.y} r={14 / k} fill="transparent" />}
              </g>
            );
          })}

          {hover &&
            placeLabels(
              [hover, ...all.filter((n) => near.has(n.job_id))],
              hover,
              k,
            ).map(({ n, text, size, x, y, anchor, moved }) => (
              <g key={n.job_id} pointerEvents="none">
                {moved && (
                  <line
                    x1={n.x}
                    y1={n.y}
                    x2={x}
                    y2={y - size / 3}
                    stroke="#fff"
                    strokeOpacity={0.35}
                    strokeWidth={0.6 / k}
                  />
                )}
                <text
                  x={x}
                  y={y}
                  textAnchor={anchor}
                  fontSize={size}
                  fill="currentColor"
                  className={
                    n === hover ? "kalmus-text-primary" : "kalmus-text-secondary"
                  }
                  style={{
                    paintOrder: "stroke",
                    stroke: "rgba(0,0,0,0.6)",
                    strokeWidth: 3 / k,
                  }}
                >
                  {text}
                </text>
              </g>
            ))}
        </g>
      </svg>
      <div className="fixed bottom-5 left-6 right-6 z-50 flex flex-wrap items-center justify-end gap-4 text-xs font-mono kalmus-text-secondary pointer-events-none *:pointer-events-auto">
        {/* Similarity positions ignore the lightness scale */}
        {wheel && (
        <label className="flex items-center gap-2">
          Log strength
          <input
            type="range"
            min={0}
            max={200}
            value={logK}
            onChange={(e) => setLogK(Number(e.target.value))}
          />
          <span className="w-8">{logK}</span>
        </label>
        )}
        <button
          className="uppercase tracking-[0.22em] hover:text-[var(--text-primary)]"
          onClick={() => setView({ x: 0, y: 0, k: 1 })}
        >
          Reset view
        </button>
        <span>Scroll to zoom · drag to pan</span>
      </div>
    </>
  );
}
