<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { WEAPON_STATS } from '@frost-and-flamingos/shared';
  import { hitMarker, localPlayer, showComicWord } from '../../state/game';

  /**
   * Turns events the HUD can already observe into comic words, without touching the engine:
   * a headshot hit goes PLING, a melee hit goes BOUCH and entering the water goes SPLASH.
   * Kills are announced by the game itself (BANG / PLING with a caption). Other systems
   * (explosions, launches, horns, repairs, ...) call `showComicWord()` directly.
   */
  const COOLDOWN_MS = 900;

  onMount(() => {
    let lastMarker = -1;
    let lastAuto = 0;
    let swimming: boolean | null = null;

    const stopHits = hitMarker.subscribe((marker) => {
      if (!marker || marker.id === lastMarker) return;
      lastMarker = marker.id;
      const now = performance.now();
      if (marker.kill || now - lastAuto < COOLDOWN_MS) return;
      const player = get(localPlayer);
      const melee = !!player && WEAPON_STATS[player.weaponId].fireMode === 'melee';
      if (marker.headshot) {
        showComicWord('pling');
        lastAuto = now;
      } else if (melee) {
        showComicWord('bouch');
        lastAuto = now;
      }
    });

    const stopPlayer = localPlayer.subscribe((player) => {
      const inWater = player?.swimming ?? false;
      if (swimming !== null && inWater && !swimming) showComicWord('splash');
      swimming = inWater;
    });

    return () => {
      stopHits();
      stopPlayer();
    };
  });
</script>
