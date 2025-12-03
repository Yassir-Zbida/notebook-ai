import prisma from '../config/database.js';
import { UsageService } from '../services/usageService.js';

export class TagController {
  /**
   * Get all tags
   */
  static async getTags(req, res, next) {
    try {
      const tags = await prisma.tag.findMany({
        include: {
          _count: {
            select: { notes: true },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      res.json({ tags });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Add tag to note
   */
  static async addTagToNote(req, res, next) {
    try {
      const { noteId } = req.params;
      const { tagName } = req.body;
      const userId = req.user.id;

      const { plan } = await UsageService.getUserPlan(userId);
      if (!plan.features.tags) {
        return res.status(403).json({ error: 'Tags feature requires Pro subscription' });
      }

      // Verify note belongs to user
      const note = await prisma.note.findFirst({
        where: {
          id: noteId,
          userId,
          deletedAt: null,
        },
      });

      if (!note) {
        return res.status(404).json({ error: 'Note not found' });
      }

      // Find or create tag
      let tag = await prisma.tag.findUnique({
        where: { name: tagName.toLowerCase() },
      });

      if (!tag) {
        tag = await prisma.tag.create({
          data: { name: tagName.toLowerCase() },
        });
      }

      // Check if tag already exists on note
      const existing = await prisma.noteTag.findUnique({
        where: {
          noteId_tagId: {
            noteId,
            tagId: tag.id,
          },
        },
      });

      if (existing) {
        return res.status(400).json({ error: 'Tag already exists on note' });
      }

      // Add tag to note
      await prisma.noteTag.create({
        data: {
          noteId,
          tagId: tag.id,
        },
      });

      res.json({ message: 'Tag added successfully' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Remove tag from note
   */
  static async removeTagFromNote(req, res, next) {
    try {
      const { noteId, tagId } = req.params;
      const userId = req.user.id;

      // Verify note belongs to user
      const note = await prisma.note.findFirst({
        where: {
          id: noteId,
          userId,
          deletedAt: null,
        },
      });

      if (!note) {
        return res.status(404).json({ error: 'Note not found' });
      }

      await prisma.noteTag.deleteMany({
        where: {
          noteId,
          tagId,
        },
      });

      res.json({ message: 'Tag removed successfully' });
    } catch (error) {
      next(error);
    }
  }
}

