<script lang="ts">
  interface Props {
    // Nothing renders when there's no error, so call sites can pass a store's
    // error field straight through without wrapping it in an {#if}.
    message: string | null | undefined
  }

  let { message }: Props = $props()
</script>

{#if message}
  <div class="p-4 bg-red-50 border border-red-200 rounded-lg">
    <p class="text-sm text-red-600">{message}</p>
  </div>
{/if}
