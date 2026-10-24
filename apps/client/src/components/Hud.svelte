<script lang="ts">
  import { FACTION_THEME, ParachuteState } from '@frost-and-flamingos/shared';
  import { connection, hud, localPlayer } from '../state/game';
  import { t } from '../state/locale';
  import { classRoleKey, factionClassNameKey, factionNameKey } from '../state/labels';

  $: player = $localPlayer;
  $: faction = player?.faction ?? 'alpine';
  $: classId = player?.classId ?? 'allrounder';
  $: theme = FACTION_THEME[faction];
  $: healthPercent = player ? Math.max(0, Math.min(100, (player.hp / Math.max(1, player.maxHp)) * 100)) : 100;
  $: parachuteOpen =
    player?.parachuteState === ParachuteState.Intact ||
    player?.parachuteState === ParachuteState.Tattered;
  $: statusLabel =
    $connection.status === 'connected'
      ? $t('common.connected')
      : $connection.status === 'reconnecting'
        ? $t('hud.reconnecting')
        : $connection.status === 'connecting'
          ? $t('common.connecting')
          : $t('common.offline');
</script>

<div class="hud-root" aria-live="polite">
  <div class="hud-top-left glass">
    <div class="flex items-center justify-between gap-3">
      <span class="eyebrow">{$t('hud.training')}</span>
      <span class="hud-label">{$t('hud.m2')}</span>
    </div>
    <div class="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <strong class="font-display text-xl font-black uppercase tracking-[0.02em]" style={`color: ${theme.accentHex}`}>
        {$t(factionNameKey(faction))}
      </strong>
      <span class="text-glacier-200/35">/</span>
      <span class="text-[0.78rem] font-bold text-glacier-100/80">{$t(factionClassNameKey(faction, classId))}</span>
      <span class="hud-label">{$t(classRoleKey(classId))}</span>
    </div>
    <div class="mt-3 flex items-center justify-between gap-3">
      <span class="hud-label">{$t('hud.health')}</span>
      <span class="mono text-[0.68rem] font-bold text-glacier-100/85">
        {Math.round(player?.hp ?? 0)} / {Math.round(player?.maxHp ?? 0)}
      </span>
    </div>
    <div class="health-track mt-1">
      <div class="health-fill" style={`width: ${healthPercent}%`}></div>
    </div>
  </div>

  <div class="hud-scoreboard glass">
    <div class="score-side">
      <span class="hud-label text-glacier-200">{$t('hud.scoreAlpine')}</span>
      <strong class="mono text-glacier-50">{$connection.ticketsAlpine}</strong>
    </div>
    <div class="score-divider" aria-hidden="true"></div>
    <div class="score-side score-side-right">
      <span class="hud-label text-lagoon-300">{$t('hud.scoreLagoon')}</span>
      <strong class="mono text-lagoon-300">{$connection.ticketsLagoon}</strong>
    </div>
    <span class="score-caption">{$t('hud.tickets')}</span>
  </div>

  <div class="hud-top-right">
    <span class="hud-chip">
      <span class="status-dot" data-state={$connection.status}></span>
      {statusLabel}
    </span>
    <span class="hud-chip mono">{$t('hud.ping')} {$t('hud.milliseconds', { value: $connection.pingMs })}</span>
    <span class="hud-chip mono">{$t('hud.playerCount', { count: $connection.playersOnline, max: $connection.maxPlayers })}</span>
    <span class="hud-chip mono">{$t('hud.fps')} {$hud.fps}</span>
  </div>

  <div class="hud-bottom-left">
    <span class="hud-chip">
      <span class="hud-label">{$t('hud.zone')}</span>
      {#if player}
        {$t(player.zoneKey)}
      {:else}
        {$t('hud.waitingForServer')}
      {/if}
    </span>
    <span class="hud-chip mono">{$t('hud.engine')}: {$hud.engine === 'webgpu' ? $t('hud.webgpu') : $t('hud.webgl2')}</span>
    {#if parachuteOpen}
      <span class="hud-chip hud-chip-accent">
        {$t('hud.parachute')}: {$t('hud.parachuteOpen')}
      </span>
    {/if}
    {#if player?.crouched}
      <span class="hud-chip">{$t('hud.crouched')}</span>
    {/if}
    {#if player?.swimming}
      <span class="hud-chip">{$t('hud.swimming')}</span>
    {/if}
    {#if player?.sprinting}
      <span class="hud-chip">{$t('hud.sprinting')}</span>
    {/if}
    {#if player?.rolling}
      <span class="hud-chip">{$t('hud.rolling')}</span>
    {/if}
  </div>

  <div class="hud-bottom-center hud-chip">
    <span class="hud-label">{$t('controls.keyHint')}</span>
    {$t('hud.controlsHint')}
  </div>

  <div class="hud-bottom-right hud-chip text-right">
    {$t('hud.noCombat')}
  </div>

  <div class="crosshair" aria-hidden="true"></div>
</div>
