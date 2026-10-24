<script lang="ts">
  import {
    FACTION_THEME,
    ParachuteState,
    WEAPON_STATS,
    skillsForClass,
    weaponSlotForId,
    type TranslationKey,
  } from '@frost-and-flamingos/shared';
  import {
    comicPop,
    connection,
    damageFlash,
    deathState,
    hitMarker,
    hud,
    interactionPrompt,
    killFeed,
    localPlayer,
  } from '../state/game';
  import { t } from '../state/locale';
  import {
    classRoleKey,
    classNameKey,
    factionClassNameKey,
    factionNameKey,
    weaponNameKeyForSlot,
    weaponRoleKeyForSlot,
  } from '../state/labels';

  const SKILL_KEYS = ['Q', 'E', 'T'] as const;
  const SLOT_KEYS = ['1', '2', '3'] as const;

  $: player = $localPlayer;
  $: faction = player?.faction ?? 'alpine';
  $: classId = player?.classId ?? 'allrounder';
  $: theme = FACTION_THEME[faction];
  $: healthPercent = player
    ? Math.max(0, Math.min(100, (player.hp / Math.max(1, player.maxHp)) * 100))
    : 100;
  $: shieldPercent = player
    ? Math.max(0, Math.min(100, (player.shield / Math.max(1, player.maxHp)) * 100))
    : 0;
  $: speed = player ? Math.hypot(player.velocity.x, player.velocity.z) : 0;
  $: weapon = player ? WEAPON_STATS[player.weaponId] : WEAPON_STATS.smg;
  $: crosshairGap = Math.round(
    5 + weapon.spread * 640 + Math.min(8, speed * 0.55) + (player?.grounded ? 0 : 3),
  );
  $: skills = player ? skillsForClass(player.classId) : skillsForClass('allrounder');
  $: weaponIds = player?.weaponIds ?? (['smg', 'shotgun', 'snow_cannon'] as const);
  $: death = $deathState;
  $: dead = death !== null;
  $: lowHealth = !!player && player.alive && healthPercent <= 30;
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
  $: towerOwners = [0, 1, 2].map((index) => (($connection.towerStates >> (index * 2)) & 3));
  $: weatherPercent = Math.max(-1, Math.min(1, $connection.weatherBalance));
  $: weatherMarker = 50 + weatherPercent * 46;
  $: deathProgress = death
    ? Math.max(0, Math.min(1, death.respawnSeconds / 10))
    : 0;
  $: killerHealthPercent = death
    ? Math.max(0, Math.min(100, (death.killerHp / Math.max(1, death.killerMaxHp)) * 100))
    : 0;

  function ammoForSlot(slot: number): { ammo: number; reserve: number } {
    if (!player || player.weaponSlot !== slot) return { ammo: -1, reserve: -1 };
    return { ammo: player.ammo, reserve: player.reserve };
  }

  function cooldownFor(index: number): number {
    return player?.skillCooldowns[index] ?? 0;
  }

  function cooldownPercent(index: number): number {
    const skill = skills[index];
    if (!skill || skill.cooldownSeconds <= 0) return 0;
    return Math.max(0, Math.min(100, (cooldownFor(index) / skill.cooldownSeconds) * 100));
  }

  function weaponLabel(weaponId: Parameters<typeof weaponSlotForId>[0]): TranslationKey {
    return weaponNameKeyForSlot(weaponSlotForId(weaponId), weaponId);
  }

  function weaponRole(weaponId: Parameters<typeof weaponSlotForId>[0]): TranslationKey {
    return weaponRoleKeyForSlot(weaponSlotForId(weaponId), weaponId);
  }

  function towerClass(owner: number): string {
    if (owner === 1) return 'is-alpine';
    if (owner === 2) return 'is-lagoon';
    return 'is-neutral';
  }
</script>

