<script lang="ts">
  import type { AudioVolumes } from '../audio/synth';
  import { audio } from '../audio/synth';
  import { audioVolumes, resetVolumes, setVolume } from '../state/audio';
  import { t } from '../state/locale';

  interface Channel {
    key: keyof AudioVolumes;
    labelKey: 'audio.master' | 'audio.sfx' | 'audio.music' | 'audio.voice';
  }

  const channels: Channel[] = [
    { key: 'master', labelKey: 'audio.master' },
    { key: 'sfx', labelKey: 'audio.sfx' },
    { key: 'music', labelKey: 'audio.music' },
    { key: 'voice', labelKey: 'audio.voice' },
  ];

  function update(key: keyof AudioVolumes, value: string): void {
    setVolume(key, Number(value));
  }

  function reset(): void {
    resetVolumes();
    audio.playUi('reset');
  }
</script>

<div class="audio-settings" data-custom-sound>
  <div class="section-heading">
    <span>{$t('audio.title')}</span>
    <small>{$t('audio.subtitle')}</small>
  </div>

  {#each channels as channel (channel.key)}
    <label class="range-field" for={`audio-${channel.key}`}>
      <span>{$t(channel.labelKey)}</span>
      <strong class="mono">{Math.round($audioVolumes[channel.key] * 100)}%</strong>
    </label>
    <input
      id={`audio-${channel.key}`}
      class="range-input"
      type="range"
      min="0"
      max="1"
      step="0.01"
      value={$audioVolumes[channel.key]}
      on:input={(event) => update(channel.key, event.currentTarget.value)}
    />
  {/each}

  <div class="audio-actions">
    <button class="btn-ghost" type="button" on:click={reset}>{$t('common.reset')}</button>
    <span class="field-hint">{$t('audio.hint')}</span>
  </div>
</div>
