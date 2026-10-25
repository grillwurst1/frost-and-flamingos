<script lang="ts">
  import { SKILLS, type SkillId } from '@frost-and-flamingos/shared';
  import { mascotHud } from '../state/mascot';
  import { t } from '../state/locale';
  import MascotPortrait from './MascotPortrait.svelte';
  import Pictogram from './icons/Pictogram.svelte';

  /** Mascot status card: portrait, vitality, gallop/momentum meter and the three moves. */
  const MOVE_KEYS = ['Q', 'E', 'T'] as const;
  const MOVE_COLOURS = ['#2f7fd8', '#f08a24', '#d8282e'] as const;
  const portraitBase = `${import.meta.env.BASE_URL}art/portraits/`;
  /** Forms whose painted portrait failed to load fall back to the SVG face. */
  let portraitFailed: Record<string, boolean> = {};

  $: hud = $mascotHud;
  $: hpPercent = hud ? Math.max(0, Math.min(100, (hud.hp / Math.max(1, hud.maxHp)) * 100)) : 0;
  $: meterPercent = hud ? Math.round((hud.form === 'cow' ? hud.stamina : hud.momentum) * 100) : 0;
  let mood: 'normal' | 'angry' | 'dizzy' = 'normal';
  $: mood = !hud
    ? 'normal'
    : hud.dazed
      ? 'dizzy'
      : hud.boosting || hud.pounding || hud.skidding
        ? 'angry'
        : 'normal';
  $: status = !hud
    ? null
    : hud.dazed
      ? $t('mascot.hud.dazed')
      : hud.slippery
        ? $t('mascot.hud.slippery')
        : hud.pounding
          ? $t('mascot.hud.pounding')
          : hud.boosting
            ? $t(hud.form === 'cow' ? 'mascot.hud.charging' : 'mascot.hud.turbo')
            : hud.skidding
              ? $t('mascot.hud.skidding')
              : hud.exhausted
                ? $t('mascot.hud.exhausted')
                : null;

  function cooldownPercent(index: number): number {
    if (!hud) return 0;
    const max = hud.cooldownMax[index] ?? 1;
    return Math.max(0, Math.min(100, ((hud.cooldowns[index] ?? 0) / Math.max(0.1, max)) * 100));
  }

  function moveName(id: SkillId): string {
    return $t(SKILLS[id].nameKey);
  }
</script>

