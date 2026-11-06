<script lang="ts">
  import { playerTags } from '../../state/tactical';
</script>

<div class="player-tags" aria-hidden="true">
  {#each $playerTags as tag (tag.id)}
    <div class="player-tag" class:is-friendly={tag.friendly} class:is-local={tag.local} style={`left:${tag.x}%;top:${tag.y}%;--tag-lift:${tag.lift ?? 0}px`}>
      <span>{tag.name}</span>{#if tag.health!==undefined}<div class="tag-health"><b style={`width:${tag.health*100}%`}></b></div>{/if}<i></i>
    </div>
  {/each}
</div>
