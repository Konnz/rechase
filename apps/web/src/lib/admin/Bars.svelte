<script lang="ts">
  /** Säulen je Woche für eine Kennzahl, mit Wert beim Überfahren und am höchsten Balken. */
  let { items, label, unit = '', digits = 0 }: { items: { label: string; value: number }[]; label: string; unit?: string; digits?: number } =
    $props();

  const max = $derived(Math.max(1, ...items.map((i) => i.value)));
  const nf = $derived(new Intl.NumberFormat('de-DE', { maximumFractionDigits: digits }));
  let hover = $state<number | null>(null);
</script>

<figure>
  <figcaption>{label}</figcaption>
  <div class="bars" role="list">
    {#each items as it, i (it.label)}
      <div
        class="col"
        role="listitem"
        aria-label="{it.label}: {nf.format(it.value)} {unit}"
        onpointerenter={() => (hover = i)}
        onpointerleave={() => (hover = null)}
      >
        <span class="v" class:show={hover === i || (hover == null && it.value === max && it.value > 0)}>
          {nf.format(it.value)}{unit ? ` ${unit}` : ''}
        </span>
        <div class="track"><div class="bar" style:height="{(it.value / max) * 100}%"></div></div>
        <span class="x">{it.label}</span>
      </div>
    {/each}
  </div>
</figure>

<style>
  figure {
    margin: 0;
  }
  figcaption {
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 8px;
  }
  .bars {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: 130px;
    border-bottom: 1px solid var(--line);
    margin-bottom: 20px;
  }
  .col {
    position: relative;
    flex: 1;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    align-items: center;
  }
  .track {
    flex: 1;
    width: 70%;
    display: flex;
    align-items: flex-end;
  }
  .bar {
    width: 100%;
    min-height: 1px;
    border-radius: 4px 4px 0 0;
    background: var(--you);
  }
  .col:hover .bar {
    filter: brightness(1.2);
  }
  .v {
    margin-bottom: 2px;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    color: var(--text);
    visibility: hidden;
    white-space: nowrap;
  }
  .v.show {
    visibility: visible;
  }
  .x {
    position: absolute;
    bottom: -18px;
    font-size: 11px;
    color: var(--muted);
  }
</style>
