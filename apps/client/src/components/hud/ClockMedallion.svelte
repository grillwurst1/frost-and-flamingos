<script lang="ts">
  import { conquest } from '../../state/conquest';
  import { connection } from '../../state/game';
  import { t } from '../../state/locale';

  const TOWERS = [
    { letter: 'A', nameKey: 'world.towers.a' },
    { letter: 'B', nameKey: 'world.towers.b' },
    { letter: 'C', nameKey: 'world.towers.c' },
  ] as const;

  const RING_RADIUS = 15;
  const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

  /** Twelve brass hour ticks, precomputed so the template stays readable. */
  const TICKS = Array.from({ length: 12 }, (_, i) => {
    const angle = (i / 12) * Math.PI * 2;
    const major = i % 3 === 0;
    const inner = major ? 27 : 30;
    return {
      x1: 60 + Math.sin(angle) * inner,
      y1: 60 - Math.cos(angle) * inner,
      x2: 60 + Math.sin(angle) * 34,
      y2: 60 - Math.cos(angle) * 34,
      major,
    };
  });

  $: balance = Math.max(-1, Math.min(1, $connection.weatherBalance));
  // The single hand swings from the snowflake (left) to the sun (right).
  $: needleAngle = balance * 62;
  $: owners = $conquest.synced
    ? $conquest.towers.map((tower) => (tower.owner === 'alpine' ? 1 : tower.owner === 'lagoon' ? 2 : 0))
    : [0, 1, 2].map((index) => ($connection.towerStates >> (index * 2)) & 3);
  // Capture progress per tower, clamped to 0..1; the ring only shows while a capture is under way.
  $: progresses = [0, 1, 2].map((index) => {
    const value = $connection.towerProgress[index] ?? 0;
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  });
  // The ring fills in the colour of the side the control leans to (Peak Guard blue, Lagoon pink).
  $: ringColors = $conquest.towers.map((tower) => (tower.control < 0 ? '#8fd0ff' : '#ffb0cc'));
  $: contested = $conquest.towers.map((tower) => tower.contested);
  $: pushed = $conquest.towers.map((tower) => tower.pushing !== null);
  $: clockSeconds = Math.max(0, Math.ceil($conquest.secondsLeft));
  $: roundClock = `${Math.floor(clockSeconds / 60)}:${String(clockSeconds % 60).padStart(2, '0')}`;

  function ownerClass(owner: number): string {
    if (owner === 1) return 'is-alpine';
    if (owner === 2) return 'is-lagoon';
    return 'is-neutral';
  }

  function ownerLabel(owner: number): string {
    if (owner === 1) return $t('factions.alpine.short');
    if (owner === 2) return $t('factions.lagoon.short');
    return $t('hud.neutralTower');
  }

</script>

