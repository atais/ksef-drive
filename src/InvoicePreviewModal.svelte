<script lang="ts">
  import { Icon, XMark } from 'svelte-hero-icons'
  import { parseInvoiceXml, type ParsedInvoice } from './ksef/invoiceXmlParser'

  interface Props {
    xml: string | null
    loading: boolean
    error: string | null
    onClose: () => void
  }

  let { xml, loading, error, onClose }: Props = $props()

  const invoice = $derived<ParsedInvoice | null>(xml ? parseInvoiceXml(xml) : null)

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }
</script>

<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
  onclick={handleBackdropClick}
  role="presentation"
>
  <div class="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
    <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white">
      <h2 class="text-lg font-semibold text-gray-900">Invoice preview</h2>
      <button
        type="button"
        onclick={onClose}
        aria-label="Close"
        class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:bg-gray-100 transition-all"
      >
        <Icon src={XMark} class="w-5 h-5" />
      </button>
    </div>

    <div class="p-6">
      {#if loading}
        <p class="text-gray-600 text-sm text-center py-8">Loading invoice…</p>
      {:else if error}
        <p class="text-red-700 text-sm text-center py-8">{error}</p>
      {:else if invoice}
        <div class="text-center mb-6">
          <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Faktura {invoice.formCode ?? ''}</p>
          <p class="text-xl font-bold text-gray-900">{invoice.invoiceNumber}</p>
          <p class="text-sm text-gray-500">
            Issued {invoice.issueDate ?? '-'}{invoice.placeOfIssue ? `, ${invoice.placeOfIssue}` : ''}
          </p>
        </div>

        <div class="grid grid-cols-2 gap-6 mb-6">
          <div>
            <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Seller</p>
            <p class="text-sm font-medium text-gray-900">{invoice.seller.name}</p>
            <p class="text-sm text-gray-600">NIP: {invoice.seller.nip}</p>
            {#if invoice.seller.address}<p class="text-sm text-gray-600">{invoice.seller.address}</p>{/if}
            {#if invoice.seller.email}<p class="text-sm text-gray-600">{invoice.seller.email}</p>{/if}
            {#if invoice.seller.phone}<p class="text-sm text-gray-600">{invoice.seller.phone}</p>{/if}
          </div>
          <div>
            <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Buyer</p>
            <p class="text-sm font-medium text-gray-900">{invoice.buyer.name}</p>
            <p class="text-sm text-gray-600">NIP: {invoice.buyer.nip}</p>
            {#if invoice.buyer.address}<p class="text-sm text-gray-600">{invoice.buyer.address}</p>{/if}
          </div>
        </div>

        <table class="w-full mb-6 text-sm">
          <thead>
            <tr class="border-b border-gray-200">
              <th class="text-left py-2 font-semibold text-gray-600">#</th>
              <th class="text-left py-2 font-semibold text-gray-600">Item</th>
              <th class="text-right py-2 font-semibold text-gray-600">Qty</th>
              <th class="text-right py-2 font-semibold text-gray-600">Unit price</th>
              <th class="text-right py-2 font-semibold text-gray-600">Net</th>
              <th class="text-right py-2 font-semibold text-gray-600">VAT %</th>
            </tr>
          </thead>
          <tbody>
            {#each invoice.lines as line, index (index)}
              <tr class="border-b border-gray-100">
                <td class="py-2 text-gray-600">{line.lp}</td>
                <td class="py-2 text-gray-900">{line.name}</td>
                <td class="py-2 text-right text-gray-900">{line.quantity} {line.unit}</td>
                <td class="py-2 text-right text-gray-900">{line.unitPrice}</td>
                <td class="py-2 text-right text-gray-900">{line.netAmount}</td>
                <td class="py-2 text-right text-gray-900">{line.vatRate}</td>
              </tr>
            {/each}
          </tbody>
        </table>

        <div class="flex justify-end mb-6">
          <div class="w-64 space-y-1 text-sm">
            <div class="flex justify-between">
              <span class="text-gray-600">Net</span>
              <span class="text-gray-900">{invoice.netTotal} {invoice.currency}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-600">VAT</span>
              <span class="text-gray-900">{invoice.vatTotal} {invoice.currency}</span>
            </div>
            <div class="flex justify-between font-semibold border-t border-gray-200 pt-1">
              <span class="text-gray-900">Gross</span>
              <span class="text-gray-900">{invoice.grossTotal} {invoice.currency}</span>
            </div>
          </div>
        </div>

        {#if invoice.payment.bankAccount || invoice.payment.dueDate}
          <div class="border-t border-gray-200 pt-4">
            <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Payment</p>
            {#if invoice.payment.dueDate}<p class="text-sm text-gray-600">Due: {invoice.payment.dueDate}</p>{/if}
            {#if invoice.payment.bankAccount}
              <p class="text-sm text-gray-600">
                {invoice.payment.bankAccount} {invoice.payment.bankName ? `(${invoice.payment.bankName})` : ''}
              </p>
            {/if}
          </div>
        {/if}
      {/if}
    </div>
  </div>
</div>
