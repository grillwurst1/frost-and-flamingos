<script lang="ts">
  import { playerTags } from '../../state/tactical';
</script>

<div class="player-tags" aria-hidden="true">
  {#each $playerTags as tag (tag.id)}
    <div class="player-tag" class:is-friendly={tag.friendly} class:is-local={tag.local} style={`left:${tag.x}%;top:${tag.y}%`}>
      <span>{tag.name}</span><i></i>
    </div>
  {/each}
</div>