<div class="clock-wrap" aria-label={$t('combat.towerControl')}>
  <svg class="clock" viewBox="0 0 120 124" role="img" aria-label={$t('combat.climate')}>
    <!-- Bow and crown of the pocket watch. -->
    <circle cx="60" cy="9" r="8" fill="none" stroke="#1b1410" stroke-width="8.5" />
    <circle cx="60" cy="9" r="8" fill="none" stroke="#e8b030" stroke-width="4" />
    <rect x="51" y="13" width="18" height="10" rx="3" fill="#c98f1e" stroke="#1b1410" stroke-width="3" />
    <rect x="97" y="40" width="9" height="12" rx="3" fill="#c98f1e" stroke="#1b1410" stroke-width="3" transform="rotate(38 101 46)" />
    <rect x="14" y="40" width="9" height="12" rx="3" fill="#c98f1e" stroke="#1b1410" stroke-width="3" transform="rotate(-38 18 46)" />

    <!-- Brass case. -->
    <circle cx="60" cy="68" r="52" fill="#e8b030" stroke="#1b1410" stroke-width="4.5" />
    <path d="M14 56 A48 48 0 0 1 70 18" fill="none" stroke="#ffe8a0" stroke-width="5" stroke-linecap="round" opacity="0.9" />
    <path d="M104 84 A48 48 0 0 1 56 114" fill="none" stroke="#a8751a" stroke-width="5" stroke-linecap="round" opacity="0.8" />
    <circle cx="60" cy="68" r="42" fill="#b9831e" stroke="#1b1410" stroke-width="3.2" />
    <circle cx="60" cy="68" r="38" fill="#fff6de" stroke="#1b1410" stroke-width="2.6" />

    <!-- Climate scale: frost half tinted blue, sun half tinted warm. -->
    <path d="M60 68 L60 30 A38 38 0 0 0 22 68 Z" fill="#d6ecff" opacity="0.8" />
    <path d="M60 68 L60 30 A38 38 0 0 1 98 68 Z" fill="#ffe3bf" opacity="0.8" />
    <circle cx="60" cy="68" r="38" fill="none" stroke="#1b1410" stroke-width="2.6" />

    {#each TICKS as tick, index (index)}
      <line
        x1={tick.x1}
        y1={tick.y1 + 8}
        x2={tick.x2}
        y2={tick.y2 + 8}
        stroke="#1b1410"
        stroke-width={tick.major ? 3 : 1.8}
        stroke-linecap="round"
      />
    {/each}

    <!-- Snowflake (left) and sun (right). -->
    <g transform="translate(34 70)" stroke="#1b1410" stroke-width="1.6" stroke-linecap="round" fill="none">
      <path d="M0 -8 V8 M-7 -4 L7 4 M-7 4 L7 -4" stroke="#2f7fd8" stroke-width="2.6" />
      <circle r="1.8" fill="#2f7fd8" stroke="none" />
    </g>
    <g transform="translate(86 70)">
      <circle r="5" fill="#ffb21f" stroke="#1b1410" stroke-width="1.8" />
      <path d="M0 -9 V-7 M0 7 V9 M-9 0 H-7 M7 0 H9 M-6.4 -6.4 L-5 -5 M5 5 L6.4 6.4 M-6.4 6.4 L-5 5 M5 -5 L6.4 -6.4" stroke="#1b1410" stroke-width="1.8" stroke-linecap="round" />
    </g>

    <!-- Needle. -->
    <g class="clock-needle" style={`transform:rotate(${needleAngle}deg);transform-origin:60px 76px`}>
      <path d="M60 80 L55.5 76 L60 40 L64.5 76 Z" fill="#e8353f" stroke="#1b1410" stroke-width="2.4" stroke-linejoin="round" />
      <path d="M60 88 V80" stroke="#1b1410" stroke-width="4" stroke-linecap="round" />
    </g>
    <circle cx="60" cy="76" r="5.2" fill="#e8b030" stroke="#1b1410" stroke-width="2.6" />
    <circle cx="58.6" cy="74.6" r="1.4" fill="#fff4c4" />

    <!-- Glass glint. -->
    <path d="M30 52 A34 34 0 0 1 52 36" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" opacity="0.75" />
  </svg>

  <div class="tower-row">
    {#each TOWERS as tower, index (tower.letter)}
      {@const owner = owners[index] ?? 0}
      {@const progress = progresses[index] ?? 0}
      <div
        class={`tower-badge ${ownerClass(owner)}`}
        class:is-contested={contested[index] ?? false}
        class:is-pushed={pushed[index] ?? false}
        title={$t('hud.towerTitle', { letter: tower.letter, name: $t(tower.nameKey), owner: ownerLabel(owner) })}
      >
        <i class="tower-cord" aria-hidden="true"></i>
        <svg class="tower-ring" viewBox="0 0 40 40" aria-hidden="true">
          {#if progress > 0 && progress < 1}
            <circle cx="20" cy="20" r={RING_RADIUS} fill="none" stroke="#1b1410" stroke-width="6.5" />
            <circle
              class="tower-ring-progress"
              cx="20"
              cy="20"
              r={RING_RADIUS}
              fill="none"
              stroke-width="3.6"
              stroke-linecap="round"
              stroke-dasharray={`${RING_LENGTH * progress} ${RING_LENGTH}`}
              transform="rotate(-90 20 20)"
              style={`stroke:${ringColors[index] ?? '#ffffff'}`}
            />
          {/if}
        </svg>
        <span class="tower-letter">{tower.letter}</span>
      </div>
    {/each}
  </div>
  {#if $conquest.synced && $conquest.phase === 'live'}
    <span class="round-clock" class:is-late={clockSeconds <= 60} title={$t('conquest.round.timeLeft')}>{roundClock}</span>
  {/if}
</div>
