import { stripe, PLANS } from '../config/stripe.js';
import prisma from '../config/database.js';

export class BillingController {
  /**
   * Create Stripe checkout session
   */
  static async createCheckoutSession(req, res, next) {
    try {
      if (!stripe) {
        return res.status(503).json({ error: 'Stripe is not configured. Please set STRIPE_SECRET_KEY in environment variables.' });
      }

      const userId = req.user.id;
      const { planType = 'PRO', billingCycle = 'monthly' } = req.body;

      // Currently only PRO is supported, but accept other plan types for future expansion
      const validPlanTypes = ['BASIC', 'PRO', 'PREMIUM'];
      if (!validPlanTypes.includes(planType)) {
        return res.status(400).json({ error: 'Invalid plan type' });
      }

      // Map frontend plan types to backend plan types
      const backendPlanType = planType === 'BASIC' || planType === 'PREMIUM' ? 'PRO' : planType;
      const plan = PLANS[backendPlanType];
      
      if (!plan.priceId) {
        return res.status(500).json({ error: 'Plan price ID not configured. Please set STRIPE_PRO_PRICE_ID in environment variables.' });
      }

      // Get or create Stripe customer
      let subscription = await prisma.subscription.findFirst({
        where: {
          userId,
          deletedAt: null,
        },
      });

      let customerId = subscription?.stripeCustomerId;

      if (!customerId) {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { email: true, name: true },
        });

        const customer = await stripe.customers.create({
          email: user.email,
          name: user.name,
          metadata: {
            userId,
          },
        });

        customerId = customer.id;

        if (subscription) {
          await prisma.subscription.update({
            where: { id: subscription.id },
            data: { stripeCustomerId: customerId },
          });
        } else {
          subscription = await prisma.subscription.create({
            data: {
              userId,
              stripeCustomerId: customerId,
              planType: 'FREE',
              status: 'ACTIVE',
            },
          });
        }
      }

      // Create checkout session
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [
          {
            price: plan.priceId,
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: `${process.env.FRONTEND_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL}/checkout?plan=${planType}&cycle=${billingCycle}`,
        metadata: {
          userId,
          planType: backendPlanType,
          originalPlanType: planType,
          billingCycle,
        },
      });

