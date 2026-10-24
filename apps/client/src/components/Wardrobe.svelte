<script lang="ts">
  import {
    BACK_IDS,
    BACK_PALETTES,
    CLASS_IDS,
    CLASS_STATS,
    FACE_IDS,
    FACE_PALETTES,
    FACTION_THEME,
    FEET_IDS,
    FEET_PALETTES,
    GIMMICK_WEAPON_IDS,
    HAIR_COLORS,
    HAIR_STYLE_IDS,
    HANDS_IDS,
    HANDS_PALETTES,
    HEADGEAR_IDS,
    HEADGEAR_PALETTES,
    LEGS_IDS,
    LEGS_PALETTES,
    PRIMARY_WEAPON_IDS,
    SECONDARY_WEAPON_IDS,
    SKIN_TONES,
    TORSO_IDS,
    TORSO_PALETTES,
    type BackId,
    type FaceId,
    type Faction,
    type FeetId,
    type GimmickWeaponId,
    type HandsId,
    type HeadgearId,
    type LegsId,
    type MainWeaponId,
    type TorsoId,
  } from '@frost-and-flamingos/shared';
  import { audio } from '../audio/synth';
  import {
    randomizeProfile,
    resetProfile,
    setBack,
    setBodyType,
    setClass,
    setDisplayName,
    setFace,
    setFaction,
    setFeet,
    setGimmick,
    setHairColor,
    setHairStyle,
    setHands,
    setHeadgear,
    setLegs,
    setPrimary,
    setSecondary,
    setSkinTone,
    setTorso,
    setVoicePitch,
    profile,
  } from '../state/profile';
  import { wardrobeEffect, wardrobeSpin, type WardrobeEffect } from '../state/game';
  import { t } from '../state/locale';
  import {
    classRoleKey,
    cosmeticNameKey,
    factionClassNameKey,
    factionMottoKey,
    factionShortKey,
    hairStyleNameKey,
    weaponNameKey,
    weaponRoleKey,
  } from '../state/labels';
  import SlotCarousel from './SlotCarousel.svelte';

  export let onClose: () => void;

  const FACTIONS: readonly Faction[] = ['alpine', 'lagoon'];
  const effects: Array<{ id: WardrobeEffect; key: 'wardrobe.effectNone' | 'wardrobe.effectDamaged' | 'wardrobe.effectCharred' | 'wardrobe.effectFrozen' }> = [
    { id: 'none', key: 'wardrobe.effectNone' },
    { id: 'damaged', key: 'wardrobe.effectDamaged' },
    { id: 'charred', key: 'wardrobe.effectCharred' },
    { id: 'frozen', key: 'wardrobe.effectFrozen' },
  ];

  $: cosmetics = $profile.cosmetics;
  $: hairIndex = cosmetics.hairStyleIndex;
  $: bodyPercent = Math.round(cosmetics.bodyType * 100);
  $: voicePercent = Math.round(((cosmetics.voicePitch - 0.8) / 0.45) * 100);

  function chooseClass(classId: (typeof CLASS_IDS)[number]): void {
    if (classId === cosmetics.classId) return;
    setClass(classId);
    audio.playUi('equip');
  }

  function chooseFaction(faction: Faction): void {
    if (faction === $profile.faction) return;
    setFaction(faction);
    audio.playUi('confirm');
  }

  function cycleHair(direction: number): void {
    setHairStyle((hairIndex + direction + HAIR_STYLE_IDS.length) % HAIR_STYLE_IDS.length);
    audio.playUi('tick');
  }

  function previewVoice(): void {
    audio.previewVoice(cosmetics.voicePitch, $profile.faction);
  }

  function setEffect(effect: WardrobeEffect): void {
    wardrobeEffect.set(effect);
    audio.playUi('equip');
  }

  function shuffle(): void {
    randomizeProfile();
    audio.playUi('shuffle');
  }

  function reset(): void {
    resetProfile();
    audio.playUi('reset');
  }

  function close(): void {
    audio.playUi('back');
    onClose();
  }
</script>

