import prisma from '../config/database.js';
import { PLANS } from '../config/stripe.js';

export class UsageService {
  /**
   * Get user's current subscription and plan
   */
  static async getUserPlan(userId) {
    const subscription = await prisma.subscription.findFirst({
      where: {
        userId,
        deletedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const planType = subscription?.planType || 'FREE';
    return {
      planType,
      subscription,
      plan: PLANS[planType],
    };
  }

  /**
   * Check if user can create more notes
   */
  static async canCreateNote(userId) {
    const { plan } = await this.getUserPlan(userId);

    if (plan.features.notesLimit === -1) {
      return { allowed: true }; // Unlimited
    }

    const noteCount = await prisma.note.count({
      where: {
        userId,
        deletedAt: null,
      },
    });

    return {
      allowed: noteCount < plan.features.notesLimit,
      used: noteCount,
      limit: plan.features.notesLimit,
    };
  }

  /**
   * Get user's AI usage for current month
   */
  static async getMonthlyUsage(userId) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const usage = await prisma.aIUsage.findMany({
      where: {
        userId,
        createdAt: {
          gte: startOfMonth,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const totalTokens = usage.reduce((sum, u) => sum + u.tokensUsed, 0);
    const totalCost = usage.reduce((sum, u) => sum + u.cost, 0);

    const byOperation = usage.reduce((acc, u) => {
      acc[u.operation] = (acc[u.operation] || 0) + 1;
      return acc;
    }, {});

    return {
      total: usage.length,
      totalTokens,
      totalCost,
      byOperation,
      usage,
    };
  }

  /**
   * Get user statistics
   */
  static async getUserStats(userId) {
    const [noteCount, folderCount, monthlyUsage, { plan }] = await Promise.all([
      prisma.note.count({
        where: { userId, deletedAt: null },
      }),
      prisma.notebookFolder.count({
        where: { userId, deletedAt: null },
      }),
      this.getMonthlyUsage(userId),
      this.getUserPlan(userId),
    ]);

    return {
      notes: noteCount,
      folders: folderCount,
      monthlyUsage,
      plan: plan.name,
      planType: plan.features,
    };
  }
}

