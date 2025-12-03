import express from 'express';
import { BillingController } from '../controllers/billingController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Guest checkout (no auth required)
router.post('/checkout-guest', BillingController.createGuestCheckoutSession);

// Authenticated routes
router.use(authenticate);

router.post('/checkout', BillingController.createCheckoutSession);
router.post('/portal', BillingController.createPortalSession);
router.get('/', BillingController.getBillingInfo);

// Webhook (no auth required - uses Stripe signature)
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  BillingController.handleWebhook
);

export default router;

