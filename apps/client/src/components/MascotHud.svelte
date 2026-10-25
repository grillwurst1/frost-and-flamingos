<script lang="ts">
  import { SKILLS, type SkillId } from '@frost-and-flamingos/shared';
  import { mascotHud } from '../state/mascot';
  import { t } from '../state/locale';
  import MascotPortrait from './MascotPortrait.svelte';

  /** Mascot status card: portrait, vitality, gallop/momentum meter and the three moves. */
  const MOVE_KEYS = ['Q', 'E', 'T'] as const;
  const MOVE_COLOURS = ['#2f7fd8', '#f08a24', '#d8282e'] as const;
  const iconBase = `${import.meta.env.BASE_URL}art/icons/skills/`;
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
          <img src={`${iconBase}${move}.png`} alt={moveName(move)} draggable="false" />
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
  .mascot-card {
    position: absolute;
    left: max(1rem, env(safe-area-inset-left));
    top: 56%;
    transform: translateY(-50%);
    z-index: 3;
    width: 14rem;
    padding: 0.5rem 0.6rem 0.45rem;
    border: 3px solid #1b1410;
    border-radius: 1.1rem;
    background: linear-gradient(180deg, #fff6e2 0%, #f3dfb8 100%);
    box-shadow: 0 4px 0 #1b1410, 0 10px 18px rgba(0, 0, 0, 0.25);
    color: #2a1a10;
    pointer-events: none;
    font-family: var(--font-display);
  }

  .mascot-card.is-cow {
    background: linear-gradient(180deg, #f4fbff 0%, #d8ecf8 100%);
  }

  .mascot-card.is-down {
    filter: grayscale(0.7);
    opacity: 0.8;
  }

  .mascot-head {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    margin-bottom: 0.4rem;
  }

  .mascot-portrait-tile {
    display: block;
    width: 3rem;
    height: 4.6rem;
    object-fit: contain;
    filter: drop-shadow(0 2px 0 rgba(27, 20, 16, 0.55));
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
    line-height: 1.05;
    min-width: 0;
  }

  .mascot-title strong {
    font-size: 1.12rem;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: #1b1410;
  }

  .mascot-title span {
    font-size: 0.72rem;
    font-family: var(--font-body);
    color: #6b4426;
  }

  .mascot-bar-label {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-top: 0.15rem;
  }

  .mascot-bar-label strong {
    font-size: 0.74rem;
  }

  .mascot-track {
    height: 0.8rem;
    border: 2.5px solid #1b1410;
    border-radius: 999px;
    background: #3a2a20;
    overflow: hidden;
    margin: 0.12rem 0 0.2rem;
  }

  .mascot-track.is-thin {
    height: 0.6rem;
  }

  .mascot-fill {
    height: 100%;
    border-radius: 999px;
    transition: width 0.22s ease-out;
  }

  .mascot-fill.is-hp {
    background: linear-gradient(180deg, #8de05a 0%, #3fae32 100%);
  }

  .mascot-fill.is-hp.is-low {
    background: linear-gradient(180deg, #ff8a7a 0%, #e0352e 100%);
  }

  .mascot-fill.is-meter {
    background: linear-gradient(180deg, #ffe58a 0%, #f4b73f 100%);
  }

  .mascot-fill.is-meter.is-hot {
    background: linear-gradient(90deg, #ff9f1c, #ff3b3b);
  }

  .mascot-fill.is-meter.is-empty {
    background: #9a8a7a;
  }

  .mascot-status {
    display: inline-block;
    margin: 0.1rem 0 0.2rem;
    padding: 0.1rem 0.55rem;
    border: 2px solid #1b1410;
    border-radius: 999px;
    background: #ffd23f;
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    transform: rotate(-3deg);
  }

  .mascot-status.is-alert {
    background: #ff6fb5;
    color: #fff;
  }

  .mascot-moves {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.4rem;
    margin-top: 0.3rem;
  }

  .mascot-move {
    position: relative;
    aspect-ratio: 1;
    border: 3px solid #1b1410;
    border-radius: 0.8rem;
    background: var(--tile);
    overflow: hidden;
    box-shadow: 0 3px 0 #1b1410;
  }

  .mascot-move.is-active {
    transform: translateY(-3px);
    box-shadow: 0 5px 0 #1b1410, 0 0 0 3px #ffd23f;
  }

  .mascot-move img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
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
    font-size: 1.05rem;
    font-weight: 800;
    text-shadow: 0 2px 0 #1b1410, 0 0 4px #1b1410;
  }

  .mascot-move kbd {
    position: absolute;
    left: 0.15rem;
    bottom: 0.15rem;
    min-width: 1.15rem;
    padding: 0 0.2rem;
    border: 2px solid #1b1410;
    border-radius: 0.35rem;
    background: #fff6e2;
    color: #1b1410;
    font-size: 0.72rem;
    font-family: var(--font-display);
    text-align: center;
    line-height: 1.1rem;
  }

  .mascot-slot {
    position: absolute;
    right: 0.2rem;
    top: 0.1rem;
    color: #fff;
    font-size: 0.72rem;
    text-shadow: 0 1px 0 #1b1410, 0 0 3px #1b1410;
  }

  .mascot-keys {
    margin: 0.35rem 0 0;
    font-size: 0.64rem;
    font-family: var(--font-body);
    color: #6b4426;
    text-align: center;
  }
</style>
