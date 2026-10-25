<script lang="ts">
  import { ParachuteState } from '@frost-and-flamingos/shared';
  import { spawnProtected } from '../../state/conquest';
  import { connection, damageFlash, localPlayer } from '../../state/game';
  import { t } from '../../state/locale';

  $: player = $localPlayer;
  $: faction = player?.faction ?? 'alpine';
  $: maxHp = Math.max(1, player?.maxHp ?? 100);
  $: hp = Math.max(0, player?.hp ?? maxHp);
  $: healthPercent = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  $: shieldPercent = Math.max(0, Math.min(100, ((player?.shield ?? 0) / maxHp) * 100));
  $: lowHealth = !!player && player.alive && healthPercent <= 30;
  $: hit = Math.max(0, Math.min(1, $damageFlash));
  $: balance = Math.max(-1, Math.min(1, $connection.weatherBalance));
  // Like the painted strip, the climate bar fills out from the Beach badge: empty at full
  // frost, half at a balanced climate, full when the sun has won.
  $: climateWidth = (balance + 1) * 50;
  $: climatePercent = Math.abs(Math.round(balance * 100));
  $: climateValue =
    climatePercent === 0
      ? `${$t('hud.climateFrost')} = ${$t('hud.climateSun')}`
      : `${$t(balance < 0 ? 'hud.climateFrost' : 'hud.climateSun')} ${climatePercent}%`;
  $: climateText = $t('hud.climateTitle', { value: climateValue });
  $: sunny = balance > 0.12;
  $: alpsLabel = `${$t('hud.ticketsAlps')}: ${$connection.ticketsAlpine}`;
  $: beachLabel = `${$t('hud.ticketsBeach')}: ${$connection.ticketsLagoon}`;
  $: parachuteOpen =
    player?.parachuteState === ParachuteState.Intact ||
    player?.parachuteState === ParachuteState.Tattered;
</script>

<div class="status-wrap" class:is-low={lowHealth} style={`--hit:${hit}`}>
  <div class="status-tags">
    {#if $spawnProtected && player?.alive}<span class="status-tag is-protected">{$t('combat.protected')}</span>{/if}
    {#if player?.cloaked}<span class="status-tag is-accent">{$t('combat.cloaked')}</span>{/if}
    {#if parachuteOpen}<span class="status-tag is-accent">{$t('hud.parachute')}</span>{/if}
    {#if player?.swimming}<span class="status-tag">{$t('hud.swimming')}</span>{/if}
    {#if player?.sprinting}<span class="status-tag">{$t('hud.sprinting')}</span>{/if}
    {#if player?.crouched}<span class="status-tag">{$t('hud.crouched')}</span>{/if}
  </div>

  <div class="status-bar">
    <!-- Heart + vitality bar. -->
    <div class="sb-heart" aria-hidden="true">
      <svg viewBox="0 0 48 44" focusable="false">
        <path
          d="M24 41 C8 30 3 22 3 14 C3 7 8.5 3 14 3 C18.5 3 22 5.5 24 9.5 C26 5.5 29.5 3 34 3 C39.5 3 45 7 45 14 C45 22 40 30 24 41 Z"
          fill="#e8353f"
          stroke="#1b1410"
          stroke-width="3.4"
          stroke-linejoin="round"
        />
        <path d="M11 11 Q13 8 17 8.5" fill="none" stroke="#ffb3b3" stroke-width="3" stroke-linecap="round" />
      </svg>
    </div>
    <div
      class="sb-bar sb-hp"
      role="meter"
      aria-label={$t('hud.health')}
      aria-valuemin="0"
      aria-valuemax={Math.round(maxHp)}
      aria-valuenow={Math.round(hp)}
    >
      <div class="sb-ghost" style={`width:${healthPercent}%`}></div>
      <div class="sb-fill sb-fill-hp" style={`width:${healthPercent}%`}></div>
      {#if shieldPercent > 0}
        <div class="sb-shield" style={`width:${shieldPercent}%`} title={$t('combat.shield')}></div>
      {/if}
      <span class="sb-shine"></span>
    </div>

    <!-- Tickets: Alps vs Beach, two plain badges. A small caret marks the player's side. -->
    <div
      class="sb-ticket is-alps"
      class:is-mine={faction === 'alpine'}
      class:is-long={$connection.ticketsAlpine >= 100}
      role="group"
      title={$t('hud.ticketsAlps')}
      aria-label={alpsLabel}
    >
      <strong>{$connection.ticketsAlpine}</strong>
      {#if faction === 'alpine'}<i class="sb-you" title={$t('hud.yourTeam')}></i>{/if}
    </div>
    <span class="sb-vs">{$t('hud.versus')}</span>
    <div
      class="sb-ticket is-beach"
      class:is-mine={faction === 'lagoon'}
      class:is-long={$connection.ticketsLagoon >= 100}
      role="group"
      title={$t('hud.ticketsBeach')}
      aria-label={beachLabel}
    >
      <strong>{$connection.ticketsLagoon}</strong>
      {#if faction === 'lagoon'}<i class="sb-you" title={$t('hud.yourTeam')}></i>{/if}
    </div>

    <!-- Climate balance: snow on the left, sun on the right. -->
    <div
      class="sb-bar sb-climate"
      role="meter"
      title={climateText}
      aria-label={$t('combat.climate')}
      aria-valuemin="-100"
      aria-valuemax="100"
      aria-valuenow={Math.round(balance * 100)}
      aria-valuetext={climateText}
    >
      <div class="sb-fill sb-fill-climate" style={`left:0;width:${climateWidth}%`}></div>
      <span class="sb-shine"></span>
    </div>
    <div class="sb-star" class:is-sun={sunny} aria-hidden="true">
      <svg viewBox="0 0 48 48" focusable="false">
        <path
          d="M24 3 L30 17 L45 18 L33.5 28 L37 43 L24 35 L11 43 L14.5 28 L3 18 L18 17 Z"
          stroke="#1b1410"
          stroke-width="3.2"
          stroke-linejoin="round"
        />
        {#if sunny}
          <circle cx="24" cy="25" r="5" fill="#fff4b0" stroke="#1b1410" stroke-width="1.8" />
          <path d="M24 15 V17 M24 33 V35 M14 25 H16 M32 25 H34 M17 18 L18.5 19.5 M30.5 30.5 L32 32 M17 32 L18.5 30.5 M30.5 19.5 L32 18" stroke="#1b1410" stroke-width="1.8" stroke-linecap="round" />
        {:else}
          <path d="M24 16 V34 M16.2 20.5 L31.8 29.5 M16.2 29.5 L31.8 20.5" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round" />
          <circle cx="24" cy="25" r="2.4" fill="#ffffff" />
        {/if}
      </svg>
    </div>
  </div>
</div>
