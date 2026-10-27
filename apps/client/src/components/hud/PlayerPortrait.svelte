<script lang="ts">
  import { HAIR_COLORS, HEADGEAR_PALETTES, SKIN_TONES, TORSO_PALETTES } from '@frost-and-flamingos/shared';
  import { profile } from '../../state/profile';
  $: cosmetics = $profile.cosmetics;
  $: skin = SKIN_TONES[cosmetics.skinToneIndex] ?? SKIN_TONES[0];
  $: hair = HAIR_COLORS[cosmetics.hairColorIndex] ?? HAIR_COLORS[0];
  $: hat = HEADGEAR_PALETTES[cosmetics.headgear];
  $: shirt = TORSO_PALETTES[cosmetics.torso];
  $: bare = cosmetics.headgear === 'head_none';
  $: beard = ['face_full_beard','face_icicle_beard','face_eyepatch_beard'].includes(cosmetics.face);
  $: beardColour = cosmetics.face === 'face_icicle_beard' ? '#d4eef4' : hair;
</script>

<svg class="player-portrait" viewBox="0 0 100 100" aria-hidden="true">
  <defs><clipPath id="portrait-clip"><circle cx="50" cy="50" r="44" /></clipPath></defs>
  <circle cx="50" cy="50" r="48" fill="#536d7c" stroke="#17212a" stroke-width="3" />
  <circle cx="50" cy="50" r="43.5" fill="#34434e" stroke="#8b9eaa" stroke-width="2" />
  <g clip-path="url(#portrait-clip)" stroke="#24251f" stroke-width="1.8" stroke-linejoin="round">
    <path d="M14 101 L23 82 L40 76 H61 L80 84 L88 101" fill={cosmetics.torso==='torso_tracht_shirt'?'#465d32':shirt.primary} />
    <path d="M32 78 L41 72 H60 L68 80 L59 99 H45Z" fill="#ece6d4" />
    <path d="M43 70 L42 83 L51 91 L61 81 L59 70" fill={skin} />
    <path d="M28 45 Q21 42 24 56 Q25 62 30 60 M71 45 Q80 42 76 57 Q75 62 70 59" fill={skin} />
    <path d="M29 36 Q31 22 51 24 Q72 25 73 42 L70 68 Q66 82 51 84 Q36 81 30 66Z" fill={skin} />
    {#if cosmetics.hairStyleIndex!==6}<path d="M30 37 L32 63 L38 62 L38 44 Q47 37 60 41 L68 48 L70 65 L74 51 L72 32Z" fill={hair} />{/if}
    {#if cosmetics.hairStyleIndex===1}
      <path d="M25 45 Q18 31 27 24 Q24 13 38 14 Q46 3 56 13 Q73 8 76 24 Q84 31 75 46 L68 36 Q52 29 32 38Z" fill={hair}/>
    {:else if cosmetics.hairStyleIndex===2}
      <path d="M31 30 Q15 43 21 74 L31 79 L37 55 M67 29 Q82 43 79 77 L67 79 L64 55" fill={hair}/>
    {:else if cosmetics.hairStyleIndex===3}
      <path d="M31 39 Q23 57 29 83 L35 88 L39 81 L33 59 M70 40 Q78 57 73 84 L67 88 L63 81 L70 58" fill={hair}/>
      <path d="M26 77 L36 79 M66 79 L76 77" stroke="#e5ba66" stroke-width="4"/>
    {:else if cosmetics.hairStyleIndex===4}
      <path d="M71 34 Q89 39 81 73 L72 83 L76 56 L67 45Z" fill={hair}/>
    {:else if cosmetics.hairStyleIndex===5}
      <path d="M29 40 Q21 23 36 18 Q48 3 64 17 Q79 20 72 40 L63 30 Q48 24 29 40Z" fill={hair}/>
    {/if}
    {#if beard}
      <path d="M33 58 L39 64 L45 62 L52 66 L59 61 L66 63 L71 56 L70 71 Q65 84 51 85 Q35 82 31 69Z" fill={beardColour} />
      <path d="M40 69 Q51 64 62 70 L61 76 Q50 82 41 75Z" fill={skin} />
    {/if}
    <path d="M39 44 L47 43 M58 43 L66 45" fill="none" stroke={hair} stroke-width="4" />
    <path d="M37 48 Q42 45 47 48 L46 53 H38Z M56 48 Q61 45 66 49 L64 53 H57Z" fill="#fff9eb" />
    <path d="M43 48 V52 M60 48 V52" stroke="#212322" stroke-width="3" />
    <path d="M51 48 L48 60 Q52 64 56 60" fill={skin} />
    <path d="M43 69 Q51 66 61 70" fill="none" stroke={beard||cosmetics.face==='face_mustache'?beardColour:'#835744'} stroke-width={beard||cosmetics.face==='face_mustache'?3:1.5} />
    {#if cosmetics.face==='face_snorkel_mask'||cosmetics.face==='face_flamingo_shades'}
      <path d="M32 45 H70 L67 57 H56 L51 52 L47 57 H35Z" fill={cosmetics.face==='face_snorkel_mask'?'#55bec7':'#d67d9c'} stroke="#1d2d35"/>
    {:else if cosmetics.face==='face_eyepatch_beard'}
      <path d="M29 38 L71 58 M34 47 H48 L46 57 H36Z" fill="#252c32" stroke="#252c32" stroke-width="2.5"/>
    {:else if cosmetics.face==='face_sunscreen'}
      <path d="M46 57 L57 58 M31 60 L41 62 M62 62 L71 59" stroke="#f4f2df" stroke-width="5"/>
    {:else if cosmetics.face==='face_bubble_pipe'}
      <path d="M59 70 L74 73 L79 64" fill="none" stroke="#bc9160" stroke-width="5"/>
      <circle cx="80" cy="53" r="5" fill="#90cbd877" stroke="#d0edf1"/><circle cx="87" cy="40" r="4" fill="#90cbd877" stroke="#d0edf1"/>
    {/if}
    {#if !bare}
      {#if cosmetics.headgear === 'head_fondue_pot'}
        <path d="M25 39 L26 17 Q50 9 74 18 L76 39Z" fill={hat.primary}/>
        <path d="M25 25 H16 V34 H25 M75 25 H84 V34 H75" fill="none" stroke={hat.secondary} stroke-width="4"/>
        <path d="M29 21 Q49 15 70 21" fill="none" stroke="#c6d2d5" stroke-width="3"/>
      {:else if cosmetics.headgear === 'head_diving_bell'}
        <path d="M20 65 V35 Q22 7 50 9 Q80 9 81 38 V65 L72 71 V37 Q50 24 30 37 V70Z" fill={hat.primary}/>
        <path d="M23 35 H32 M69 35 H80 M20 60 H31 M71 60 H81" stroke={hat.secondary} stroke-width="4"/>
      {:else if cosmetics.headgear === 'head_marmot_fur'}
        <path d="M21 39 Q13 26 27 20 Q22 6 37 13 Q50 4 62 13 Q78 6 77 22 Q89 28 79 41 L68 38 Q50 31 28 41Z" fill={hat.primary}/>
        <path d="M63 17 Q83 6 87 23 L82 31" fill="none" stroke={hat.secondary} stroke-width="8"/>
      {:else if cosmetics.headgear === 'head_captain_cap'}
        <path d="M22 31 Q15 11 49 10 Q85 10 79 31 L69 39 H31Z" fill={hat.primary}/>
        <path d="M24 31 Q52 23 78 32 L68 43 Q49 37 31 41Z" fill={hat.secondary}/>
        <path d="M47 21 V29 M42 24 Q50 33 57 24 M44 21 H53" fill="none" stroke={hat.accent} stroke-width="2"/>
      {:else if cosmetics.headgear === 'head_watermelon'}
        <path d="M24 38 Q22 9 51 10 Q78 10 78 38Z" fill={hat.primary}/>
        <path d="M35 14 L31 36 M48 11 L46 37 M61 12 L64 37 M72 21 L74 36" stroke={hat.secondary} stroke-width="4"/>
        <path d="M23 38 H79" stroke={hat.accent} stroke-width="5"/>
      {:else if cosmetics.headgear === 'head_flamingo_hat'}
        <path d="M21 37 Q18 25 36 25 H69 Q79 30 78 39Z" fill={hat.primary}/>
        <path d="M56 30 Q46 10 58 8 Q70 6 70 15 L62 20 L65 29" fill={hat.primary}/>
        <path d="M70 13 L80 18 L69 19Z" fill={hat.secondary}/><circle cx="64" cy="13" r="1.5" fill="#202b33"/>
      {:else}
        <path d="M20 35 L31 29 L38 10 L58 13 L69 10 L76 34 L86 40 Q55 48 16 39Z" fill={hat.primary} />
        <path d="M31 28 L75 32 L77 38 Q48 42 27 34Z" fill={hat.secondary} />
        <path d="M69 26 Q68 9 75 5 Q80 19 72 29" fill="#eee8d1" />
      {/if}
    {/if}
    <path d="M31 81 L36 97 M70 83 L66 100" fill="none" stroke={shirt.secondary} stroke-width="4" />
  </g>
</svg>
