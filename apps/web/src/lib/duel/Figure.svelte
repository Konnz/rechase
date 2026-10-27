<script lang="ts" module>
  export type FigureVariant = 'pfeil' | 'licht' | 'plakette' | 'fahrer';
</script>

<script lang="ts">
  // Figuren aus dem Mockup „Figuren-Varianten“; der Ghost ist halbtransparent mit gestricheltem Rand.
  let { variant = 'pfeil', ghost = false, color }: { variant?: FigureVariant; ghost?: boolean; color: string } =
    $props();

  const fillOp = $derived(ghost ? 0.3 : 1);
  const limbOp = $derived(ghost ? 0.6 : 1);
  const haloOp = $derived(ghost ? 0.12 : 0.25);
  const shine = $derived(ghost ? 0 : 0.18);
  const seamOp = $derived(ghost ? 0 : 0.35);
  const dash = $derived(ghost ? '3 2' : 'none');
  const edge = $derived(ghost ? color : '#0D0F12');
  const ringEdge = $derived(ghost ? color : 'none');
  const aria = $derived(ghost ? 'Ghost deiner Bestzeit' : 'Du');
</script>

<svg role="img" aria-label={aria} width="100%" viewBox="0 0 40 56">
  {#if variant === 'pfeil'}
    <ellipse cx="20" cy="52" rx="14" ry="3" fill="#000" fill-opacity="0.35" />
    <path d="M20 6 L36 50 L20 41 L4 50 Z" fill={color} fill-opacity={fillOp} stroke={edge} stroke-width="2" stroke-dasharray={dash} stroke-linejoin="round" />
    <path d="M20 6 L20 41 L4 50 Z" fill="#fff" fill-opacity={shine} />
  {:else if variant === 'licht'}
    <path d="M12 40 L28 40 L23 56 L17 56 Z" fill={color} fill-opacity="0.35" />
    <circle cx="20" cy="36" r="16" fill={color} fill-opacity={haloOp} />
    <circle cx="20" cy="36" r="8.5" fill={color} fill-opacity={fillOp} stroke={ringEdge} stroke-width="2" stroke-dasharray={dash} />
    <circle cx="17.5" cy="33.5" r="2.5" fill="#fff" fill-opacity={shine} />
  {:else if variant === 'plakette'}
    <ellipse cx="20" cy="54" rx="6" ry="1.6" fill="#000" fill-opacity="0.4" />
    <path d="M13.5 32 L20 54 L26.5 32 Z" fill={color} fill-opacity={fillOp} />
    <circle cx="20" cy="19" r="15" fill={color} fill-opacity={fillOp} stroke={edge} stroke-width="2" stroke-dasharray={dash} />
    <text x="20" y="24" text-anchor="middle" font-family="'Barlow Condensed', sans-serif" font-weight="700" font-size="14" fill={ghost ? color : '#0D0F12'}>{ghost ? 'BZ' : 'DU'}</text>
  {:else}
    <ellipse cx="20" cy="55" rx="9" ry="1.8" fill="#000" fill-opacity="0.4" />
    <rect x="18.5" y="38" width="3" height="18" rx="1.5" fill={color} fill-opacity={limbOp} />
    <path d="M15 36 L16.5 48 M25 36 L23.5 45" fill="none" stroke={color} stroke-opacity={limbOp} stroke-width="3.5" stroke-linecap="round" />
    <path d="M8 33 Q20 30 32 33" fill="none" stroke={color} stroke-opacity={limbOp} stroke-width="2" stroke-linecap="round" />
    <path d="M8 33 C8 24 13 20 20 20 C27 20 32 24 32 33 C28 36 24 37 20 37 C16 37 12 36 8 33 Z" fill={color} fill-opacity={fillOp} stroke={ringEdge} stroke-width="1.5" stroke-dasharray={dash} />
    <path d="M20 23 L20 34" fill="none" stroke="#0D0F12" stroke-opacity={seamOp} stroke-width="1.2" stroke-linecap="round" />
    <path d="M14 17 C14 11.5 17 9 20 9 C23 9 26 11.5 26 17 C24 19 16 19 14 17 Z" fill={color} fill-opacity={fillOp} stroke={ringEdge} stroke-width="1.5" stroke-dasharray={dash} />
  {/if}
</svg>

<style>
  svg {
    display: block;
    overflow: visible;
  }
</style>
