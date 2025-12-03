import prisma from '../config/database.js';
import { UsageService } from '../services/usageService.js';

export class FolderController {
  /**
   * Get all folders for user
   */
  static async getFolders(req, res, next) {
    try {
      const userId = req.user.id;

      const { plan } = await UsageService.getUserPlan(userId);
      if (!plan.features.folders) {
        return res.status(403).json({ error: 'Folders feature requires Pro subscription' });
      }

      const folders = await prisma.notebookFolder.findMany({
        where: {
          userId,
          deletedAt: null,
        },
        include: {
          _count: {
            select: { notes: true },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      res.json({ folders });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create folder
   */
  static async createFolder(req, res, next) {
    try {
      const userId = req.user.id;
      const { name, color, description } = req.body;

      const { plan } = await UsageService.getUserPlan(userId);
      if (!plan.features.folders) {
        return res.status(403).json({ error: 'Folders feature requires Pro subscription' });
      }

      if (!name) {
        return res.status(400).json({ error: 'Folder name is required' });
      }

      const folder = await prisma.notebookFolder.create({
        data: {
          userId,
          name,
          color: color || '#3b82f6',
          description,
        },
      });

      res.status(201).json({
        message: 'Folder created successfully',
        folder,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update folder
   */
  static async updateFolder(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const { name, color, description } = req.body;

      const folder = await prisma.notebookFolder.findFirst({
        where: {
          id,
          userId,
          deletedAt: null,
        },
      });

      if (!folder) {
        return res.status(404).json({ error: 'Folder not found' });
      }

      const updatedFolder = await prisma.notebookFolder.update({
        where: { id },
        data: {
          ...(name && { name }),
          ...(color && { color }),
          ...(description !== undefined && { description }),
        },
      });

      res.json({
        message: 'Folder updated successfully',
        folder: updatedFolder,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete folder
   */
  static async deleteFolder(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const folder = await prisma.notebookFolder.findFirst({
        where: {
          id,
          userId,
          deletedAt: null,
        },
      });

      if (!folder) {
        return res.status(404).json({ error: 'Folder not found' });
      }

      await prisma.notebookFolder.update({
        where: { id },
        data: {
          deletedAt: new Date(),
        },
      });

      // Remove folder from notes (set to null)
      await prisma.note.updateMany({
        where: { folderId: id },
        data: { folderId: null },
      });

      res.json({ message: 'Folder deleted successfully' });
    } catch (error) {
      next(error);
    }
  }
}

