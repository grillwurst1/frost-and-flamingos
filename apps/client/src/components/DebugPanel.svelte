<script lang="ts">
  import { connection, hud, localPlayer } from '../state/game';
  import { t } from '../state/locale';

  const yes = (value: boolean): string => $t(value ? 'debug.yes' : 'debug.no');

  function fixed(value: number, digits = 1): string {
    return Number.isFinite(value) ? value.toFixed(digits) : $t('debug.unavailable');
  }

  function vec(value: { x: number; y: number; z: number }): string {
    return `${fixed(value.x)} / ${fixed(value.y)} / ${fixed(value.z)}`;
  }

  $: engineLabel = $hud.engine === 'webgpu' ? $t('debug.webgpu') : $t('debug.webgl2');
  $: statusLabel =
    $connection.status === 'connected'
      ? $t('common.connected')
      : $connection.status === 'reconnecting'
        ? $t('hud.reconnecting')
        : $connection.status === 'connecting'
          ? $t('common.connecting')
          : $t('common.offline');
</script>

<aside class="debug-panel glass" aria-label={$t('debug.title')}>
  <header>
    <span>{$t('debug.title')}</span>
    <span class="text-glacier-200/45">{$t('debug.closeHint')}</span>
  </header>

  <div class="debug-row"><span>{$t('debug.serverLink')}</span><strong>{statusLabel}</strong></div>
  <div class="debug-row"><span>{$t('debug.engine')}</span><strong>{engineLabel}</strong></div>
  <div class="debug-row"><span>{$t('debug.resolution')}</span><strong>{$hud.resolution}</strong></div>
  <div class="debug-row"><span>{$t('debug.fps')}</span><strong>{$hud.fps}</strong></div>
  <div class="debug-row"><span>{$t('debug.frameTime')}</span><strong>{$t('hud.milliseconds', { value: fixed($hud.frameMs, 2) })}</strong></div>
  <div class="debug-row"><span>{$t('debug.drawCalls')}</span><strong>{$hud.drawCalls}</strong></div>
  <div class="debug-row"><span>{$t('debug.activeMeshes')}</span><strong>{$hud.activeMeshes}</strong></div>
  <div class="debug-row"><span>{$t('debug.tick')}</span><strong>{$connection.serverTick}</strong></div>
  <div class="debug-row"><span>{$t('debug.ping')}</span><strong>{$t('hud.milliseconds', { value: fixed($connection.pingMs, 0) })}</strong></div>
  <div class="debug-row"><span>{$t('debug.players')}</span><strong>{$connection.playersOnline} / {$connection.maxPlayers}</strong></div>
  <div class="debug-row"><span>{$t('debug.localPlayer')}</span><strong>#{$localPlayer?.id ?? '—'}</strong></div>
  <div class="debug-row"><span>{$t('debug.position')}</span><strong>{vec($hud.localPosition)}</strong></div>
  <div class="debug-row"><span>{$t('debug.velocity')}</span><strong>{vec($hud.localVelocity)}</strong></div>
  <div class="debug-row"><span>{$t('debug.grounded')}</span><strong>{yes($hud.grounded)}</strong></div>
  <div class="debug-row"><span>{$t('debug.pendingInputs')}</span><strong>{$hud.pendingInputs}</strong></div>
  <div class="debug-row"><span>{$t('debug.predictionError')}</span><strong>{$t('hud.meters', { value: fixed($hud.predictionError, 3) })}</strong></div>
  <div class="debug-row"><span>{$t('debug.lastSnapshot')}</span><strong>{$hud.lastSnapshotTick}</strong></div>
  <div class="debug-row"><span>{$t('debug.inputSequence')}</span><strong>{$hud.inputSequence}</strong></div>
</aside>
