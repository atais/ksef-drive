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
  <div class="max-w-2xl">
    <KsefCredentialsForm currentCredentials={session.ksefCredentials} />
  </div>

  <!-- Archive location is always here: it is also the way out of an archive
       that has no KSeF credentials. Categories wait for KSEF to be set up,
       so the onboarding form isn't buried. -->
  <div class="max-w-2xl space-y-10 border-t border-gray-200 pt-10 xl:border-t-0 xl:pt-0">
    <ArchiveLocation />
    <CompletionSetting />
    {#if session.ksefCredentials}
      <CustomCategories />
    {/if}
  </div>
</div>
