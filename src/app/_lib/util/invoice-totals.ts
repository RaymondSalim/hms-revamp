// P3-3: Pure financial computation for invoice/bill totals.
// Tax (PPN) line items are identified by a description starting with "PPN ".
// Subtotal excludes tax items; tax sums them; total = all items;
// paid = sum of payment allocations; outstanding = total - paid.

export interface InvoiceLineItem {
  description: string;
  amount: number | string;
}

export interface InvoicePaymentItem {
  amount: number | string;
}

export interface InvoiceTotals {
  subtotal: number;
  tax: number;
  total: number;
  paid: number;
  outstanding: number;
}

const TAX_PREFIX = "PPN ";

export function computeInvoiceTotals(
  billItems: InvoiceLineItem[],
  paymentBills: InvoicePaymentItem[]
): InvoiceTotals {
  const subtotal = billItems
    .filter((i) => !i.description.startsWith(TAX_PREFIX))
    .reduce((s, i) => s + Number(i.amount), 0);

  const tax = billItems
    .filter((i) => i.description.startsWith(TAX_PREFIX))
    .reduce((s, i) => s + Number(i.amount), 0);

  const total = billItems.reduce((s, i) => s + Number(i.amount), 0);

  const paid = paymentBills.reduce((s, p) => s + Number(p.amount), 0);

  const outstanding = total - paid;

  return { subtotal, tax, total, paid, outstanding };
}
