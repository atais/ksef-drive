<script lang="ts">
  import ArchiveLocation from './ArchiveLocation.svelte'
  import CompletionSetting from './CompletionSetting.svelte'
  import CustomCategories from './CustomCategories.svelte'
  import KsefCredentialsForm from './KsefCredentialsForm.svelte'
  import { session } from './app/session.svelte'
</script>

<!-- Side by side once there's room for two full-width forms; stacked with a
     rule between them below that. -->
<div class="grid grid-cols-1 xl:grid-cols-2 gap-10 items-start">
  <!-- Archive location comes first and is never gated: it is also the way out
       of an archive that has no KSeF credentials yet. -->
  <div class="max-w-2xl space-y-10">
    <ArchiveLocation />
    <KsefCredentialsForm currentCredentials={session.ksefCredentials} />
  </div>

  <!-- Only once KSEF is configured: before that the page is an onboarding
       form, and more sections would bury the one thing to do. -->
  {#if session.ksefCredentials}
    <div class="max-w-2xl space-y-10 border-t border-gray-200 pt-10 xl:border-t-0 xl:pt-0">
      <CompletionSetting />
      <CustomCategories />
    </div>
  {/if}
</div>
