<script lang="ts">
  import { i18n, type Lang } from './app/i18n.svelte'

  const LANGS: { value: Lang; flag: string; label: string }[] = [
    { value: 'pl', flag: '🇵🇱', label: 'Polski' },
    { value: 'en', flag: '🇬🇧', label: 'English' },
  ]
</script>

<footer class="w-full border-t border-gray-200 bg-white">
  <div class="flex h-16">
    <div class="hidden md:flex items-center px-4 sm:px-6 w-64 flex-shrink-0 border-r border-gray-200 text-sm text-gray-500">
      &copy; {new Date().getFullYear()} KSEF drive
    </div>
    <div class="flex items-center justify-between flex-1 px-4 sm:px-6 text-sm text-gray-500">
      <p class="md:hidden">&copy; {new Date().getFullYear()} KSEF drive</p>
      <div class="flex items-center gap-3 ml-auto">
        <div class="inline-flex rounded-lg border border-gray-300 overflow-hidden">
          {#each LANGS as lang (lang.value)}
            <button
              type="button"
              onclick={() => i18n.setLang(lang.value)}
              title={lang.label}
              aria-label={lang.label}
              class="px-2 py-1 text-base leading-none transition-colors {i18n.lang === lang.value
                ? 'bg-blue-600'
                : 'bg-white opacity-50 hover:opacity-100 hover:bg-gray-50'}"
            >
              {lang.flag}
            </button>
          {/each}
        </div>
        <a
          href="https://github.com/atais/ksef-gdrive"
          target="_blank"
          rel="noopener noreferrer"
          class="flex items-center gap-1.5 hover:text-gray-900 transition-colors"
        >
          <svg viewBox="0 0 24 24" class="w-4 h-4 fill-current" aria-hidden="true">
            <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.09 3.29 9.4 7.86 10.93.57.1.78-.25.78-.55 0-.27-.01-1.16-.02-2.11-3.2.7-3.87-1.36-3.87-1.36-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.17.08 1.78 1.2 1.78 1.2 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.56-.29-5.25-1.28-5.25-5.7 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.09 0 4.43-2.7 5.41-5.27 5.69.42.36.78 1.08.78 2.17 0 1.57-.01 2.83-.01 3.22 0 .3.2.66.79.55A10.52 10.52 0 0 0 23.5 12c0-6.35-5.15-11.5-11.5-11.5Z" />
          </svg>
          {i18n.t('footer.github')}
        </a>
      </div>
    </div>
  </div>
</footer>
