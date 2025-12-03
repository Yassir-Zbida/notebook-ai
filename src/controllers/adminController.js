import prisma from '../config/database.js';
import { UsageService } from '../services/usageService.js';

export class AdminController {
  /**
   * Get dashboard stats
   */
  static async getDashboardStats(req, res, next) {
    try {
      const [
        totalUsers,
        proUsers,
        totalNotes,
        totalFolders,
        monthlyAIUsage,
        recentPayments,
      ] = await Promise.all([
        prisma.user.count({ where: { deletedAt: null } }),
        prisma.user.count({ where: { role: 'PRO', deletedAt: null } }),
        prisma.note.count({ where: { deletedAt: null } }),
        prisma.notebookFolder.count({ where: { deletedAt: null } }),
        prisma.aIUsage.groupBy({
          by: ['operation'],
          where: {
            createdAt: {
              gte: new Date(new Date().setDate(1)),
            },
          },
          _count: true,
          _sum: {
            tokensUsed: true,
            cost: true,
          },
        }),
        prisma.paymentHistory.findMany({
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
          },
        }),
      ]);

      res.json({
        stats: {
          totalUsers,
          proUsers,
          freeUsers: totalUsers - proUsers,
          totalNotes,
          totalFolders,
        },
        aiUsage: monthlyAIUsage,
        recentPayments,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all users
   */
  static async getUsers(req, res, next) {
    try {
      const { page = 1, limit = 20, role, search } = req.query;

      const where = {
        deletedAt: null,
        ...(role && { role }),
        ...(search && {
          OR: [
            { email: { contains: search, mode: 'insensitive' } },
            { name: { contains: search, mode: 'insensitive' } },
          ],
        }),
      };

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            createdAt: true,
            subscriptions: {
              where: { deletedAt: null },
              take: 1,
              orderBy: { createdAt: 'desc' },
            },
            _count: {
              select: {
                notes: true,
                folders: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip: (parseInt(page) - 1) * parseInt(limit),
          take: parseInt(limit),
        }),
        prisma.user.count({ where }),
      ]);

      res.json({
        users,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get user details
   */
  static async getUserDetails(req, res, next) {
    try {
      const { id } = req.params;

      const user = await prisma.user.findUnique({
        where: { id },
        include: {
          subscriptions: {
            where: { deletedAt: null },
            orderBy: { createdAt: 'desc' },
          },
          _count: {
            select: {
              notes: true,
              folders: true,
              aiUsage: true,
            },
          },
        },
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const stats = await UsageService.getUserStats(id);

      res.json({
        user,
        stats,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update user role
   */
  static async updateUserRole(req, res, next) {
    try {
      const { id } = req.params;
      const { role } = req.body;
      const adminId = req.user.id;

      if (!['USER', 'PRO', 'ADMIN'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }

      const user = await prisma.user.findUnique({
        where: { id },
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      await prisma.user.update({
        where: { id },
        data: { role },
      });

      await prisma.adminLog.create({
        data: {
          adminId,
          action: 'UPDATE_USER_ROLE',
          targetType: 'user',
          targetId: id,
          details: {
            oldRole: user.role,
            newRole: role,
          },
        },
      });

      res.json({ message: 'User role updated successfully' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get AI usage stats
   */
  static async getAIUsageStats(req, res, next) {
    try {
      const { startDate, endDate } = req.query;

      const where = {
        ...(startDate && endDate && {
          createdAt: {
            gte: new Date(startDate),
            lte: new Date(endDate),
          },
        }),
      };

      const [totalUsage, byOperation, byUser] = await Promise.all([
        prisma.aIUsage.aggregate({
          where,
          _count: true,
          _sum: {
            tokensUsed: true,
            cost: true,
          },
        }),
        prisma.aIUsage.groupBy({
          by: ['operation'],
          where,
          _count: true,
          _sum: {
            tokensUsed: true,
            cost: true,
          },
        }),
        prisma.aIUsage.groupBy({
          by: ['userId'],
          where,
          _count: true,
          _sum: {
            tokensUsed: true,
            cost: true,
          },
          orderBy: {
            _count: {
              id: 'desc',
            },
          },
          take: 10,
        }),
      ]);

      res.json({
        total: totalUsage._count,
        totalTokens: totalUsage._sum.tokensUsed || 0,
        totalCost: totalUsage._sum.cost || 0,
        byOperation,
        topUsers: byUser,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get admin logs
   */
  static async getAdminLogs(req, res, next) {
    try {
      const { page = 1, limit = 50 } = req.query;

      const [logs, total] = await Promise.all([
        prisma.adminLog.findMany({
          include: {
            admin: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip: (parseInt(page) - 1) * parseInt(limit),
          take: parseInt(limit),
        }),
        prisma.adminLog.count(),
      ]);

      res.json({
        logs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

