import express from 'express';
import { StatsController } from '../controllers/statsController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

router.get('/', StatsController.getUserStats);

export default router;

