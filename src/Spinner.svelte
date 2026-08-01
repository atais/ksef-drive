<script lang="ts">
  import { Icon, ArrowPath } from 'svelte-hero-icons'

  interface Props {
    label?: string
    // `page` fills the area it sits in with a centred spinner over its label;
    // `inline` is the small one that goes inside a button, before its text.
    variant?: 'page' | 'inline'
  }

  let { label = '', variant = 'page' }: Props = $props()
</script>

{#if variant === 'inline'}
  <Icon src={ArrowPath} class="w-5 h-5 mr-2 animate-spin" />
{:else}
  <div class="flex items-center justify-center py-20">
    <div class="text-center">
      <Icon src={ArrowPath} class="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
      {#if label}<p class="text-gray-600 font-medium">{label}</p>{/if}
    </div>
  </div>
{/if}
