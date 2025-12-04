import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Routes
import authRoutes from './routes/auth.js';
import noteRoutes from './routes/notes.js';
import billingRoutes from './routes/billing.js';
import folderRoutes from './routes/folders.js';
import tagRoutes from './routes/tags.js';
import statsRoutes from './routes/stats.js';
import contactRoutes from './routes/contact.js';
import adminRoutes from './routes/admin.js';

// Middleware
import { errorHandler, notFound } from './middleware/errorHandler.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middleware - CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // Allow localhost for development
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return callback(null, true);
    }

    // Allow all subdomains of notebook-ai.co
    // This includes: sa.notebook-ai.co, www.notebook-ai.co, api.notebook-ai.co, etc.
    const notebookAiSubdomainPattern = /^https?:\/\/(.*\.)?notebook-ai\.co(:[0-9]+)?$/;

    // Allow notebooklistai.com (main marketing app) and its subdomains
    // e.g. https://notebooklistai.com, https://www.notebooklistai.com
    const notebookListAiPattern = /^https?:\/\/(.*\.)?notebooklistai\.com(:[0-9]+)?$/;

    if (notebookAiSubdomainPattern.test(origin) || notebookListAiPattern.test(origin)) {
      return callback(null, true);
    }

    // Also allow FRONTEND_URL if set (explicit override)
    if (process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL) {
      return callback(null, true);
    }

    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/folders', folderRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/contact', contactRoutes);

// Error handling
app.use(notFound);
app.use(errorHandler);

export default app;