      res.json({
        sessionId: session.id,
        url: session.url,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create checkout session for guests (no authentication required)
   */
  static async createGuestCheckoutSession(req, res, next) {
    try {
      if (!stripe) {
        return res.status(503).json({ error: 'Stripe is not configured. Please set STRIPE_SECRET_KEY in environment variables.' });
      }

      const { planType = 'PRO', billingCycle = 'monthly', email } = req.body;

      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }

      // Currently only PRO is supported, but accept other plan types for future expansion
      const validPlanTypes = ['BASIC', 'PRO', 'PREMIUM'];
      if (!validPlanTypes.includes(planType)) {
        return res.status(400).json({ error: 'Invalid plan type' });
      }

      // Map frontend plan types to backend plan types
      const backendPlanType = planType === 'BASIC' || planType === 'PREMIUM' ? 'PRO' : planType;
      const plan = PLANS[backendPlanType];
      
      if (!plan.priceId) {
        return res.status(500).json({ error: 'Plan price ID not configured. Please set STRIPE_PRO_PRICE_ID in environment variables.' });
      }

      // Check if user exists with this email
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      let customerId = null;
      let userId = null;

      // If user exists, use their Stripe customer ID
      if (existingUser) {
        userId = existingUser.id;
        const subscription = await prisma.subscription.findFirst({
          where: {
            userId: existingUser.id,
            deletedAt: null,
          },
        });
        customerId = subscription?.stripeCustomerId;
      }

      // Create or get Stripe customer
      if (!customerId) {
        const customer = await stripe.customers.create({
          email,
          metadata: {
            userId: userId || 'pending',
            planType: backendPlanType,
            originalPlanType: planType,
            billingCycle,
          },
        });
        customerId = customer.id;
      }

      // Create checkout session
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        customer_email: existingUser ? undefined : email, // Only set if new customer
        payment_method_types: ['card'],
        line_items: [
          {
            price: plan.priceId,
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: `${process.env.FRONTEND_URL}/register?session_id={CHECKOUT_SESSION_ID}&email=${encodeURIComponent(email)}`,
        cancel_url: `${process.env.FRONTEND_URL}/checkout?plan=${planType}&cycle=${billingCycle}`,
        metadata: {
          userId: userId || 'pending',
          email,
          planType: backendPlanType,
          originalPlanType: planType,
          billingCycle,
        },
        allow_promotion_codes: true,
      });

      res.json({
        sessionId: session.id,
        url: session.url,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create portal session for managing subscription
   */
  static async createPortalSession(req, res, next) {
    try {
      if (!stripe) {
        return res.status(503).json({ error: 'Stripe is not configured. Please set STRIPE_SECRET_KEY in environment variables.' });
      }

      const userId = req.user.id;

      const subscription = await prisma.subscription.findFirst({
        where: {
          userId,
          deletedAt: null,
        },
      });

      if (!subscription?.stripeCustomerId) {
        return res.status(404).json({ error: 'No subscription found' });
      }

      const session = await stripe.billingPortal.sessions.create({
        customer: subscription.stripeCustomerId,
        return_url: `${process.env.FRONTEND_URL}/billing`,
      });

      res.json({
        url: session.url,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get user's billing information
   */
  static async getBillingInfo(req, res, next) {
    try {
      const userId = req.user.id;

      const subscription = await prisma.subscription.findFirst({
        where: {
          userId,
          deletedAt: null,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      const payments = await prisma.paymentHistory.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      const plan = subscription ? PLANS[subscription.planType] : PLANS.FREE;

      res.json({
        subscription: subscription
          ? {
              planType: subscription.planType,
              status: subscription.status,
              currentPeriodStart: subscription.currentPeriodStart,
              currentPeriodEnd: subscription.currentPeriodEnd,
              cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            }
          : null,
        plan,
        recentPayments: payments,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Handle Stripe webhook
   */
  static async handleWebhook(req, res, next) {
    if (!stripe) {
      return res.status(503).json({ error: 'Stripe is not configured' });
    }

    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          await this.handleCheckoutCompleted(session);
          break;
        }

        case 'customer.subscription.created':
        case 'customer.subscription.updated': {
          const subscription = event.data.object;
          await this.handleSubscriptionUpdate(subscription);
          break;
        }

        case 'customer.subscription.deleted': {
          const subscription = event.data.object;
          await this.handleSubscriptionDeleted(subscription);
          break;
        }

        case 'invoice.payment_succeeded': {
          const invoice = event.data.object;
          await this.handlePaymentSucceeded(invoice);
          break;
        }

        case 'invoice.payment_failed': {
          const invoice = event.data.object;
          await this.handlePaymentFailed(invoice);
          break;
        }

        default:
          console.log(`Unhandled event type: ${event.type}`);
      }

      res.json({ received: true });
    } catch (error) {
      console.error('Webhook handler error:', error);
      next(error);
    }
  }

  static async handleCheckoutCompleted(session) {
    const userId = session.metadata?.userId;
    const email = session.metadata?.email || session.customer_email;
    
    if (!userId && !email) return;

    const subscription = await stripe.subscriptions.retrieve(session.subscription);
    
    // If userId is 'pending', we'll link it when user registers
    // Store subscription info with email for now
    if (userId === 'pending' || !userId) {
      // Store in a temporary table or use customer metadata
      // For now, we'll update when user registers - subscription is already created in Stripe
      return; // User will link account during registration
    }

    await prisma.subscription.updateMany({
      where: { userId },
      data: { deletedAt: new Date() },
    });

    await prisma.subscription.create({
      data: {
        userId,
        stripeCustomerId: session.customer,
        stripeSubscriptionId: subscription.id,
        planType: 'PRO',
        status: subscription.status === 'active' ? 'ACTIVE' : 'INCOMPLETE',
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      },
    });

    await prisma.user.update({
      where: { id: userId },
      data: { role: 'PRO' },
    });
  }

  static async handleSubscriptionUpdate(subscription) {
    const dbSubscription = await prisma.subscription.findUnique({
      where: { stripeSubscriptionId: subscription.id },
    });

    if (!dbSubscription) return;

    await prisma.subscription.update({
      where: { id: dbSubscription.id },
      data: {
        status:
          subscription.status === 'active'
            ? 'ACTIVE'
            : subscription.status === 'canceled'
            ? 'CANCELED'
            : subscription.status === 'past_due'
            ? 'PAST_DUE'
            : 'INCOMPLETE',
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      },
    });
  }

  static async handleSubscriptionDeleted(subscription) {
    const dbSubscription = await prisma.subscription.findUnique({
      where: { stripeSubscriptionId: subscription.id },
    });

    if (!dbSubscription) return;

    await prisma.subscription.update({
      where: { id: dbSubscription.id },
      data: {
        status: 'CANCELED',
        planType: 'FREE',
      },
    });

    await prisma.user.update({
      where: { id: dbSubscription.userId },
      data: { role: 'USER' },
    });
  }

  static async handlePaymentSucceeded(invoice) {
    const subscription = await prisma.subscription.findUnique({
      where: { stripeSubscriptionId: invoice.subscription },
    });

    if (!subscription) return;

    await prisma.paymentHistory.create({
      data: {
        userId: subscription.userId,
        stripePaymentId: invoice.payment_intent,
        amount: invoice.amount_paid / 100,
        currency: invoice.currency,
        planType: subscription.planType,
        status: 'succeeded',
        metadata: {
          invoiceId: invoice.id,
          subscriptionId: invoice.subscription,
        },
      },
    });
  }

  static async handlePaymentFailed(invoice) {
    const subscription = await prisma.subscription.findUnique({
      where: { stripeSubscriptionId: invoice.subscription },
    });

    if (!subscription) return;

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'PAST_DUE' },
    });
  }
}

