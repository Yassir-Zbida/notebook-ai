import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import prisma from '../config/database.js';
import { contactUpload } from '../middleware/contactUpload.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

router.post('/', contactUpload.single('attachment'), async (req, res, next) => {
  try {
    // Handle both JSON and FormData
    const name = req.body.name;
    const email = req.body.email;
    const inquiryType = req.body.inquiryType || req.body.subject || '';
    const message = req.body.message;
    const attachmentUrl = req.file ? `/uploads/contact/${req.file.filename}` : null;

    if (!name || !email || !message) {
      // Clean up uploaded file if validation fails
      if (req.file) {
        const filePath = path.join(__dirname, '../../uploads/contact', req.file.filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
      return res.status(400).json({ message: 'Name, email and message are required' });
    }

    await prisma.contactRequest.create({
      data: {
        name,
        email,
        subject: inquiryType || '',
        message,
        attachmentUrl: attachmentUrl || undefined,
      },
    });

    return res.status(201).json({ message: 'Contact request received' });
  } catch (error) {
    // Clean up uploaded file if database operation fails
    if (req.file) {
      const filePath = path.join(__dirname, '../../uploads/contact', req.file.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    next(error);
  }
});

export default router;


