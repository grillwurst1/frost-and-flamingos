<script lang="ts">
  import { FJORD_MAP, MAP_SIZE } from '@frost-and-flamingos/shared';
  import { localPlayer } from '../../state/game';
  import { tacticalPlayers } from '../../state/tactical';
  import { conquest } from '../../state/conquest';
  import { t } from '../../state/locale';
  import { mapX, mapY, minimapArtwork } from '../../rendering/minimap-map';
  const artwork = minimapArtwork();
  const span = 260;
  $: player = $localPlayer;
  $: centreX = mapX(player?.position.x ?? 0);
  $: centreY = mapY(player?.position.z ?? 0);
</script>

<div class="tactical-map" aria-label={$t('hud.minimap')}>
  <svg viewBox={`${centreX-span/2} ${centreY-span/2} ${span} ${span}`} aria-hidden="true">
    <image href={artwork} x="0" y="0" width={MAP_SIZE} height={MAP_SIZE}/>
    <circle cx={centreX} cy={centreY} r="107" fill="none" stroke="#ffffff88" stroke-width="1.5" />
    {#each FJORD_MAP.towers as tower, index}
      {@const owner = $conquest.towers[index]?.owner}
      <circle cx={mapX(tower.position.x)} cy={mapY(tower.position.z)} r="7" fill={owner === 'alpine' ? '#7dbddd' : owner === 'lagoon' ? '#d77570' : '#d8d7c8'} stroke="#293d48" stroke-width="2"/>
      <text x={mapX(tower.position.x)} y={mapY(tower.position.z)+3} text-anchor="middle" fill="#f7faf7" stroke="#293d48" stroke-width="1" paint-order="stroke" font-size="9" font-weight="bold">{String.fromCharCode(65+index)}</text>
    {/each}
    {#each $tacticalPlayers.filter(p=>p.id!==player?.id && p.alive && p.faction===player?.faction) as other (other.id)}
      <circle cx={mapX(other.x)} cy={mapY(other.z)} r="3.8" fill="#7dc4e4" stroke="#263744" stroke-width="1.8" />
    {/each}
    <g transform={`translate(${centreX} ${centreY}) rotate(${(player?.yaw ?? 0)*180/Math.PI})`}>
      <path d="M0 -10 L7 7 L0 4 L-7 7Z" fill="#fffaf0" stroke="#28343b" stroke-width="2" />
    </g>
  </svg>
</div>
