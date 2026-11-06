<script lang="ts">
  import { referenceScene, sceneTowers } from '../../state/scene';
  import { localPlayer } from '../../state/game';
  import { tacticalPlayers } from '../../state/tactical';
  import { conquest } from '../../state/conquest';
  import { t } from '../../state/locale';
  import { mapX, mapY, mapSize, minimapArtwork } from '../../rendering/minimap-map';
  const artwork = minimapArtwork();
  const span = referenceScene ? 100 : 260;
  $: player = $localPlayer;
  $: centreX = mapX(player?.position.x ?? 0);
  $: centreY = mapY(player?.position.z ?? 0);
</script>

<div class="tactical-map" aria-label={$t('hud.minimap')}>
  <svg viewBox={`${centreX-span/2} ${centreY-span/2} ${span} ${span}`} aria-hidden="true">
    <image href={artwork} x="0" y="0" width={mapSize} height={mapSize}/>
    <circle cx={centreX} cy={centreY} r={referenceScene?42:107} fill="none" stroke="#ffffff88" stroke-width="1.5" />
    {#each sceneTowers as tower, index}
      {@const owner = $conquest.towers[index]?.owner}
      <circle cx={mapX(tower.position.x)} cy={mapY(tower.position.z)} r={referenceScene?2.5:7} fill={owner === 'alpine' ? '#7dbddd' : owner === 'lagoon' ? '#d77570' : '#d8d7c8'} stroke="#293d48" stroke-width={referenceScene?.7:2}/>
      <text x={mapX(tower.position.x)} y={mapY(tower.position.z)+(referenceScene?1.2:3)} text-anchor="middle" fill="#f7faf7" stroke="#293d48" stroke-width="1" paint-order="stroke" font-size={referenceScene?3.5:9} font-weight="bold">{String.fromCharCode(65+index)}</text>
    {/each}
    {#each $tacticalPlayers.filter(p=>p.id!==player?.id && p.alive && p.faction===player?.faction) as other (other.id)}
      <circle cx={mapX(other.x)} cy={mapY(other.z)} r={referenceScene?1.3:3.8} fill="#7dc4e4" stroke="#263744" stroke-width="1.8" />
    {/each}
    <g transform={`translate(${centreX} ${centreY}) rotate(${(player?.yaw ?? 0)*180/Math.PI})`}>
      <path transform={referenceScene?"scale(.5)":""} d="M0 -10 L7 7 L0 4 L-7 7Z" fill="#fffaf0" stroke="#28343b" stroke-width={referenceScene?.7:2} />
    </g>
  </svg>
</div>