<div class="wardrobe-screen" data-custom-sound>
  <div class="wardrobe-scrim"></div>
  <div class="wardrobe-layout">
    <section class="wardrobe-stage" aria-label={$t('wardrobe.preview')}>
      <div class="wardrobe-stage-copy">
        <span class="eyebrow">{$t('wardrobe.eyebrow')}</span>
        <h1 class="cover-title wardrobe-title">{$t('wardrobe.title')}</h1>
        <p class="wardrobe-stage-lead">{$t('wardrobe.subtitle')}</p>
        <div class="wardrobe-stage-badges">
          <span class="hud-chip">{$t('wardrobe.saved')}</span>
          <span class="hud-chip">{$t('wardrobe.synced')}</span>
        </div>
      </div>
      <div class="wardrobe-stage-hint">
        <span class="hud-chip">{$t('wardrobe.previewHint')}</span>
      </div>
    </section>

    <aside class="wardrobe-panel glass-strong">
      <header class="wardrobe-panel-header">
        <div>
          <span class="eyebrow">{$t('wardrobe.identity')}</span>
          <h2>{$t('wardrobe.title')}</h2>
        </div>
        <button class="icon-btn" type="button" aria-label={$t('wardrobe.close')} on:click={close}>×</button>
      </header>

      <label class="field-label" for="wardrobe-name">{$t('wardrobe.displayName')}</label>
      <input
        id="wardrobe-name"
        class="text-input"
        type="text"
        maxlength="20"
        value={$profile.displayName}
        on:input={(event) => setDisplayName(event.currentTarget.value)}
      />
      <p class="field-hint">{$t('wardrobe.displayNameHint')}</p>

      <div class="section-heading">
        <span>{$t('wardrobe.faction')}</span>
        <small>{$t('wardrobe.factionHint')}</small>
      </div>
      <div class="faction-grid">
        {#each FACTIONS as faction (faction)}
          <button
            class="faction-card"
            type="button"
            aria-pressed={$profile.faction === faction}
            style={`--faction:${FACTION_THEME[faction].secondaryHex};--faction-accent:${FACTION_THEME[faction].accentHex}`}
            on:click={() => chooseFaction(faction)}
          >
            <strong>{$t(factionShortKey(faction))}</strong>
            <span>{$t(factionMottoKey(faction))}</span>
          </button>
        {/each}
      </div>

      <div class="section-heading">
        <span>{$t('wardrobe.class')}</span>
        <small>{$t('wardrobe.classHint')}</small>
      </div>
      <div class="class-grid">
        {#each CLASS_IDS as classId (classId)}
          <button
            class="class-card"
            type="button"
            aria-pressed={cosmetics.classId === classId}
            on:click={() => chooseClass(classId)}
          >
            <strong>{$t(factionClassNameKey($profile.faction, classId))}</strong>
            <span>{$t(classRoleKey(classId))}</span>
            <small class="mono">{$t('hud.health')} {CLASS_STATS[classId].maxHp} · {$t('hud.meters', { value: CLASS_STATS[classId].moveSpeed.toFixed(1) })}</small>
          </button>
        {/each}
      </div>

      <div class="hairline"></div>

      <div class="section-heading">
        <span>{$t('wardrobe.appearance')}</span>
        <small>{$t('wardrobe.bodyTypeHint')}</small>
      </div>

      <label class="range-field" for="wardrobe-body">
        <span>{$t('wardrobe.bodyType')}</span>
        <strong class="mono">{bodyPercent}%</strong>
      </label>
      <input
        id="wardrobe-body"
        class="range-input"
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={cosmetics.bodyType}
        on:input={(event) => setBodyType(Number(event.currentTarget.value))}
      />

      <div class="swatch-block">
        <span class="field-label">{$t('wardrobe.skinTone')}</span>
        <div class="swatch-grid skin-grid">
          {#each SKIN_TONES as tone, index (tone)}
            <button
              class="swatch"
              type="button"
              aria-label={$t('wardrobe.skinTone')}
              aria-pressed={cosmetics.skinToneIndex === index}
              style={`background:${tone}`}
              on:click={() => { setSkinTone(index); audio.playUi('tick'); }}
            ></button>
          {/each}
        </div>
      </div>

      <div class="swatch-block">
        <span class="field-label">{$t('wardrobe.hairColor')}</span>
        <div class="swatch-grid">
          {#each HAIR_COLORS as colour, index (colour)}
            <button
              class="swatch"
              type="button"
              aria-label={$t('wardrobe.hairColor')}
              aria-pressed={cosmetics.hairColorIndex === index}
              style={`background:${colour}`}
              on:click={() => { setHairColor(index); audio.playUi('tick'); }}
            ></button>
          {/each}
        </div>
      </div>

      <div class="slot-row">
        <div class="slot-label"><span>{$t('wardrobe.hairStyle')}</span></div>
        <div class="slot-control">
          <button class="slot-arrow" type="button" aria-label={$t('wardrobe.previous')} on:click={() => cycleHair(-1)}>‹</button>
          <span class="slot-value">{$t(hairStyleNameKey(hairIndex))}</span>
          <button class="slot-arrow" type="button" aria-label={$t('wardrobe.next')} on:click={() => cycleHair(1)}>›</button>
        </div>
        <span class="slot-count mono">{$t('wardrobe.itemCount', { index: hairIndex + 1, count: HAIR_STYLE_IDS.length })}</span>
      </div>

      <label class="range-field" for="wardrobe-voice">
        <span>{$t('wardrobe.voice')}</span>
        <strong class="mono">{voicePercent}%</strong>
      </label>
      <div class="voice-row">
        <input
          id="wardrobe-voice"
          class="range-input"
          type="range"
          min="0.8"
          max="1.25"
          step="0.01"
          value={cosmetics.voicePitch}
          on:input={(event) => setVoicePitch(Number(event.currentTarget.value))}
        />
        <button class="btn-ghost" type="button" on:click={previewVoice}>
          {$t('wardrobe.voicePreview')}
        </button>
      </div>
      <p class="field-hint">{$t('wardrobe.voiceHint')}</p>

      <div class="hairline"></div>

      <div class="section-heading">
        <span>{$t('wardrobe.slots')}</span>
        <small>{$t('wardrobe.slotsHint')}</small>
      </div>

      <SlotCarousel
        label={$t('wardrobe.headgear')}
        ids={HEADGEAR_IDS}
        value={cosmetics.headgear}
        onChange={(value) => setHeadgear(value as HeadgearId)}
        nameKey={(value) => cosmeticNameKey('headgear', value as HeadgearId)}
        swatch={(value) => HEADGEAR_PALETTES[value as HeadgearId].primary}
      />
      <SlotCarousel
        label={$t('wardrobe.face')}
        ids={FACE_IDS}
        value={cosmetics.face}
        onChange={(value) => setFace(value as FaceId)}
        nameKey={(value) => cosmeticNameKey('face', value as FaceId)}
        swatch={(value) => FACE_PALETTES[value as FaceId].primary}
      />
      <SlotCarousel
        label={$t('wardrobe.torso')}
        ids={TORSO_IDS}
        value={cosmetics.torso}
        onChange={(value) => setTorso(value as TorsoId)}
        nameKey={(value) => cosmeticNameKey('torso', value as TorsoId)}
        swatch={(value) => TORSO_PALETTES[value as TorsoId].primary}
      />
      <SlotCarousel
        label={$t('wardrobe.back')}
        ids={BACK_IDS}
        value={cosmetics.back}
        onChange={(value) => setBack(value as BackId)}
        nameKey={(value) => cosmeticNameKey('back', value as BackId)}
        swatch={(value) => BACK_PALETTES[value as BackId].primary}
      />
      <SlotCarousel
        label={$t('wardrobe.hands')}
        ids={HANDS_IDS}
        value={cosmetics.hands}
        onChange={(value) => setHands(value as HandsId)}
        nameKey={(value) => cosmeticNameKey('hands', value as HandsId)}
        swatch={(value) => HANDS_PALETTES[value as HandsId].primary}
      />
      <SlotCarousel
        label={$t('wardrobe.legs')}
        ids={LEGS_IDS}
        value={cosmetics.legs}
        onChange={(value) => setLegs(value as LegsId)}
        nameKey={(value) => cosmeticNameKey('legs', value as LegsId)}
        swatch={(value) => LEGS_PALETTES[value as LegsId].primary}
      />
      <SlotCarousel
        label={$t('wardrobe.feet')}
        ids={FEET_IDS}
        value={cosmetics.feet}
        onChange={(value) => setFeet(value as FeetId)}
        nameKey={(value) => cosmeticNameKey('feet', value as FeetId)}
        swatch={(value) => FEET_PALETTES[value as FeetId].primary}
      />

      <div class="hairline"></div>

      <div class="section-heading">
        <span>{$t('wardrobe.loadout')}</span>
        <small>{$t('wardrobe.loadoutHint')}</small>
      </div>

      <label class="field-label" for="wardrobe-primary">{$t('wardrobe.primary')}</label>
      <select
        id="wardrobe-primary"
        class="select-input"
        value={$profile.loadout.primary}
        on:change={(event) => setPrimary(event.currentTarget.value as MainWeaponId)}
      >
        {#each PRIMARY_WEAPON_IDS as weapon (weapon)}
          <option value={weapon}>{$t(weaponNameKey('primary', weapon))} · {$t(weaponRoleKey('primary', weapon))}</option>
        {/each}
      </select>

      <label class="field-label" for="wardrobe-secondary">{$t('wardrobe.secondary')}</label>
      <select
        id="wardrobe-secondary"
        class="select-input"
        value={$profile.loadout.secondary}
        on:change={(event) => setSecondary(event.currentTarget.value as MainWeaponId)}
      >
        {#each SECONDARY_WEAPON_IDS as weapon (weapon)}
          <option value={weapon}>{$t(weaponNameKey('secondary', weapon))} · {$t(weaponRoleKey('secondary', weapon))}</option>
        {/each}
      </select>

      <label class="field-label" for="wardrobe-gimmick">{$t('wardrobe.gimmick')}</label>
      <select
        id="wardrobe-gimmick"
        class="select-input"
        value={$profile.loadout.gimmick}
        on:change={(event) => setGimmick(event.currentTarget.value as GimmickWeaponId)}
      >
        {#each GIMMICK_WEAPON_IDS as weapon (weapon)}
          <option value={weapon}>{$t(weaponNameKey('gimmick', weapon))} · {$t(weaponRoleKey('gimmick', weapon))}</option>
        {/each}
      </select>

      <div class="hairline"></div>

      <div class="section-heading">
        <span>{$t('wardrobe.preview')}</span>
        <small>{$t('wardrobe.previewHint')}</small>
      </div>

      <div class="preview-controls">
        <button class="btn-ghost" type="button" aria-pressed={$wardrobeSpin} on:click={() => { wardrobeSpin.update((value) => !value); audio.playUi('tick'); }}>
          {$t('wardrobe.spin')}: {$wardrobeSpin ? $t('common.on') : $t('common.off')}
        </button>
      </div>

      <div class="effect-grid">
        {#each effects as effect (effect.id)}
          <button
            class="btn-ghost"
            type="button"
            aria-pressed={$wardrobeEffect === effect.id}
            on:click={() => setEffect(effect.id)}
          >
            {$t(effect.key)}
          </button>
        {/each}
      </div>

      <div class="wardrobe-actions">
        <button class="btn-primary" type="button" on:click={shuffle}>{$t('wardrobe.randomize')}</button>
        <button class="btn-ghost" type="button" on:click={reset}>{$t('wardrobe.reset')}</button>
        <button class="btn-ghost" type="button" on:click={close}>{$t('wardrobe.close')}</button>
      </div>

      <p class="wardrobe-footnote">{$t('wardrobe.saved')} · {$t('wardrobe.synced')}</p>
    </aside>
  </div>
</div>
