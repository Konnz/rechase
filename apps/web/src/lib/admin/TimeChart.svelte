<script lang="ts">
  /**
   * Verlauf über die Fahrzeit mit einer Achse: eine Linie, Pausen grau hinterlegt, Lücken rot markiert.
   * Fährt man mit der Maus darüber, wird die Zeit geteilt, damit die Karte die Stelle zeigt.
   */
  let {
    points,
    label,
    unit,
    color,
    digits = 0,
    pauses = [],
    gaps = [],
    hoverT = $bindable(null),
  }: {
    points: { t: number; v: number }[];
    label: string;
    unit: string;
    color: string;
    digits?: number;
    pauses?: { from: number; to: number }[];
    gaps?: { from: number; to: number }[];
    hoverT?: number | null;
  } = $props();

  const H = 150;
  const PAD = { top: 10, right: 12, bottom: 22, left: 40 };
  let width = $state(600);

  const t0 = $derived(points[0]?.t ?? 0);
  const t1 = $derived(points.at(-1)?.t ?? 1);
  const vmax = $derived(niceMax(Math.max(1, ...points.map((p) => p.v))));
  const innerW = $derived(Math.max(1, width - PAD.left - PAD.right));
  const innerH = H - PAD.top - PAD.bottom;

  const x = (t: number) => PAD.left + ((t - t0) / Math.max(1, t1 - t0)) * innerW;
  const y = (v: number) => PAD.top + innerH - (Math.min(v, vmax) / vmax) * innerH;

  function niceMax(v: number) {
    const step = 10 ** Math.floor(Math.log10(v));
    for (const m of [1, 2, 2.5, 5, 10]) if (m * step >= v) return m * step;
    return 10 * step;
  }

  /** Höchstens ein Punkt je Pixel, sonst wird der Pfad bei langen Fahrten unnötig schwer */
  const path = $derived.by(() => {
    let d = '';
    let lastX = -Infinity;
    let prevT: number | null = null;
    for (const p of points) {
      const px = x(p.t);
      const broken = prevT != null && gaps.some((g) => g.from >= prevT! && g.to <= p.t);
      if (px - lastX < 1 && !broken) continue;
      d += `${d && !broken ? 'L' : 'M'}${px.toFixed(1)},${y(p.v).toFixed(1)}`;
      lastX = px;
      prevT = p.t;
    }
    return d;
  });

  const ticks = $derived([0, 0.5, 1].map((f) => f * vmax));
  const minutes = $derived.by(() => {
    const total = (t1 - t0) / 60_000;
    const step = [5, 10, 15, 30, 60, 120].find((s) => total / s <= 6) ?? 240;
    const out: number[] = [];
    for (let m = 0; m <= total; m += step) out.push(m);
    return out;
  });

  const nf = $derived(new Intl.NumberFormat('de-DE', { maximumFractionDigits: digits, minimumFractionDigits: digits }));

  const hover = $derived.by(() => {
    if (hoverT == null || !points.length) return null;
    let best = points[0]!;
    for (const p of points) if (Math.abs(p.t - hoverT) < Math.abs(best.t - hoverT)) best = p;
    return best;
  });

  function move(e: PointerEvent) {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    const px = e.clientX - r.left;
    if (px < PAD.left || px > width - PAD.right) return;
    hoverT = t0 + ((px - PAD.left) / innerW) * (t1 - t0);
  }

  const clock = (t: number) => new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
</script>

<figure>
  <figcaption>{label} <span>in {unit}</span></figcaption>
  <div class="wrap" bind:clientWidth={width}>
    <svg
      {width}
      height={H}
      role="img"
      aria-label="{label} über die Fahrzeit"
      onpointermove={move}
      onpointerleave={() => (hoverT = null)}
    >
      {#each pauses as p (p.from)}
        <rect class="pause" x={x(p.from)} y={PAD.top} width={Math.max(1, x(p.to) - x(p.from))} height={innerH} />
      {/each}
      {#each gaps as g (g.from)}
        <rect class="gap" x={x(g.from)} y={PAD.top} width={Math.max(2, x(g.to) - x(g.from))} height={innerH} />
      {/each}
      {#each ticks as v (v)}
        <line class="grid" x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} />
        <text class="axis" x={PAD.left - 6} y={y(v) + 4} text-anchor="end">{nf.format(v)}</text>
      {/each}
      {#each minutes as m (m)}
        <text class="axis" x={x(t0 + m * 60_000)} y={H - 6} text-anchor="middle">{m} min</text>
      {/each}
      <path d={path} stroke={color} />
      {#if hover}
        <line class="cross" x1={x(hover.t)} x2={x(hover.t)} y1={PAD.top} y2={PAD.top + innerH} />
        <circle cx={x(hover.t)} cy={y(hover.v)} r="4" fill={color} />
      {/if}
    </svg>
    {#if hover}
      <div class="tip" style:left="{Math.min(x(hover.t) + 8, width - 130)}px">
        <strong>{nf.format(hover.v)} {unit}</strong>
        <span>{clock(hover.t)} · {Math.round((hover.t - t0) / 60_000)} min</span>
      </div>
    {/if}
  </div>
</figure>

<style>
  figure {
    margin: 0;
  }
  figcaption {
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 4px;
  }
  figcaption span {
    color: var(--muted);
    font-weight: 400;
  }
  .wrap {
    position: relative;
  }
  svg {
    display: block;
    touch-action: pan-y;
  }
  path {
    fill: none;
    stroke-width: 2;
    stroke-linejoin: round;
  }
  .grid {
    stroke: var(--line);
    stroke-width: 1;
  }
  .axis {
    fill: var(--muted);
    font-size: 11px;
  }
  .pause {
    fill: #ffffff;
    opacity: 0.05;
  }
  .gap {
    fill: var(--rec);
    opacity: 0.35;
  }
  .cross {
    stroke: var(--muted);
    stroke-width: 1;
  }
  .tip {
    position: absolute;
    top: 6px;
    display: flex;
    flex-direction: column;
    padding: 6px 10px;
    border-radius: 8px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    font-size: 12px;
    color: var(--muted);
    pointer-events: none;
    white-space: nowrap;
  }
  .tip strong {
    color: var(--text);
    font-size: 14px;
  }
</style>
