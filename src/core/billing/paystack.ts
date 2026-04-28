/**
 * Paystack Integration for Billing Domain
 * Handles transaction initialization and payment processing
 */

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_PUBLIC_KEY = process.env.PAYSTACK_PUBLIC_KEY;

export interface InitializeTransactionParams {
  email: string;
  amount: number; // in kobo (smallest currency unit)
  reference?: string;
  callback_url?: string;
  metadata?: Record<string, unknown>;
}

export interface InitializeTransactionResult {
  status: boolean;
  message: string;
  data: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

/**
 * Initialize a Paystack transaction
 */
export async function initializeTransaction(
  params: InitializeTransactionParams
): Promise<InitializeTransactionResult> {
  const { email, amount, reference, callback_url, metadata } = params;

  if (!PAYSTACK_SECRET_KEY) {
    throw new Error("PAYSTACK_SECRET_KEY is not configured");
  }

  const url = "https://api.paystack.co/transaction/initialize";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      amount,
      reference,
      callback_url,
      metadata,
    }),
  });

  const result = await response.json();

  if (!result.status) {
    throw new Error(result.message || "Failed to initialize transaction");
  }

  return result;
}

/**
 * Verify a Paystack transaction
 */
export async function verifyTransaction(reference: string): Promise<any> {
  if (!PAYSTACK_SECRET_KEY) {
    throw new Error("PAYSTACK_SECRET_KEY is not configured");
  }

  const url = `https://api.paystack.co/transaction/verify/${reference}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
    },
  });

  const result = await response.json();

  if (!result.status) {
    throw new Error(result.message || "Failed to verify transaction");
  }

  return result;
}
