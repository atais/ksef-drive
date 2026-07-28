// Reading invoices out of KSeF: metadata queries and XML downloads.

import { ksefFetch, ksefFetchJson } from './http'

export type InvoiceQuerySubjectType = 'Subject1' | 'Subject2' | 'Subject3' | 'SubjectAuthorized'
export type InvoiceQueryDateType = 'Issue' | 'Invoicing' | 'PermanentStorage'

export interface InvoiceQueryDateRange {
  dateType: InvoiceQueryDateType
  from: string
  to?: string
}

export interface InvoiceQueryFilters {
  subjectType: InvoiceQuerySubjectType
  dateRange: InvoiceQueryDateRange
  ksefNumber?: string
  invoiceNumber?: string
}

export interface InvoiceMetadataParty {
  nip?: string
  name?: string
}

export interface InvoiceMetadata {
  ksefNumber: string
  invoiceNumber: string
  issueDate: string
  invoicingDate: string
  acquisitionDate: string
  permanentStorageDate: string
  seller: InvoiceMetadataParty
  buyer: { identifier: { type: string; value?: string }; name?: string }
  netAmount: number
  grossAmount: number
  vatAmount: number
  currency: string
  invoicingMode: string
  invoiceType: string
}

interface QueryInvoicesMetadataResponse {
  hasMore: boolean
  isTruncated: boolean
  permanentStorageHwmDate: string | null
  invoices: InvoiceMetadata[]
}

// An invoice can list us in any of these roles, and KSeF only returns one
// role per query, so a complete picture means querying all four.
const ALL_SUBJECT_TYPES: InvoiceQuerySubjectType[] = ['Subject1', 'Subject2', 'Subject3', 'SubjectAuthorized']

const PAGE_SIZE = 100

// Lists invoice metadata matching the given filters. KSeF limits the date
// range to a 3 month window.
function queryInvoicesMetadata(
  sessionToken: string,
  filters: InvoiceQueryFilters,
  pageOffset: number,
  pageSize: number
): Promise<QueryInvoicesMetadataResponse> {
  const params = new URLSearchParams({ pageOffset: String(pageOffset), pageSize: String(pageSize) })
  return ksefFetchJson<QueryInvoicesMetadataResponse>(`/invoices/query/metadata?${params}`, {
    method: 'POST',
    token: sessionToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(filters),
  })
}

// Fetches every page of a single subject type's query, following hasMore.
async function queryAllPagesForSubject(
  sessionToken: string,
  subjectType: InvoiceQuerySubjectType,
  dateRange: InvoiceQueryDateRange
): Promise<InvoiceMetadata[]> {
  const invoices: InvoiceMetadata[] = []
  let pageOffset = 0

  for (;;) {
    const page = await queryInvoicesMetadata(sessionToken, { subjectType, dateRange }, pageOffset, PAGE_SIZE)
    invoices.push(...page.invoices)
    if (!page.hasMore || page.invoices.length === 0) break
    pageOffset += PAGE_SIZE
  }

  return invoices
}

// Queries invoice metadata across every subject role, fully paginated, and
// merges by ksefNumber — the same invoice shows up under several roles.
export async function queryAllInvoicesMetadata(
  sessionToken: string,
  dateRange: InvoiceQueryDateRange
): Promise<InvoiceMetadata[]> {
  const results = await Promise.all(
    ALL_SUBJECT_TYPES.map((subjectType) => queryAllPagesForSubject(sessionToken, subjectType, dateRange))
  )

  const merged = new Map<string, InvoiceMetadata>()
  for (const invoice of results.flat()) {
    merged.set(invoice.ksefNumber, invoice)
  }
  return Array.from(merged.values())
}

// Downloads a single invoice's XML content by its KSeF number.
export async function downloadInvoiceXml(sessionToken: string, ksefNumber: string): Promise<string> {
  const response = await ksefFetch(`/invoices/ksef/${encodeURIComponent(ksefNumber)}`, { token: sessionToken })
  return response.text()
}
