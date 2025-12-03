import { UsageService } from '../services/usageService.js';

export class StatsController {
  /**
   * Get user stats
   */
  static async getUserStats(req, res, next) {
    try {
      const userId = req.user.id;
      const stats = await UsageService.getUserStats(userId);

      res.json({ stats });
    } catch (error) {
      next(error);
    }
  }
}