{#if hud}
  <section
    class="mascot-card"
    class:is-down={!hud.alive}
    class:is-cow={hud.form === 'cow'}
    aria-label={$t('mascot.hud.card')}
  >
    <div class="mascot-head">
      <div class="mascot-portrait" class:is-shaking={hud.dazed} class:is-angry={mood === 'angry'}>
        {#if portraitFailed[hud.form]}
          <MascotPortrait form={hud.form} size={56} {mood} />
        {:else}
          <img
            class="mascot-portrait-tile"
            src={`${portraitBase}portrait_${hud.form}.png`}
            alt=""
            draggable="false"
            on:error={() => (portraitFailed = { ...portraitFailed, [hud.form]: true })}
          />
        {/if}
      </div>
      <div class="mascot-title">
        <strong>{$t(hud.form === 'cow' ? 'mascot.forms.cow' : 'mascot.forms.coconut')}</strong>
        <span>{$t(hud.form === 'cow' ? 'mascot.formFaction.cow' : 'mascot.formFaction.coconut')}</span>
      </div>
    </div>

    <div class="mascot-bar-label">
      <span>{$t('mascot.hud.vitality')}</span>
      <strong class="mono">{Math.round(hud.hp)} / {Math.round(hud.maxHp)}</strong>
    </div>
    <div class="mascot-track">
      <div class="mascot-fill is-hp" class:is-low={hpPercent < 30} style={`width:${hpPercent}%`}></div>
    </div>

    <div class="mascot-bar-label">
      <span>{$t(hud.form === 'cow' ? 'mascot.hud.gallop' : 'mascot.hud.momentum')}</span>
      <strong class="mono">{$t('mascot.hud.speed', { value: hud.speed.toFixed(1) })}</strong>
    </div>
    <div class="mascot-track is-thin">
      <div
        class="mascot-fill is-meter"
        class:is-empty={hud.form === 'cow' && hud.exhausted}
        class:is-hot={hud.boosting}
        style={`width:${meterPercent}%`}
      ></div>
    </div>

    {#if status}
      <span class="mascot-status" class:is-alert={hud.dazed || hud.slippery}>{status}</span>
    {/if}

    <div class="mascot-moves">
      {#each hud.moves as move, index (move)}
        {@const percent = cooldownPercent(index)}
        <div
          class="mascot-move"
          class:is-ready={percent <= 0}
          class:is-active={hud.activeSlot === index + 1}
          style={`--tile:${MOVE_COLOURS[index]};--cooldown:${percent}%`}
          title={$t(SKILLS[move].descriptionKey)}
        >
          <span class="mascot-tile" role="img" aria-label={moveName(move)}><Pictogram skill={move} painted /></span>
          {#if percent > 0}
            <span class="mascot-sweep" aria-hidden="true"></span>
            <span class="mascot-seconds mono">
              {$t('mascot.hud.cooldown', { seconds: Math.ceil(hud.cooldowns[index] ?? 0) })}
            </span>
          {/if}
          <kbd>{MOVE_KEYS[index]}</kbd>
          <span class="mascot-slot">{index + 1}</span>
        </div>
      {/each}
    </div>
    <p class="mascot-keys">{$t('mascot.hud.moveKeys')}</p>
  </section>
{/if}

<style>
  /* Comic paper card in the 1B HUD language: cream paper, ink outline, hard drop shadow,
     faction stripe (Peak Guard blue for the cow, Lagoon coral for the coconut). */
  .mascot-card {
    position: absolute;
    left: 1.2rem;
    top: 54%;
    transform: translateY(-50%) rotate(-1.2deg);
    z-index: 3;
    width: 14.5rem;
    padding: 0.55rem 0.7rem 0.5rem 0.6rem;
    border: 0.18rem solid var(--ink);
    border-left: 0.5rem solid var(--coral);
    border-radius: 0.95rem;
    background: linear-gradient(180deg, #fffaf0, var(--cream-2));
    box-shadow:
      inset 0 0 0 0.14rem rgba(255, 255, 255, 0.55),
      var(--shadow-hard);
    color: var(--ink);
    pointer-events: none;
    font-family: var(--font-body);
  }

  .mascot-card.is-cow {
    border-left-color: var(--blue);
  }

  .mascot-card.is-down {
    filter: grayscale(0.7);
    opacity: 0.8;
  }

  .mascot-head {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    margin-bottom: 0.35rem;
    padding-bottom: 0.35rem;
    border-bottom: 0.14rem dashed var(--paper-edge);
  }

  .mascot-portrait-tile {
    display: block;
    width: 3rem;
    height: 4.4rem;
    object-fit: contain;
    filter: drop-shadow(0 0.12rem 0 rgba(27, 20, 16, 0.55));
  }

  .mascot-portrait.is-angry {
    animation: mascot-pulse 0.5s ease-in-out infinite alternate;
  }

  @keyframes mascot-pulse {
    from {
      transform: scale(1);
    }
    to {
      transform: scale(1.06) rotate(-2deg);
    }
  }

  .mascot-portrait.is-shaking {
    animation: mascot-wobble 0.45s ease-in-out infinite alternate;
  }

  @keyframes mascot-wobble {
    from {
      transform: rotate(-7deg);
    }
    to {
      transform: rotate(7deg);
    }
  }

  .mascot-title {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    line-height: 1.05;
    min-width: 0;
  }

  .mascot-title strong {
    font-family: var(--font-display);
    font-size: 1.1rem;
    font-weight: 400;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: var(--ink);
    text-shadow: 0 0.1rem 0 var(--brass-light);
  }

  .mascot-title span {
    font-size: 0.68rem;
    font-weight: 600;
    color: var(--ui-muted);
  }

  .mascot-bar-label {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-top: 0.15rem;
    font-family: var(--font-display);
    font-size: 0.7rem;
    font-weight: 400;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .mascot-bar-label strong {
    font-size: 0.72rem;
    font-weight: 400;
  }

  .mascot-track {
    position: relative;
    height: 0.95rem;
    margin: 0.12rem 0 0.22rem;
    overflow: hidden;
    border: 0.17rem solid var(--ink);
    border-radius: 99px;
    background: linear-gradient(180deg, #2b3260, var(--navy));
    box-shadow:
      0 0.15rem 0 rgba(27, 20, 16, 0.5),
      inset 0 0.18rem 0 rgba(0, 0, 0, 0.3);
  }

  .mascot-track.is-thin {
    height: 0.72rem;
  }

  .mascot-fill {
    height: 100%;
    border-right: 0.12rem solid rgba(27, 20, 16, 0.65);
    transition: width 0.18s ease-out;
  }

  .mascot-fill.is-hp {
    background: linear-gradient(180deg, #a9f56f 0%, #62cf3a 45%, #35961f 100%);
  }

  .mascot-fill.is-hp.is-low {
    background: linear-gradient(180deg, #ff8d86 0%, #e8353f 50%, #a8202a 100%);
  }

  .mascot-fill.is-meter {
    background: linear-gradient(180deg, var(--brass-light) 0%, var(--cheese) 50%, var(--cheese-dark) 100%);
  }

  .mascot-fill.is-meter.is-hot {
    background: linear-gradient(90deg, var(--orange), var(--red));
  }

  .mascot-fill.is-meter.is-empty {
    background: #9a8a7a;
  }

  .mascot-status {
    display: inline-block;
    margin: 0.1rem 0 0.2rem;
    padding: 0.08rem 0.6rem 0.12rem;
    border: 0.15rem solid var(--ink);
    border-radius: 99px;
    background: linear-gradient(180deg, #fff6b4, var(--cheese));
    box-shadow: 0 0.14rem 0 rgba(27, 20, 16, 0.55);
    font-family: var(--font-display);
    font-size: 0.76rem;
    font-weight: 400;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    transform: rotate(-3deg);
  }

  .mascot-status.is-alert {
    background: linear-gradient(180deg, var(--coral-light), var(--flamingo));
    color: #fff;
    text-shadow: 0 0.08rem 0 var(--ink);
  }

  .mascot-moves {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.42rem;
    margin-top: 0.32rem;
  }

  .mascot-move {
    position: relative;
    aspect-ratio: 1;
    overflow: hidden;
    border: 0.17rem solid var(--ink);
    border-radius: 0.75rem;
    background: var(--tile);
    box-shadow:
      inset 0 0.14rem 0 rgba(255, 255, 255, 0.35),
      0 0.2rem 0 rgba(27, 20, 16, 0.6);
  }

  .mascot-move.is-ready {
    box-shadow:
      inset 0 0.14rem 0 rgba(255, 255, 255, 0.35),
      0 0.2rem 0 rgba(27, 20, 16, 0.6),
      0 0 0 0.12rem var(--brass-light);
  }

  .mascot-move.is-active {
    transform: translateY(-0.18rem);
    box-shadow:
      0 0.32rem 0 rgba(27, 20, 16, 0.6),
      0 0 0 0.18rem var(--cheese);
  }

  .mascot-tile {
    display: block;
    width: 100%;
    height: 100%;
  }

  .mascot-tile :global(.pictogram) {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .mascot-sweep {
    position: absolute;
    inset: 0;
    background: conic-gradient(rgba(10, 8, 6, 0.62) var(--cooldown), transparent 0);
  }

  .mascot-seconds {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: #fff;
    font-family: var(--font-display);
    font-size: 1.05rem;
    font-weight: 400;
    text-shadow: 0 0.12rem 0 var(--ink), 0 0 0.25rem var(--ink);
  }

  .mascot-move kbd {
    position: absolute;
    left: 0.14rem;
    bottom: 0.14rem;
    min-width: 1.15rem;
    padding: 0 0.2rem;
    border: 0.13rem solid var(--ink);
    border-radius: 0.35rem;
    background: var(--cream);
    color: var(--ink);
    font-family: var(--font-display);
    font-size: 0.7rem;
    line-height: 1.05rem;
    text-align: center;
    box-shadow: 0 0.1rem 0 rgba(27, 20, 16, 0.55);
  }

  .mascot-slot {
    position: absolute;
    top: 0.08rem;
    right: 0.22rem;
    color: #fff;
    font-family: var(--font-display);
    font-size: 0.72rem;
    text-shadow: 0 0.08rem 0 var(--ink), 0 0 0.2rem var(--ink);
  }

  .mascot-keys {
    margin: 0.38rem 0 0;
    color: var(--ui-muted);
    font-size: 0.62rem;
    font-weight: 600;
    text-align: center;
  }
</style>
