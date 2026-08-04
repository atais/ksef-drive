<script lang="ts">
  import { Icon, ArrowPath, Eye, AdjustmentsHorizontal, CloudArrowUp, ShieldCheck } from 'svelte-hero-icons'
  import { session } from './app/session.svelte'
  import Footer from './Footer.svelte'

  const FEATURES = [
    {
      icon: ArrowPath,
      title: 'Synchronizuj faktury z KSEF',
      description: 'Faktury z KSEF pobierane są automatycznie, bez ręcznego eksportu.',
      bg: 'blue',
    },
    {
      icon: Eye,
      title: 'Łatwo przeglądaj faktury z danego okresu',
      description: 'Wybierz miesiąc i od razu zobacz wszystkie faktury z tego okresu.',
      screenshot: 'shot1.png',
      bg: 'yellow',
    },
    {
      icon: AdjustmentsHorizontal,
      title: 'Filtruj i kategoryzuj wg upodobania',
      description: 'Twórz własne kategorie, dopasowane do sposobu, w jaki rozliczasz się z faktur.',
      bg: 'green',
    },
    {
      icon: CloudArrowUp,
      title: 'Utrzymuj kopię na Google Drive',
      description: 'Każda faktura trafia do odpowiedniego folderu roku i miesiąca na Twoim Drive.',
      bg: 'blue',
    },
    {
      icon: ShieldCheck,
      title: 'Twoje dane zostają u Ciebie',
      description: 'Aplikacja nie ma dostępu do Twoich danych — wszystko odbywa się w Twojej przeglądarce.',
      bg: 'yellow',
    },
  ]

  // Google Drive brand palette.
  const SECTION_BG: Record<string, string> = { blue: 'bg-[#2684FC]', yellow: 'bg-[#FFBA00]', green: 'bg-[#00AC47]' }
</script>

<div class="bg-white">
  <section class="relative overflow-hidden px-4 sm:px-6 pt-20 pb-16 sm:pt-28 sm:pb-24 text-center">
    <div class="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl" aria-hidden="true">
      <div class="mx-auto aspect-[1155/678] w-[72rem] bg-gradient-to-tr from-blue-400 to-blue-600 opacity-20"
        style="clip-path: polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)"
      ></div>
    </div>

    <div class="flex items-center justify-center gap-2 mb-6">
      <img src="{import.meta.env.BASE_URL}ksef.jpg" alt="KSEF" class="w-10 h-10 rounded-lg" />
      <img src="{import.meta.env.BASE_URL}drive.png" alt="Google Drive" class="w-10 h-10" />
    </div>
    <h1 class="mx-auto max-w-3xl text-5xl sm:text-6xl font-bold tracking-tight text-gray-900">
      KSEF drive
    </h1>

    <p class="mx-auto mt-6 max-w-xl text-lg text-gray-600">
      Faktury z KSEF, uporządkowane i skopiowane na Twój Google Drive.
      Jedno miejsce do przeglądania, kategoryzowania i rozliczania.
    </p>

    <div class="mt-10">
      <button
        type="button"
        onclick={() => session.login()}
        class="inline-flex items-center gap-3 rounded-lg bg-white pl-3.5 pr-6 py-2.5 text-base font-medium text-gray-700 shadow-md ring-1 ring-gray-200 transition-shadow hover:shadow-lg"
      >
        <svg viewBox="0 0 48 48" class="w-5 h-5" aria-hidden="true">
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z" />
          <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
          <path fill="#4CAF50" d="M24 44c5.5 0 10.5-2.1 14.3-5.5l-6.6-5.6C29.6 34.7 26.9 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.6 5.1C9.6 39.6 16.3 44 24 44z" />
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.6 5.6C41.6 36.3 44 30.6 44 24c0-1.3-.1-2.7-.4-3.5z" />
        </svg>
        Zaloguj się przez Google
      </button>
    </div>


  </section>

  {#each FEATURES as feature, i (feature.title)}
    {@const dark = feature.bg === 'yellow'}
    <section class="{SECTION_BG[feature.bg]} py-16 sm:py-20 min-h-[32rem] flex items-stretch">
      <div class="mx-auto max-w-7xl px-4 sm:px-6 grid gap-10 lg:grid-cols-3 lg:items-center w-full {i % 2 === 1 ? 'lg:[&>*:first-child]:order-2' : ''}">
        <div class="lg:col-span-1">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 {dark ? 'bg-black/10' : 'bg-white/15'}">
              <Icon src={feature.icon} class="w-6 h-6 {dark ? 'text-gray-900' : 'text-white'}" />
            </div>
            <h3 class="text-2xl font-bold {dark ? 'text-gray-900' : 'text-white'}">{feature.title}</h3>
          </div>
          <p class="text-lg {dark ? 'text-gray-800' : 'text-white/90'}">{feature.description}</p>
        </div>
        <div class="lg:col-span-2 flex items-center justify-center">
          {#if feature.screenshot}
            <img
              src="{import.meta.env.BASE_URL}{feature.screenshot}"
              alt={feature.title}
              class="w-full h-auto rounded-xl shadow-xl shadow-gray-900/10"
            />
          {:else}
            <div class="w-full min-h-[16rem] rounded-xl shadow-xl shadow-gray-900/10 flex items-center justify-center bg-white">
              <p class="text-gray-400 text-sm py-20">Zrzut ekranu do uzupełnienia</p>
            </div>
          {/if}
        </div>
      </div>
    </section>
  {/each}

  <Footer />
</div>
