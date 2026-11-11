<script lang="ts">
  // Rosetta's idle toy: one word, "read", in nine scripts. Tap the stone to turn
  // it to the next; read all nine and it is an easter egg.
  import { play } from 'dusk-dawn';
  import { cheer, hatch } from '../lib/delight';
  import { locale, t } from '../i18n/index.svelte';

  // [language, the script's sign for the stone, "read" in that language, direction]
  const SCRIPTS = [
    ['el', 'Αα', 'Διάβασε', 'ltr'],
    ['la', 'Aa', 'Lege', 'ltr'],
    ['ru', 'Жж', 'Читай', 'ltr'],
    ['he', 'א', 'קרא', 'rtl'],
    ['ar', 'ع', 'اقرأ', 'rtl'],
    ['hi', 'अ', 'पढ़ो', 'ltr'],
    ['ja', 'あ', '読む', 'ltr'],
    ['ko', '한', '읽다', 'ltr'],
    ['zh', '文', '读', 'ltr'],
  ] as const;

  let index = $state(-1);
  let toy = $state<HTMLButtonElement>();
  const script = $derived(index < 0 ? undefined : SCRIPTS[index]);
  const names = $derived(new Intl.DisplayNames([locale()], { type: 'language' }));

  function turn() {
    index = (index + 1) % SCRIPTS.length;
    // The last face is only reached by reading every one before it.
    if (index === SCRIPTS.length - 1) {
      play(toy, 'tada');
      cheer(toy, { count: 36, spread: 0.6 });
      hatch('stone', t('egg.stone'));
    }
  }
</script>

<button type="button" class="idle-toy stone" bind:this={toy} aria-label={t('idle.turn')} onclick={turn}>
  {#key index}
    <!-- Drawn as generated content with empty alt text: a picture of the script, not words to read out. -->
    <span class="sign" lang={script?.[0]} data-sign={script?.[1] ?? 'Aα'}></span>
  {/key}
</button>
<p class="idle-line" aria-live="polite">
  {#if script}
    {#key index}
      <span class="word" lang={script[0]}><bdi dir={script[3]}>{script[2]}</bdi></span>
      <span class="language">{names.of(script[0])}</span>
    {/key}
  {:else}
    {t('idle.hint')}
  {/if}
</p>

<style>
  .stone {
    perspective: 240px;
  }
  .sign {
    font-family: var(--font-serif);
    font-size: 1.625rem;
    line-height: 1;
    color: var(--accent-amber);
    backface-visibility: hidden;
  }
  .sign::before {
    content: attr(data-sign) / '';
  }
  .word {
    display: block;
    /* Scripts without an italic would only be slanted by the browser. */
    font-style: normal;
    font-size: 1.25rem;
    color: var(--text-heading);
  }
  .language {
    display: block;
    font-family: var(--font-sans);
    font-style: normal;
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-dim);
  }
  @media (prefers-reduced-motion: no-preference) {
    /* The stone turns over to its next face; the word settles in beside it. */
    .sign {
      animation: turn-in var(--spring-spatial-default-dur) var(--spring-spatial-default) both;
    }
    .word,
    .language {
      animation: settle-in var(--spring-spatial-default-dur) var(--spring-spatial-default) both;
    }
    .language {
      animation-delay: 40ms;
    }
  }
  @keyframes turn-in {
    from {
      transform: rotateY(-90deg);
      opacity: 0;
    }
  }
  @keyframes settle-in {
    from {
      transform: translateY(6px);
      opacity: 0;
    }
  }
</style>
