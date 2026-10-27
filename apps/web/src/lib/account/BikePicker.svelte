<script lang="ts">
  import { BIKES, type BikeType } from '@rechase/core';

  let { value, onchange }: { value: BikeType | null; onchange: (bike: BikeType) => void } = $props();
</script>

<div class="bikes" role="radiogroup" aria-label="Rad">
  {#each BIKES as b (b.type)}
    <button
      type="button"
      role="radio"
      aria-checked={value === b.type}
      class:on={value === b.type}
      class:e={b.bikeClass !== 'muscle'}
      onclick={() => onchange(b.type)}
    >
      <span class="label">{b.label}</span>
      <span class="hint">{b.hint}</span>
    </button>
  {/each}
</div>

<style>
  .bikes {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  button {
    min-height: 64px;
    padding: 10px 12px;
    border: 1.5px solid var(--line);
    border-radius: 14px;
    background: var(--surface);
    color: var(--text);
    text-align: left;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
    cursor: pointer;
  }
  button.on {
    border-color: var(--you);
    background: color-mix(in srgb, var(--you) 14%, var(--surface));
  }
  .label {
    font-size: 16px;
    font-weight: 700;
  }
  .hint {
    font-size: 12px;
    color: var(--muted);
  }
  /* E-Bikes werten getrennt: kleiner Hinweis in Grün statt Grau */
  .e .hint {
    color: #7ad98a;
  }
</style>
