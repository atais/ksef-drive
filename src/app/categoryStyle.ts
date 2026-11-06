// How a category is coloured wherever it's shown, so the KSeF and Drive pages
// agree: green for sales, amber for costs, grey for everything else.

import type { CategoryKind } from './categories'

const PALETTE: Record<CategoryKind, { badge: string; border: string }> = {
  sold: { badge: 'bg-green-50 text-green-700', border: 'border-green-200' },
  bought: { badge: 'bg-amber-50 text-amber-700', border: 'border-amber-200' },
  other: { badge: 'bg-gray-100 text-gray-700', border: 'border-gray-200' },
}

// Classes for a pill showing the category name.
export const kindBadge = (kind: CategoryKind): string => PALETTE[kind].badge

// Classes for a <select> choosing a category: the pill colours plus a border.
export const kindSelect = (kind: CategoryKind): string => `${PALETTE[kind].border} ${PALETTE[kind].badge}`
