import type { PaymentProviderType } from '../types/domain.ts';
import { centsToFixedDecimal } from '../lib/money.ts';

export interface PaymentPayload {
  provider: PaymentProviderType;
  recipientIdentifier: string;
  amountCents: number;
  orderNumber: string;
  eventName?: string;
  customTemplate?: string;
}

export interface GeneratedPaymentDetails {
  provider: PaymentProviderType;
  providerDisplayName: string;
  paymentUrl: string;
  formattedAmount: string; // e.g. "37.00" (always 2 decimal places)
  noteText: string; // e.g. "Order OCT26-1048"
  recipientDisplay: string;
}

export interface PaymentProviderAdapter {
  provider: PaymentProviderType;
  displayName: string;
  buildPaymentUrl(params: {
    recipient: string;
    amountDecimal: string;
    orderNumber: string;
    note: string;
    customTemplate?: string;
  }): string;
}

const venmoAdapter: PaymentProviderAdapter = {
  provider: 'VENMO',
  displayName: 'Venmo',
  buildPaymentUrl({ recipient, amountDecimal, note }) {
    const cleanRecipient = recipient.replace(/^@/, '').trim();
    const encodedRecipient = encodeURIComponent(cleanRecipient);
    const encodedNote = encodeURIComponent(note);
    return `https://venmo.com/${encodedRecipient}?txn=pay&amount=${amountDecimal}&note=${encodedNote}`;
  },
};

const paypalAdapter: PaymentProviderAdapter = {
  provider: 'PAYPAL',
  displayName: 'PayPal',
  buildPaymentUrl({ recipient, amountDecimal, note }) {
    const cleanRecipient = recipient.replace(/^@/, '').trim();
    const encodedRecipient = encodeURIComponent(cleanRecipient);
    const encodedNote = encodeURIComponent(note);
    return `https://www.paypal.com/paypalme/${encodedRecipient}/${amountDecimal}USD?item_name=${encodedNote}`;
  },
};

const cashAppAdapter: PaymentProviderAdapter = {
  provider: 'CASH_APP',
  displayName: 'Cash App',
  buildPaymentUrl({ recipient, amountDecimal, note }) {
    const cleanCashtag = recipient.replace(/^\$/, '').trim();
    const encodedCashtag = encodeURIComponent(cleanCashtag);
    const encodedNote = encodeURIComponent(note);
    return `https://cash.app/$${encodedCashtag}/${amountDecimal}?note=${encodedNote}`;
  },
};

const customAdapter: PaymentProviderAdapter = {
  provider: 'CUSTOM',
  displayName: 'Custom Payment URL',
  buildPaymentUrl({ recipient, amountDecimal, orderNumber, note, customTemplate }) {
    const template =
      customTemplate && customTemplate.trim().length > 0
        ? customTemplate.trim()
        : 'https://pay.boothcheckout.local/{recipient}?amount={amount}&order={orderNumber}&note={note}';

    return template
      .replace(/\{recipient\}/g, encodeURIComponent(recipient.trim()))
      .replace(/\{amount\}/g, amountDecimal)
      .replace(/\{orderNumber\}/g, encodeURIComponent(orderNumber))
      .replace(/\{note\}/g, encodeURIComponent(note));
  },
};

const ADAPTERS: Record<PaymentProviderType, PaymentProviderAdapter> = {
  VENMO: venmoAdapter,
  PAYPAL: paypalAdapter,
  CASH_APP: cashAppAdapter,
  CUSTOM: customAdapter,
};

export function getPaymentProviderAdapter(provider: PaymentProviderType): PaymentProviderAdapter {
  return ADAPTERS[provider] ?? venmoAdapter;
}

export function generatePaymentDetails(payload: PaymentPayload): GeneratedPaymentDetails {
  const adapter = getPaymentProviderAdapter(payload.provider);
  const amountDecimal = centsToFixedDecimal(payload.amountCents);
  const noteText = `Order ${payload.orderNumber}`;
  const paymentUrl = adapter.buildPaymentUrl({
    recipient: payload.recipientIdentifier,
    amountDecimal,
    orderNumber: payload.orderNumber,
    note: noteText,
    customTemplate: payload.customTemplate,
  });

  return {
    provider: payload.provider,
    providerDisplayName: adapter.displayName,
    paymentUrl,
    formattedAmount: amountDecimal,
    noteText,
    recipientDisplay: payload.recipientIdentifier,
  };
}
