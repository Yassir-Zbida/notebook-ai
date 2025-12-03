import { openai } from '../config/openai.js';
import prisma from '../config/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class AIService {
  /**
   * Convert handwritten image to text using OpenAI Vision
   */
  static async convertImageToText(imagePath) {
    if (!openai) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      const imageBuffer = fs.readFileSync(imagePath);
      const base64Image = imageBuffer.toString('base64');

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extract all text from this handwritten notebook image. Preserve the structure, line breaks, and formatting as much as possible. Return only the extracted text without any additional commentary.',
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`,
                },
              },
            ],
          },
        ],
        max_tokens: 2000,
      });

      const extractedText = response.choices[0]?.message?.content || '';
      const tokensUsed = response.usage?.total_tokens || 0;

      return {
        text: extractedText,
        tokensUsed,
        cost: this.calculateCost(tokensUsed, 'vision'),
      };
    } catch (error) {
      console.error('OCR Error:', error);
      throw new Error(`Failed to extract text: ${error.message}`);
    }
  }

  /**
   * Clean and format extracted text
   */
  static async cleanText(text) {
    if (!openai) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are a text cleaning assistant. Clean and format the following handwritten text. Fix grammar, spelling, and formatting. Preserve the original meaning and structure. Return only the cleaned text.',
          },
          {
            role: 'user',
            content: text,
          },
        ],
        max_tokens: 2000,
      });

      const cleanedText = response.choices[0]?.message?.content || text;
      const tokensUsed = response.usage?.total_tokens || 0;

      return {
        text: cleanedText,
        tokensUsed,
        cost: this.calculateCost(tokensUsed, 'text'),
      };
    } catch (error) {
      console.error('Text cleaning error:', error);
      throw new Error(`Failed to clean text: ${error.message}`);
    }
  }

  /**
   * Generate summary of text
   */
  static async summarizeText(text, type = 'short') {
    if (!openai) {
      throw new Error('OpenAI API key not configured');
    }

    const prompts = {
      short: 'Provide a brief 2-3 sentence summary of the following text:',
      bullets: 'Summarize the following text as bullet points:',
      keyIdeas: 'Extract the key ideas and main points from the following text:',
    };

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: prompts[type] || prompts.short,
          },
          {
            role: 'user',
            content: text,
          },
        ],
        max_tokens: 1000,
      });

      const summary = response.choices[0]?.message?.content || '';
      const tokensUsed = response.usage?.total_tokens || 0;

      return {
        summary,
        tokensUsed,
        cost: this.calculateCost(tokensUsed, 'text'),
      };
    } catch (error) {
      console.error('Summarization error:', error);
      throw new Error(`Failed to summarize text: ${error.message}`);
    }
  }

  /**
   * Rewrite text in different styles
   */
  static async rewriteText(text, style = 'professional') {
    if (!openai) {
      throw new Error('OpenAI API key not configured');
    }

    const prompts = {
      professional:
        'Rewrite the following text in a professional, formal tone while preserving all key information:',
      studyNotes:
        'Rewrite the following text as concise study notes, focusing on key concepts and facts:',
      bullets: 'Rewrite the following text as well-organized bullet points:',
    };

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: prompts[style] || prompts.professional,
          },
          {
            role: 'user',
            content: text,
          },
        ],
        max_tokens: 2000,
      });

      const rewritten = response.choices[0]?.message?.content || text;
      const tokensUsed = response.usage?.total_tokens || 0;

      return {
        text: rewritten,
        tokensUsed,
        cost: this.calculateCost(tokensUsed, 'text'),
      };
    } catch (error) {
      console.error('Rewrite error:', error);
      throw new Error(`Failed to rewrite text: ${error.message}`);
    }
  }

  /**
   * Generate title for note
   */
  static async generateTitle(text) {
    if (!openai) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'Generate a concise, descriptive title (3-8 words) for the following text. Return only the title, nothing else:',
          },
          {
            role: 'user',
            content: text.substring(0, 1000), // Use first 1000 chars for title generation
          },
        ],
        max_tokens: 50,
      });

      const title = response.choices[0]?.message?.content?.trim().replace(/['"]/g, '') || 'Untitled Note';
      const tokensUsed = response.usage?.total_tokens || 0;

      return {
        title,
        tokensUsed,
        cost: this.calculateCost(tokensUsed, 'text'),
      };
    } catch (error) {
      console.error('Title generation error:', error);
      throw new Error(`Failed to generate title: ${error.message}`);
    }
  }

  /**
   * Generate tags for note
   */
  static async generateTags(text) {
    if (!openai) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'Analyze the following text and generate 3-5 relevant tags (single words or short phrases). Return only a comma-separated list of tags, nothing else:',
          },
          {
            role: 'user',
            content: text.substring(0, 1500),
          },
        ],
        max_tokens: 100,
      });

      const tagsString = response.choices[0]?.message?.content?.trim() || '';
      const tags = tagsString
        .split(',')
        .map((tag) => tag.trim().toLowerCase())
        .filter((tag) => tag.length > 0)
        .slice(0, 5);

      const tokensUsed = response.usage?.total_tokens || 0;

      return {
        tags,
        tokensUsed,
        cost: this.calculateCost(tokensUsed, 'text'),
      };
    } catch (error) {
      console.error('Tag generation error:', error);
      throw new Error(`Failed to generate tags: ${error.message}`);
    }
  }

  /**
   * Track AI usage
   */
  static async trackUsage(userId, operation, tokensUsed, cost, noteId = null, metadata = {}) {
    try {
      await prisma.aIUsage.create({
        data: {
          userId,
          noteId,
          operation,
          tokensUsed,
          cost,
          metadata,
        },
      });
    } catch (error) {
      console.error('Failed to track AI usage:', error);
      // Don't throw - usage tracking failure shouldn't break the operation
    }
  }

  /**
   * Calculate cost based on tokens and model type
   */
  static calculateCost(tokens, type = 'text') {
    // Approximate costs (as of 2024)
    // GPT-4o-mini: $0.15/$0.60 per 1M tokens (input/output)
    // Vision: $2.50/$10 per 1M tokens (input/output)
    const costs = {
      text: {
        input: 0.15 / 1000000,
        output: 0.6 / 1000000,
      },
      vision: {
        input: 2.5 / 1000000,
        output: 10 / 1000000,
      },
    };

    // Rough estimate: assume 70% input, 30% output
    const inputTokens = tokens * 0.7;
    const outputTokens = tokens * 0.3;
    const costType = costs[type] || costs.text;

    return inputTokens * costType.input + outputTokens * costType.output;
  }

  /**
   * Check if user has exceeded usage limits
   */
  static async checkUsageLimit(userId, planType) {
    if (planType === 'PRO') {
      return { allowed: true }; // Unlimited for Pro
    }

    // Free plan: 10 conversions per month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const usageCount = await prisma.aIUsage.count({
      where: {
        userId,
        operation: 'ocr',
        createdAt: {
          gte: startOfMonth,
        },
      },
    });

    const limit = 10; // Free plan limit
    return {
      allowed: usageCount < limit,
      used: usageCount,
      limit,
    };
  }
}

