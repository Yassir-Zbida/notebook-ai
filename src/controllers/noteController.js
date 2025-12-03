import prisma from '../config/database.js';
import { AIService } from '../services/aiService.js';
import { UsageService } from '../services/usageService.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class NoteController {
  /**
   * Get all notes for user
   */
  static async getNotes(req, res, next) {
    try {
      const { folderId, tagId, search, page = 1, limit = 20 } = req.query;
      const userId = req.user.id;

      const where = {
        userId,
        deletedAt: null,
        ...(folderId && { folderId }),
        ...(tagId && {
          tags: {
            some: {
              tagId,
            },
          },
        }),
        ...(search && {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { content: { contains: search, mode: 'insensitive' } },
          ],
        }),
      };

      const [notes, total] = await Promise.all([
        prisma.note.findMany({
          where,
          include: {
            folder: {
              select: {
                id: true,
                name: true,
                color: true,
              },
            },
            tags: {
              include: {
                tag: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
          skip: (parseInt(page) - 1) * parseInt(limit),
          take: parseInt(limit),
        }),
        prisma.note.count({ where }),
      ]);

      res.json({
        notes,
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
   * Get single note
   */
  static async getNote(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const note = await prisma.note.findFirst({
        where: {
          id,
          userId,
          deletedAt: null,
        },
        include: {
          folder: true,
          tags: {
            include: {
              tag: true,
            },
          },
        },
      });

      if (!note) {
        return res.status(404).json({ error: 'Note not found' });
      }

      res.json({ note });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create note from uploaded image
   */
  static async createNote(req, res, next) {
    try {
      const userId = req.user.id;
      const { folderId } = req.body;

      // Check usage limits
      const { plan } = await UsageService.getUserPlan(userId);
      const canCreate = await UsageService.canCreateNote(userId);

      if (!canCreate.allowed) {
        return res.status(403).json({
          error: 'Note limit reached',
          message: `You have reached your limit of ${canCreate.limit} notes. Upgrade to Pro for unlimited notes.`,
        });
      }

      // Check AI usage limit
      const usageCheck = await AIService.checkUsageLimit(userId, plan.planType);
      if (!usageCheck.allowed) {
        return res.status(403).json({
          error: 'Conversion limit reached',
          message: `You have used ${usageCheck.used}/${usageCheck.limit} conversions this month. Upgrade to Pro for unlimited conversions.`,
        });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'Image file is required' });
      }

      const imagePath = req.file.path;

      // Extract text using AI
      const { text: extractedText, tokensUsed, cost } = await AIService.convertImageToText(
        imagePath
      );

      // Track usage
      await AIService.trackUsage(userId, 'ocr', tokensUsed, cost, null, {
        imageSize: req.file.size,
      });

      // Generate title
      const { title: generatedTitle, tokensUsed: titleTokens, cost: titleCost } =
        await AIService.generateTitle(extractedText);
      await AIService.trackUsage(userId, 'title', titleTokens, titleCost);

      // Generate tags (only for Pro)
      let tags = [];
      if (plan.planType === 'PRO') {
        const { tags: generatedTags, tokensUsed: tagTokens, cost: tagCost } =
          await AIService.generateTags(extractedText);
        tags = generatedTags;
        await AIService.trackUsage(userId, 'tags', tagTokens, tagCost);
      }

      // Create note
      const note = await prisma.note.create({
        data: {
          userId,
          folderId: folderId || null,
          title: generatedTitle,
          content: extractedText,
          originalText: extractedText,
          imageUrl: `/uploads/${req.file.filename}`,
        },
        include: {
          folder: true,
          tags: {
            include: {
              tag: true,
            },
          },
        },
      });

      // Create tags if generated
      if (tags.length > 0) {
        for (const tagName of tags) {
          let tag = await prisma.tag.findUnique({
            where: { name: tagName },
          });

          if (!tag) {
            tag = await prisma.tag.create({
              data: { name: tagName },
            });
          }

          await prisma.noteTag.create({
            data: {
              noteId: note.id,
              tagId: tag.id,
            },
          });
        }
      }

      // Reload note with tags
      const noteWithTags = await prisma.note.findUnique({
        where: { id: note.id },
        include: {
          folder: true,
          tags: {
            include: {
              tag: true,
            },
          },
        },
      });

      res.status(201).json({
        message: 'Note created successfully',
        note: noteWithTags,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update note
   */
  static async updateNote(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const { title, content, folderId } = req.body;

      const note = await prisma.note.findFirst({
        where: {
          id,
          userId,
          deletedAt: null,
        },
      });

      if (!note) {
        return res.status(404).json({ error: 'Note not found' });
      }

      const updatedNote = await prisma.note.update({
        where: { id },
        data: {
          ...(title && { title }),
          ...(content && { content }),
          ...(folderId !== undefined && { folderId }),
        },
        include: {
          folder: true,
          tags: {
            include: {
              tag: true,
            },
          },
        },
      });

      res.json({
        message: 'Note updated successfully',
        note: updatedNote,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete note (soft delete)
   */
  static async deleteNote(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const note = await prisma.note.findFirst({
        where: {
          id,
          userId,
          deletedAt: null,
        },
      });

      if (!note) {
        return res.status(404).json({ error: 'Note not found' });
      }

      await prisma.note.update({
        where: { id },
        data: {
          deletedAt: new Date(),
        },
      });

      res.json({ message: 'Note deleted successfully' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Clean note text using AI
   */
  static async cleanNote(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const { plan } = await UsageService.getUserPlan(userId);
      if (plan.planType !== 'PRO') {
        return res.status(403).json({ error: 'Pro subscription required' });
      }

      const note = await prisma.note.findFirst({
        where: {
          id,
          userId,
          deletedAt: null,
        },
      });

      if (!note) {
        return res.status(404).json({ error: 'Note not found' });
      }

      const { text: cleanedText, tokensUsed, cost } = await AIService.cleanText(note.content);

      await AIService.trackUsage(userId, 'clean', tokensUsed, cost, id);

      const updatedNote = await prisma.note.update({
        where: { id },
        data: {
          cleanedText,
        },
      });

      res.json({
        message: 'Text cleaned successfully',
        note: updatedNote,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Summarize note
   */
  static async summarizeNote(req, res, next) {
    try {
      const { id } = req.params;
      const { type = 'short' } = req.query;
      const userId = req.user.id;

      const { plan } = await UsageService.getUserPlan(userId);
      if (plan.planType !== 'PRO') {
        return res.status(403).json({ error: 'Pro subscription required' });
      }

      const note = await prisma.note.findFirst({
        where: {
          id,
          userId,
          deletedAt: null,
        },
      });

      if (!note) {
        return res.status(404).json({ error: 'Note not found' });
      }

      const { summary, tokensUsed, cost } = await AIService.summarizeText(note.content, type);

      await AIService.trackUsage(userId, 'summarize', tokensUsed, cost, id, { type });

      const updatedNote = await prisma.note.update({
        where: { id },
        data: {
          summary,
        },
      });

      res.json({
        message: 'Note summarized successfully',
        note: updatedNote,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Rewrite note
   */
  static async rewriteNote(req, res, next) {
    try {
      const { id } = req.params;
      const { style = 'professional' } = req.body;
      const userId = req.user.id;

      const { plan } = await UsageService.getUserPlan(userId);
      if (plan.planType !== 'PRO') {
        return res.status(403).json({ error: 'Pro subscription required' });
      }

      const note = await prisma.note.findFirst({
        where: {
          id,
          userId,
          deletedAt: null,
        },
      });

      if (!note) {
        return res.status(404).json({ error: 'Note not found' });
      }

      const { text: rewritten, tokensUsed, cost } = await AIService.rewriteText(
        note.content,
        style
      );

      await AIService.trackUsage(userId, 'rewrite', tokensUsed, cost, id, { style });

      const updatedNote = await prisma.note.update({
        where: { id },
        data: {
          content: rewritten,
        },
      });

      res.json({
        message: 'Note rewritten successfully',
        note: updatedNote,
      });
    } catch (error) {
      next(error);
    }
  }
}

