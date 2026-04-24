/**
 * Paystack Payment Integration
 * 
 * Server-side utility for Paystack payment processing
 * Uses PAYSTACK_SECRET_KEY from environment variables
 */

export interface PaystackInitializeParams {
  email: string;
  amount: number; // Amount in kobo (smallest currency unit)
  reference?: string;
  callback_url?: string;
  metadata?: Record<string, unknown>;
}

export interface PaystackResponse {
  status: boolean;
  message: string;
  data: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_API_URL = 'https://api.paystack.co';

/**
 * Initialize a Paystack transaction
 */
export async function initializeTransaction(params: PaystackInitializeParams): Promise<PaystackResponse> {
  if (!PAYSTACK_SECRET_KEY) {
    throw new Error('PAYSTACK_SECRET_KEY is not set');
  }

  const response = await fetch(`${PAYSTACK_API_URL}/transaction/initialize`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Paystack API error: ${error}`);
  }

  return response.json();
}

/**
 * Verify a Paystack transaction
 */
export async function verifyTransaction(reference: string): Promise<PaystackResponse> {
  if (!PAYSTACK_SECRET_KEY) {
    throw new Error('PAYSTACK_SECRET_KEY is not set');
  }

  const response = await fetch(`${PAYSTACK_API_URL}/transaction/verify/${reference}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Paystack API error: ${error}`);
  }

  return response.json();
}
