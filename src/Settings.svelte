<script lang="ts">
  import CustomCategories from './CustomCategories.svelte'
  import KsefCredentialsForm from './KsefCredentialsForm.svelte'
  import { session } from './app/session.svelte'
</script>

<!-- Side by side once there's room for two full-width forms; stacked with a
     rule between them below that. -->
<div class="grid grid-cols-1 xl:grid-cols-2 gap-10 items-start">
  <div class="max-w-2xl">
    <KsefCredentialsForm currentCredentials={session.ksefCredentials} />
  </div>

  <!-- Only once KSEF is configured: before that the page is an onboarding
       form, and a second section would bury the one thing to do. -->
  {#if session.ksefCredentials}
    <div class="max-w-2xl border-t border-gray-200 pt-10 xl:border-t-0 xl:pt-0">
      <CustomCategories />
    </div>
  {/if}
</div>
