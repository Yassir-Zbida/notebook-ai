import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('STRIPE_SECRET_KEY is not set. Billing features will not work.');
}

export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2024-06-20.acacia',
    })
  : null;

export const PLANS = {
  FREE: {
    name: 'Free',
    price: 0,
    priceId: null,
    features: {
      conversionsPerMonth: 10,
      notesLimit: 20,
      aiFeatures: false,
      exportFormats: [],
      folders: false,
      tags: false,
    },
  },
  PRO: {
    name: 'Pro',
    price: 12.99,
    priceId: process.env.STRIPE_PRO_PRICE_ID || 'price_pro_monthly', // Set this in Stripe dashboard
    features: {
      conversionsPerMonth: -1, // Unlimited
      notesLimit: -1, // Unlimited
      aiFeatures: true,
      exportFormats: ['pdf', 'txt', 'markdown'],
      folders: true,
      tags: true,
    },
  },
};

