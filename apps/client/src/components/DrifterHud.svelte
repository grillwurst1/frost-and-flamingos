<script lang="ts">
  import { DRIFTER_AURA, drifterFormForFaction } from '@frost-and-flamingos/shared';
  import { localPlayer } from '../state/game';
  import { t } from '../state/locale';
  import DrifterEmblem from './DrifterEmblem.svelte';

  /**
   * Drifter status card in place of the weapon dock: who she is, the
   * "untouchable" stamp, her support points (with a +N pop when they grow)
   * and what the supply aura is doing right now.
   */
  $: player = $localPlayer;
  $: faction = player?.faction ?? 'alpine';
  $: form = drifterFormForFaction(faction);
  $: support = player?.support ?? 0;
  $: targets = player?.auraTargets ?? 0;

  let shown = 0;
  let gained = 0;
  let popKey = 0;
  $: if (support !== shown) {
    if (support > shown && shown > 0) {
      gained = support - shown;
      popKey += 1;
    }
    shown = support;
  }
</script>

<section class={`drifter-card is-${form}`} class:is-active={targets > 0} aria-label={$t('drifter.hud.card')}>
  <div class="drifter-head">
    <DrifterEmblem {form} size={52} />
    <div class="drifter-title">
      <strong>{$t(`drifter.forms.${form}`)}</strong>
      <span class="drifter-stamp">{$t('drifter.hud.untouchable')}</span>
    </div>
  </div>

  <div class="drifter-support" title={$t('drifter.hud.support')}>
    <span class="drifter-support-label">{$t('drifter.hud.support')}</span>
    <strong class="drifter-support-value">{support}</strong>
    {#key popKey}
      {#if popKey > 0}<span class="drifter-support-pop">{$t('drifter.hud.plusPoint', { points: gained })}</span>{/if}
    {/key}
  </div>

  <div class="drifter-aura">
    <i class="drifter-aura-dot" aria-hidden="true"></i>
    <span>
      {targets > 0 ? $t('drifter.hud.auraActive', { count: targets }) : $t('drifter.hud.auraIdle')}
    </span>
    <small>{$t('drifter.hud.auraRadius', { radius: DRIFTER_AURA.radius })}</small>
  </div>
  <p class="drifter-hint">{$t('drifter.hud.untouchableHint')}</p>
</section>

<style>
  /* Comic paper card in the 1B HUD language, faction stripe on the left. */
  .drifter-card {
    position: absolute;
    right: 1.3rem;
    bottom: 1.35rem;
    z-index: 3;
    width: 15rem;
    padding: 0.55rem 0.7rem 0.5rem 0.6rem;
    border: 0.18rem solid var(--ink);
    border-left: 0.5rem solid var(--blue);
    border-radius: 0.95rem;
    background: linear-gradient(180deg, #fffaf0, var(--cream-2));
    box-shadow:
      inset 0 0 0 0.14rem rgba(255, 255, 255, 0.55),
      var(--shadow-hard);
    color: var(--ink);
    pointer-events: none;
    font-family: var(--font-body);
    transform: rotate(0.8deg);
  }

  .drifter-card.is-beach_girl {
    border-left-color: var(--coral);
  }

  .drifter-head {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    margin-bottom: 0.35rem;
    padding-bottom: 0.35rem;
    border-bottom: 0.14rem dashed var(--paper-edge);
  }

  .drifter-title {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    min-width: 0;
  }

  .drifter-title strong {
    font-size: 0.95rem;
    line-height: 1.05;
  }

  .drifter-stamp {
    align-self: flex-start;
    padding: 0.04rem 0.5rem 0.1rem;
    border: 0.14rem solid var(--ink);
    border-radius: 0.4rem;
    background: linear-gradient(180deg, #e9f6ff, var(--blue-light));
    box-shadow: 0 0.12rem 0 rgba(27, 20, 16, 0.55);
    font-family: var(--font-display);
    font-size: 0.82rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    transform: rotate(-3deg);
  }

  .is-beach_girl .drifter-stamp {
    background: linear-gradient(180deg, #ffe6ee, var(--coral-light));
  }

  .drifter-support {
    position: relative;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .drifter-support-label {
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .drifter-support-value {
    font-family: var(--font-display);
    font-size: 1.75rem;
    line-height: 1;
    color: var(--brass-dark);
    -webkit-text-stroke: 0.06rem var(--ink);
  }

  .drifter-support-pop {
    position: absolute;
    right: 0.1rem;
    top: -0.9rem;
    font-family: var(--font-display);
    font-size: 1.05rem;
    color: var(--cheese);
    -webkit-text-stroke: 0.05rem var(--ink);
    animation: support-pop 1.1s ease-out both;
  }

  @keyframes support-pop {
    0% {
      opacity: 0;
      transform: translateY(0.4rem) scale(0.6);
    }
    20% {
      opacity: 1;
      transform: translateY(0) scale(1.15);
    }
    100% {
      opacity: 0;
      transform: translateY(-1rem) scale(1);
    }
  }

  .drifter-aura {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    margin-top: 0.3rem;
    font-size: 0.78rem;
    font-weight: 700;
  }

  .drifter-aura small {
    margin-left: auto;
    font-size: 0.66rem;
    opacity: 0.75;
  }

  .drifter-aura-dot {
    flex: none;
    width: 0.7rem;
    height: 0.7rem;
    border: 0.12rem solid var(--ink);
    border-radius: 50%;
    background: #c9c2b4;
  }

  .is-active .drifter-aura-dot {
    background: var(--blue-light);
    animation: aura-pulse 0.9s ease-in-out infinite alternate;
  }

  .is-active.is-beach_girl .drifter-aura-dot {
    background: var(--coral-light);
  }

  @keyframes aura-pulse {
    from {
      transform: scale(0.85);
    }
    to {
      transform: scale(1.2);
    }
  }

  .drifter-hint {
    margin: 0.3rem 0 0;
    font-size: 0.66rem;
    line-height: 1.25;
    opacity: 0.8;
  }
</style>