<div class="hud-root" class:is-dead={dead} aria-live="polite">
  <div
    class="hud-vignette hud-vignette-damage"
    style={`opacity:${Math.min(1, $damageFlash * 0.9)}`}
    aria-hidden="true"
  ></div>
  <div class="hud-vignette hud-vignette-low" class:is-active={lowHealth} aria-hidden="true"></div>
  <div class="hud-vignette hud-vignette-death" class:is-active={dead} aria-hidden="true"></div>

  <!-- Top centre: tickets, tower pips and the climate balance. -->
  <header class="hud-combat-header">
    <div class="hud-ticket hud-ticket-alpine">
      <span class="hud-ticket-label">{$t('hud.scoreAlpine')}</span>
      <strong class="mono">{$connection.ticketsAlpine}</strong>
    </div>
    <div class="hud-header-centre">
      <div class="hud-tower-row" aria-label={$t('combat.towerControl')}>
        {#each towerOwners as owner, index (index)}
          <span class={`hud-tower-pip ${towerClass(owner)}`}>
            <span class="hud-tower-index">{String.fromCharCode(65 + index)}</span>
          </span>
        {/each}
        <span class="hud-tower-caption">{$t('combat.towerControl')}</span>
      </div>
      <div class="hud-climate">
        <span class="hud-climate-icon is-frost" aria-hidden="true">❄</span>
        <div class="hud-climate-track">
          <span class="hud-climate-mid" aria-hidden="true"></span>
          <span class="hud-climate-marker" style={`left:${weatherMarker}%`}></span>
        </div>
        <span class="hud-climate-icon is-sun" aria-hidden="true">☀</span>
      </div>
      <span class="hud-header-caption">{$t('combat.climate')}</span>
    </div>
    <div class="hud-ticket hud-ticket-lagoon">
      <span class="hud-ticket-label">{$t('hud.scoreLagoon')}</span>
      <strong class="mono">{$connection.ticketsLagoon}</strong>
    </div>
  </header>

  <!-- Top left: faction, class and location. -->
  <section class="hud-identity glass">
    <div class="hud-identity-head">
      <span class="eyebrow">{$t('combat.liveRound')}</span>
      <span class="hud-chip hud-chip-tiny">
        <span class="status-dot" data-state={$connection.status}></span>
        {statusLabel}
      </span>
    </div>
    <div class="hud-identity-title">
      <strong class="font-display" style={`color:${theme.accentHex}`}>{$t(factionNameKey(faction))}</strong>
      <span class="hud-identity-slash">/</span>
      <span>{$t(factionClassNameKey(faction, classId))}</span>
      <span class="hud-label">{$t(classRoleKey(classId))}</span>
    </div>
    <div class="hud-identity-meta">
      <span class="hud-chip">{$t('hud.zone')}: {player ? $t(player.zoneKey) : $t('hud.waitingForServer')}</span>
      <span class="hud-chip mono">{$t('hud.fps')} {$hud.fps}</span>
      <span class="hud-chip mono">{$t('hud.ping')} {$t('hud.milliseconds', { value: $connection.pingMs })}</span>
    </div>
  </section>

  <!-- Top right: kill feed. -->
  <aside class="hud-kill-feed" aria-label={$t('combat.killFeed')}>
    {#each $killFeed as entry (entry.id)}
      <div class="hud-kill-entry">
        <span class="hud-kill-name is-killer">{entry.killerName || '—'}</span>
        <span class="hud-kill-weapon" title={$t(weaponLabel(entry.weaponId ?? 'knife'))}>
          {entry.weaponId ? $t(weaponLabel(entry.weaponId)) : '—'}
          {#if entry.headshot}<em>{$t('combat.headshot')}</em>{/if}
        </span>
        <span class="hud-kill-name is-victim">{entry.victimName}</span>
      </div>
    {/each}
  </aside>

  <!-- Centre: adaptive crosshair, hit marker and comic pop. -->
  {#if !dead}
    <div
      class="hud-crosshair"
      class:is-reloading={player?.reloading}
      style={`--gap:${crosshairGap}px`}
      aria-hidden="true"
    >
      <span class="hud-crosshair-dot"></span>
      <span class="hud-crosshair-line is-top"></span>
      <span class="hud-crosshair-line is-right"></span>
      <span class="hud-crosshair-line is-bottom"></span>
      <span class="hud-crosshair-line is-left"></span>
    </div>
    {#if $hitMarker}
      {#key $hitMarker.id}
        <div class="hud-hit-marker" class:is-headshot={$hitMarker.headshot} class:is-kill={$hitMarker.kill} aria-hidden="true">
          <span></span><span></span><span></span><span></span>
        </div>
      {/key}
    {/if}
  {/if}

  {#if $comicPop}
    {#key $comicPop.id}
      <div class="hud-comic-pop">{$t($comicPop.textKey)}</div>
    {/key}
  {/if}

  {#if $interactionPrompt}
    <div class="hud-interaction-prompt">
      <kbd>F</kbd>
      <span>{$t($interactionPrompt.key, $interactionPrompt.params)}</span>
    </div>
  {/if}

  <!-- Bottom left: vitality, shield and match stats. -->
  <section class="hud-vitality glass">
    <div class="hud-vitality-top">
      <span class="hud-label">{$t('hud.health')}</span>
      <strong class="mono">{Math.round(player?.hp ?? 0)}<span> / {Math.round(player?.maxHp ?? 0)}</span></strong>
    </div>
    <div class="hud-health-track">
      <div class="hud-health-fill" class:is-low={lowHealth} style={`width:${healthPercent}%`}></div>
    </div>
    {#if (player?.shield ?? 0) > 0}
      <div class="hud-shield-row">
        <span class="hud-label">{$t('combat.shield')}</span>
        <strong class="mono">{Math.round(player?.shield ?? 0)}</strong>
      </div>
      <div class="hud-shield-track">
        <div class="hud-shield-fill" style={`width:${shieldPercent}%`}></div>
      </div>
    {/if}
    <div class="hud-vitality-stats">
      <span><span class="hud-label">{$t('combat.kills')}</span> <strong class="mono">{player?.kills ?? 0}</strong></span>
      <span><span class="hud-label">{$t('combat.deaths')}</span> <strong class="mono">{player?.deaths ?? 0}</strong></span>
      {#if player?.cloaked}<span class="hud-chip hud-chip-accent">{$t('combat.cloaked')}</span>{/if}
      {#if player?.crouched}<span class="hud-chip">{$t('hud.crouched')}</span>{/if}
      {#if player?.swimming}<span class="hud-chip">{$t('hud.swimming')}</span>{/if}
      {#if player?.sprinting}<span class="hud-chip">{$t('hud.sprinting')}</span>{/if}
      {#if parachuteOpen}<span class="hud-chip hud-chip-accent">{$t('hud.parachute')}</span>{/if}
    </div>
  </section>

  <!-- Bottom centre: class skills. -->
  <section class="hud-skills" aria-label={$t('combat.skills')}>
    {#each skills as skill, index (skill.id)}
      <div
        class="hud-skill"
        class:is-ready={cooldownFor(index) <= 0}
        title={$t(skill.descriptionKey)}
        style={`--cooldown:${cooldownPercent(index)}%`}
      >
        <span class="hud-skill-key">{SKILL_KEYS[index]}</span>
        <span class="hud-skill-name">{$t(skill.nameKey)}</span>
        <span class="hud-skill-state mono">
          {cooldownFor(index) > 0
            ? $t('combat.cooldown', { seconds: Math.ceil(cooldownFor(index)) })
            : $t('combat.ready')}
        </span>
      </div>
    {/each}
  </section>

  <!-- Bottom right: weapon carousel and ammo. -->
  <section class="hud-weapons glass" aria-label={$t('combat.weapon')}>
    <div class="hud-weapons-head">
      <span class="hud-label">{$t('combat.weaponSlotHint')}</span>
      <span class="hud-weapons-ammo mono">
        {#if player?.reloading}
          <em>{$t('combat.reloading')}</em>
        {:else}
          {player?.ammo ?? 0}<span> / {player?.reserve ?? 0}</span>
        {/if}
      </span>
    </div>
    <div class="hud-weapon-list">
      {#each weaponIds as weaponId, index (index)}
        {@const slot = index + 1}
        {@const ammo = ammoForSlot(slot)}
        <div class="hud-weapon-slot" class:is-active={player?.weaponSlot === slot}>
          <span class="hud-weapon-key">{SLOT_KEYS[index]}</span>
          <span class="hud-weapon-info">
            <strong>{$t(weaponLabel(weaponId))}</strong>
            <small>{$t(weaponRole(weaponId))}</small>
          </span>
          <span class="hud-weapon-count mono">
            {ammo.ammo >= 0 ? ammo.ammo : '—'}
          </span>
        </div>
      {/each}
    </div>
    <div class="hud-weapons-foot">
      <span class="hud-chip mono">{$t('hud.engine')}: {$hud.engine === 'webgpu' ? $t('hud.webgpu') : $t('hud.webgl2')}</span>
      <span class="hud-chip mono">{$t('hud.playerCount', { count: $connection.playersOnline, max: $connection.maxPlayers })}</span>
    </div>
  </section>

  <div class="hud-controls-hint">
    <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> {$t('combat.weaponSlotHint')}
    <span class="hud-controls-sep">·</span>
    <kbd>Q</kbd><kbd>E</kbd><kbd>T</kbd> {$t('combat.skills')}
    <span class="hud-controls-sep">·</span>
    <kbd>R</kbd> {$t('combat.reloadShort')}
    <span class="hud-controls-sep">·</span>
    <kbd>F</kbd> {$t('combat.interactShort')}
  </div>

  {#if death}
    <div class="hud-death-screen">
      <div class="hud-death-banner glass-strong">
        <div class="hud-death-killer">
          <span class="eyebrow">{$t('combat.killerCam')}</span>
          <strong class="display">{$t('combat.eliminatedBy', { name: death.killerName || '—' })}</strong>
          <div class="hud-death-meta">
            {#if death.killerClassId}
              <span>{$t(classNameKey(death.killerClassId))}</span>
            {/if}
            {#if death.weaponId}
              <span>{$t(weaponLabel(death.weaponId))}</span>
            {/if}
            {#if death.headshot}
              <span class="hud-chip hud-chip-accent">{$t('combat.headshot')}</span>
            {/if}
          </div>
          <div class="hud-death-hp">
            <span class="hud-label">{$t('combat.killerVitality')}</span>
            <div class="hud-death-hp-track">
              <div class="hud-death-hp-fill" style={`width:${killerHealthPercent}%`}></div>
            </div>
            <strong class="mono">{Math.round(death.killerHp)} / {Math.round(death.killerMaxHp)}</strong>
          </div>
        </div>
        <div class="hud-death-timer" style={`--progress:${deathProgress * 100}%`}>
          <div class="hud-death-timer-inner">
            <strong class="mono">{Math.ceil(death.respawnSeconds)}</strong>
            <span>{$t('combat.respawnShort')}</span>
          </div>
        </div>
      </div>
      <div class="hud-death-copy">
        <strong class="display">{$t('combat.deathTitle')}</strong>
        <p>{$t('combat.deathBody')}</p>
        <span class="hud-death-tip">{$t('combat.deathTip')}</span>
        <span class="hud-death-watching">{$t('combat.watching', { name: death.killerName || '—' })}</span>
      </div>
    </div>
  {/if}
</div>
