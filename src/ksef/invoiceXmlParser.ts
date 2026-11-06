// Parses FA(3) KSeF invoice XML into a simple structure "like pdf" for preview.

export interface ParsedInvoiceParty {
  nip?: string
  name?: string
  address?: string
  email?: string
  phone?: string
}

export interface ParsedInvoiceLine {
  lp: string
  name: string
  unit: string
  quantity: string
  unitPrice: string
  // The XML only carried a gross unit price (P_9B), so unitPrice is brutto.
  unitPriceGross: boolean
  netAmount: string
  vatRate: string
}

export interface ParsedInvoicePayment {
  dueDate?: string
  method?: string
  bankAccount?: string
  bankName?: string
}

export interface ParsedInvoice {
  formCode?: string
  issueDate?: string
  placeOfIssue?: string
  invoiceNumber?: string
  saleDate?: string
  currency?: string
  seller: ParsedInvoiceParty
  buyer: ParsedInvoiceParty
  lines: ParsedInvoiceLine[]
  netTotal?: string
  vatTotal?: string
  grossTotal?: string
  payment: ParsedInvoicePayment
}

function text(el: Element | null | undefined, tag: string): string | undefined {
  if (!el) return undefined
  const found = el.getElementsByTagName(tag)[0]
  return found?.textContent?.trim() || undefined
}

// Amounts in an FA(3) invoice are split per VAT rate (P_13_1 = 23%, P_13_2 =
// 8%, ...), so a total is the sum of whichever buckets the invoice uses.
function sumAmounts(el: Element | undefined, tags: string[]): string | undefined {
  const values = tags.map((tag) => Number(text(el, tag))).filter((value) => !Number.isNaN(value))
  return values.length ? values.reduce((total, value) => total + value, 0).toFixed(2) : undefined
}

const NET_TAGS = ['P_13_1', 'P_13_2', 'P_13_3', 'P_13_4', 'P_13_5', 'P_13_6_1', 'P_13_6_2', 'P_13_6_3', 'P_13_7', 'P_13_8', 'P_13_9', 'P_13_10', 'P_13_11']
const VAT_TAGS = ['P_14_1', 'P_14_2', 'P_14_3', 'P_14_4', 'P_14_5']

// A line that only states gross (P_11A) and VAT (P_11Vat), as some issuers
// like fuel stations do, has its net worked out from the two.
function lineNet(wiersz: Element): string {
  const net = text(wiersz, 'P_11')
  if (net) return net
  const gross = Number(text(wiersz, 'P_11A'))
  const vat = Number(text(wiersz, 'P_11Vat'))
  return Number.isNaN(gross) || Number.isNaN(vat) ? '' : (gross - vat).toFixed(2)
}

function parseParty(el: Element | null | undefined): ParsedInvoiceParty {
  if (!el) return {}
  const ident = el.getElementsByTagName('DaneIdentyfikacyjne')[0]
  const addr = el.getElementsByTagName('Adres')[0]
  const contact = el.getElementsByTagName('DaneKontaktowe')[0]
  const addressParts = [text(addr, 'AdresL1'), text(addr, 'AdresL2')].filter(Boolean)
  return {
    nip: text(ident, 'NIP'),
    name: text(ident, 'Nazwa'),
    address: addressParts.join(', ') || undefined,
    email: text(contact, 'Email'),
    phone: text(contact, 'Telefon'),
  }
}

export function parseInvoiceXml(xml: string): ParsedInvoice {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const parserError = doc.getElementsByTagName('parsererror')[0]
  if (parserError) {
    throw new Error('Failed to parse invoice XML')
  }

  const naglowek = doc.getElementsByTagName('Naglowek')[0]
  const podmiot1 = doc.getElementsByTagName('Podmiot1')[0]
  const podmiot2 = doc.getElementsByTagName('Podmiot2')[0]
  const fa = doc.getElementsByTagName('Fa')[0]
  const platnosc = fa?.getElementsByTagName('Platnosc')[0]
  const rachunek = platnosc?.getElementsByTagName('RachunekBankowy')[0]
  const termin = platnosc?.getElementsByTagName('TerminPlatnosci')[0]

  const faWiersze = Array.from(fa?.getElementsByTagName('FaWiersz') ?? [])
  const lines: ParsedInvoiceLine[] = faWiersze.length
    ? faWiersze.map((wiersz) => ({
        lp: text(wiersz, 'NrWierszaFa') ?? '',
        name: text(wiersz, 'P_7') ?? '',
        unit: text(wiersz, 'P_8A') ?? '',
        quantity: text(wiersz, 'P_8B') ?? '',
        unitPrice: text(wiersz, 'P_9A') ?? text(wiersz, 'P_9B') ?? '',
        unitPriceGross: !text(wiersz, 'P_9A') && !!text(wiersz, 'P_9B'),
        netAmount: lineNet(wiersz),
        vatRate: text(wiersz, 'P_12') ?? '',
      }))
    : Array.from(fa?.getElementsByTagName('ZamowienieWiersz') ?? []).map((wiersz) => ({
        lp: text(wiersz, 'NrWierszaZam') ?? '',
        name: text(wiersz, 'P_7Z') ?? '',
        unit: text(wiersz, 'P_8AZ') ?? '',
        quantity: text(wiersz, 'P_8BZ') ?? '',
        unitPrice: text(wiersz, 'P_9AZ') ?? '',
        unitPriceGross: false,
        netAmount: text(wiersz, 'P_11NettoZ') ?? '',
        vatRate: text(wiersz, 'P_12Z') ?? '',
      }))

  return {
    formCode: text(naglowek, 'KodFormularza'),
    issueDate: text(fa, 'P_1'),
    placeOfIssue: text(fa, 'P_1M'),
    invoiceNumber: text(fa, 'P_2'),
    saleDate: text(fa, 'P_6'),
    currency: text(fa, 'KodWaluty'),
    seller: parseParty(podmiot1),
    buyer: parseParty(podmiot2),
    lines,
    netTotal: sumAmounts(fa, NET_TAGS),
    vatTotal: sumAmounts(fa, VAT_TAGS),
    grossTotal: text(fa, 'P_15'),
    payment: {
      dueDate: text(termin, 'Termin'),
      method: text(platnosc, 'FormaPlatnosci'),
      bankAccount: text(rachunek, 'NrRB'),
      bankName: text(rachunek, 'NazwaBanku'),
    },
  }
}
