<script lang="ts">
  import { t } from '../../state/locale';
  import { weaponNameKeyForSlot } from '../../state/labels';
  import { vehicleHud } from '../../state/vehicle';
  import Pictogram from '../icons/Pictogram.svelte';

  /** Raised above the weapon dock when the seat also uses hand weapons. */
  export let raised = false;

  $: hud = $vehicleHud;
  $: hullPercent = hud ? Math.max(0, Math.min(100, (hud.hp / Math.max(1, hud.maxHp)) * 100)) : 0;
  $: lowHull = hullPercent <= 30;
  $: weaponReady = hud ? hud.weaponReady >= 0.999 : false;
  $: boostReady = hud?.boost ? hud.boost.ready >= 0.999 : false;
</script>

{#if hud}
  <div class="vehicle-card" class:is-raised={raised} class:is-low={lowHull} class:is-first-person={hud.passengerView} aria-label={$t('vehicles.hud.card')}>
    <div class="vehicle-head">
      <span class="vehicle-name">{$t(hud.nameKey)}</span>
      <span class="vehicle-seat">{$t(hud.seatKey)} · {$t('vehicles.hud.seat', { index: hud.seatIndex + 1, count: hud.seatCount })}</span>
    </div>

    <div class="vehicle-hull" title={$t('vehicles.hud.hull')}>
      <span class="vehicle-hull-label">{$t('vehicles.hud.hull')}</span>
      <span class="vehicle-hull-bar"><span class="vehicle-hull-fill" style={`width:${hullPercent}%`}></span></span>
      <span class="vehicle-hull-value mono">{Math.ceil(hud.hp)}</span>
    </div>

    <div class="vehicle-row">
      {#if hud.weaponId}
        <div class="vehicle-gun" class:is-ready={weaponReady} style={`--cd:${(1 - hud.weaponReady) * 100}`}>
          <span class="vehicle-gun-icon"><Pictogram weapon={hud.weaponId} /></span>
          <span class="vehicle-gun-sweep" aria-hidden="true"></span>
          <span class="vehicle-gun-text">
            <b>{$t(weaponNameKeyForSlot(3, hud.weaponId))}</b>
            <em>{weaponReady ? $t('vehicles.hud.ready') : $t('vehicles.hud.reloading')}</em>
          </span>
          <kbd>{$t('vehicles.keys.fire')}</kbd>
        </div>
      {:else}
        <div class="vehicle-gun is-passive">
          <span class="vehicle-gun-text">
            <em>{hud.handWeapons ? $t('vehicles.hud.handWeapons') : $t('vehicles.hud.noWeapon')}</em>
          </span>
        </div>
      {/if}
      {#if hud.driver}
        <span class="vehicle-speed mono">{$t('vehicles.hud.speed', { value: hud.speedKmh })}</span>
      {/if}
    </div>

    {#if hud.boost}
      <div class="vehicle-boost" class:is-active={hud.boost.active} class:is-ready={boostReady}>
        <span class="vehicle-boost-bar"><span style={`width:${hud.boost.ready * 100}%`}></span></span>
        <span>{hud.boost.active ? $t('vehicles.hud.turboActive') : boostReady ? $t('vehicles.hud.turboReady') : $t('vehicles.hud.turbo')}</span>
        <kbd>{$t('vehicles.keys.turbo')}</kbd>
      </div>
    {/if}

    {#if hud.beached}
      <div class="vehicle-warning">{$t('vehicles.hud.beached')}</div>
    {/if}

    {#if hud.rowing}
      <div class="rowing-rhythm" class:is-synced={hud.rowing.active}>
        <span>{hud.rowing.active ? $t('vehicles.hud.rowingSprint') : hud.crew < 2 ? $t('vehicles.hud.rowingPartner') : $t('vehicles.hud.rowingTogether')}</span>
        <progress max="1" value={hud.rowing.phase} aria-label={$t('vehicles.hud.rowingBeat')}></progress>
      </div>
    {/if}
    {#if hud.kind === 'biplane' && hud.driver}<div class="vehicle-warning">{$t('vehicles.hud.flight')}</div>{/if}
    {#if hud.kind === 'cable_car'}<div class="vehicle-warning">{$t('vehicles.hud.cableCar')}</div>{/if}

    <div class="vehicle-keys">
      <span><kbd>{$t('vehicles.keys.exit')}</kbd> {$t('vehicles.hud.exit')}</span>
      {#if hud.seatCount > 1}
        <span><kbd>{$t(hud.kind === 'cable_car' ? 'vehicles.keys.rideSeat' : 'vehicles.keys.seat')}</kbd> {$t('vehicles.hud.switchSeat')}</span>
      {/if}
      {#if hud.driver}
        <span><kbd>{$t('vehicles.keys.horn')}</kbd> {$t('vehicles.hud.horn')}</span>
      {/if}
      {#if hud.driver && hud.kind === 'sidecar'}
        <span><kbd>{$t('vehicles.keys.drift')}</kbd> {$t('vehicles.hud.drift')}</span>
      {/if}
      {#if hud.kind === 'sidecar' && !hud.driver}
        <span><kbd>{$t('vehicles.keys.view')}</kbd> {$t('vehicles.hud.passengerView')}</span>
      {/if}
      {#if hud.handWeapons && hud.hp < hud.maxHp}
        <span><kbd>{$t('vehicles.keys.repair')}</kbd> {$t('vehicles.hud.repair')}</span>
      {/if}
      {#if hud.kind === 'biplane'}<span><kbd>{$t('vehicles.keys.bail')}</kbd> {$t('vehicles.hud.bail')}</span>{/if}
    </div>
  </div>
{/if}

<style>
  .rowing-rhythm { display: grid; gap: 0.2rem; padding: 0.3rem; background: #efddb5; border-radius: 0.3rem; }
  .rowing-rhythm progress { width: 100%; height: 0.7rem; accent-color: #2f927d; }
  .rowing-rhythm.is-synced { background: #a9e4b7; }
  .vehicle-card {
    position: absolute;
    right: 1.3rem;
    bottom: 1.35rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    min-width: 15.5rem;
    padding: 0.55rem 0.75rem 0.6rem;
    border: 0.17rem solid var(--ink);
    border-radius: 0.9rem;
    background: linear-gradient(180deg, #fffaf0, var(--cream-2));
    box-shadow: 0 0.22rem 0 rgba(27, 20, 16, 0.55);
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--ink);
    animation: vehicle-in 260ms cubic-bezier(0.3, 1.6, 0.5, 1) both;
  }

  .vehicle-card.is-raised {
    bottom: 9.6rem;
  }

  .vehicle-card.is-first-person {
    top: 7.2rem;
    bottom: auto;
  }

  .vehicle-head {
    display: flex;
    flex-direction: column;
    gap: 0.05rem;
  }

  .vehicle-name {
    font-family: var(--font-display);
    font-size: 1.15rem;
    font-weight: 400;
    letter-spacing: 0.03em;
    color: #fff;
    -webkit-text-stroke: 0.16em var(--ink);
    paint-order: stroke fill;
  }

  .vehicle-seat {
    font-size: 0.68rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--ink-soft);
  }

  .vehicle-hull {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }

  .vehicle-hull-label {
    font-size: 0.66rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .vehicle-hull-bar {
    position: relative;
    flex: 1;
    height: 0.75rem;
    overflow: hidden;
    border: 0.14rem solid var(--ink);
    border-radius: 99px;
    background: #3a2a20;
  }

  .vehicle-hull-fill {
    position: absolute;
    inset: 0 auto 0 0;
    background: linear-gradient(180deg, #9cf06a, var(--green-dark));
    transition: width 200ms ease;
  }

  .vehicle-card.is-low .vehicle-hull-fill {
    background: linear-gradient(180deg, #ff8a6a, var(--red-dark));
    animation: vehicle-blink 520ms ease-in-out infinite alternate;
  }

  .vehicle-hull-value {
    min-width: 2.2rem;
    text-align: right;
  }

  .vehicle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .vehicle-gun {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }

  .vehicle-gun-icon {
    position: relative;
    display: grid;
    width: 2.4rem;
    height: 2.4rem;
    place-items: center;
    overflow: hidden;
    border: 0.15rem solid var(--ink);
    border-radius: 0.6rem;
    background: linear-gradient(180deg, #ffe28a, var(--brass));
  }

  .vehicle-gun-sweep {
    position: absolute;
    top: 0;
    left: 0;
    width: 2.4rem;
    height: 2.4rem;
    border-radius: 0.6rem;
    background: conic-gradient(from 0deg, transparent calc((100 - var(--cd, 0)) * 1%), rgba(10, 8, 14, 0.62) calc((100 - var(--cd, 0)) * 1%));
    pointer-events: none;
  }

  .vehicle-gun.is-ready .vehicle-gun-sweep {
    display: none;
  }

  .vehicle-gun-text {
    display: flex;
    flex-direction: column;
    line-height: 1.1;
  }

  .vehicle-gun-text b {
    font-size: 0.74rem;
  }

  .vehicle-gun-text em {
    font-style: normal;
    font-size: 0.68rem;
    color: var(--ink-soft);
  }

  .vehicle-gun.is-ready .vehicle-gun-text em {
    color: var(--green-dark);
  }

  .vehicle-speed {
    font-size: 0.9rem;
  }

  .vehicle-boost {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    font-size: 0.7rem;
  }

  .vehicle-boost-bar {
    position: relative;
    width: 5.5rem;
    height: 0.6rem;
    overflow: hidden;
    border: 0.13rem solid var(--ink);
    border-radius: 99px;
    background: #3a2a20;
  }

  .vehicle-boost-bar span {
    position: absolute;
    inset: 0 auto 0 0;
    background: linear-gradient(180deg, #bff4ff, var(--teal));
  }

  .vehicle-boost.is-active .vehicle-boost-bar span {
    background: linear-gradient(180deg, #fff0a0, var(--orange));
  }

  .vehicle-warning {
    padding: 0.15rem 0.5rem;
    border: 0.14rem solid var(--ink);
    border-radius: 0.5rem;
    background: var(--cheese);
    text-align: center;
    animation: vehicle-blink 600ms ease-in-out infinite alternate;
  }

  .vehicle-keys {
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem 0.6rem;
    font-size: 0.64rem;
    color: var(--ink-soft);
  }

  kbd {
    display: inline-block;
    min-width: 1.1rem;
    padding: 0 0.3rem;
    border: 0.12rem solid var(--ink);
    border-radius: 0.35rem;
    background: #fff;
    font-family: var(--font-body);
    font-size: 0.62rem;
    font-weight: 700;
    line-height: 1.2rem;
    text-align: center;
    color: var(--ink);
  }

  @keyframes vehicle-in {
    from {
      opacity: 0;
      transform: translateY(0.6rem) scale(0.92);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  @keyframes vehicle-blink {
    from {
      opacity: 1;
    }
    to {
      opacity: 0.55;
    }
  }
</style>
