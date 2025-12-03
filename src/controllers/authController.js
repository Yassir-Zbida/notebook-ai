import bcrypt from 'bcryptjs';
import { generateTokens } from '../utils/jwt.js';
import prisma from '../config/database.js';
import { AIService } from '../services/aiService.js';
import { stripe } from '../config/stripe.js';

export class AuthController {
  /**
   * Register new user
   */
  static async register(req, res, next) {
    try {
      const { email, password, name, sessionId } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      // Check if user exists
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        return res.status(400).json({ error: 'User already exists' });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      let stripeCustomerId = null;
      let stripeSubscriptionId = null;
      let planType = 'FREE';
      let subscriptionStatus = 'ACTIVE';
      let currentPeriodStart = null;
      let currentPeriodEnd = null;

      // If sessionId provided, link Stripe subscription
      if (sessionId && stripe) {
        try {
          const session = await stripe.checkout.sessions.retrieve(sessionId);
          
          if (session.payment_status === 'paid' && session.subscription) {
            const subscription = await stripe.subscriptions.retrieve(session.subscription);
            stripeCustomerId = session.customer;
            stripeSubscriptionId = subscription.id;
            planType = session.metadata?.planType || 'PRO';
            subscriptionStatus = subscription.status === 'active' ? 'ACTIVE' : 'INCOMPLETE';
            currentPeriodStart = new Date(subscription.current_period_start * 1000);
            currentPeriodEnd = new Date(subscription.current_period_end * 1000);
          }
        } catch (stripeError) {
          console.error('Error retrieving Stripe session:', stripeError);
          // Continue with FREE plan if Stripe lookup fails
        }
      }

      // Create user with subscription
      const user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
          role: planType === 'PRO' ? 'PRO' : 'USER',
          subscriptions: {
            create: {
              planType,
              status: subscriptionStatus,
              stripeCustomerId,
              stripeSubscriptionId,
              currentPeriodStart,
              currentPeriodEnd,
            },
          },
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
        },
      });

      const { accessToken, refreshToken } = generateTokens(user.id, user.email, user.role);

      res.status(201).json({
        message: 'User created successfully',
        user,
        tokens: {
          accessToken,
          refreshToken,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Login user
   */
  static async login(req, res, next) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user || user.deletedAt) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      if (!user.password) {
        return res.status(401).json({ error: 'Please use OAuth login' });
      }

      const isValidPassword = await bcrypt.compare(password, user.password);

      if (!isValidPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const { accessToken, refreshToken } = generateTokens(user.id, user.email, user.role);

      res.json({
        message: 'Login successful',
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        tokens: {
          accessToken,
          refreshToken,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Refresh access token
   */
  static async refreshToken(req, res, next) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({ error: 'Refresh token is required' });
      }

      const { verifyRefreshToken } = await import('../utils/jwt.js');
      const decoded = verifyRefreshToken(refreshToken);

      if (!decoded) {
        return res.status(401).json({ error: 'Invalid refresh token' });
      }

      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, email: true, role: true },
      });

      if (!user || user.deletedAt) {
        return res.status(401).json({ error: 'User not found' });
      }

      const { accessToken, refreshToken: newRefreshToken } = generateTokens(
        user.id,
        user.email,
        user.role
      );

      res.json({
        tokens: {
          accessToken,
          refreshToken: newRefreshToken,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get current user
   */
  static async getMe(req, res, next) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          role: true,
          emailVerified: true,
          createdAt: true,
        },
      });

      res.json({ user });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Google OAuth callback (simplified - implement full OAuth flow)
   */
  static async googleCallback(req, res, next) {
    try {
      // This is a simplified version
      // In production, implement full OAuth flow with passport-google-oauth20
      const { email, name, image, googleId } = req.body;

      let user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        user = await prisma.user.create({
          data: {
            email,
            name,
            image,
            role: 'USER',
            emailVerified: true,
            subscriptions: {
              create: {
                planType: 'FREE',
                status: 'ACTIVE',
              },
            },
          },
        });
      }

      const { accessToken, refreshToken } = generateTokens(user.id, user.email, user.role);

      res.json({
        message: 'Login successful',
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        tokens: {
          accessToken,
          refreshToken,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

