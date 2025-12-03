import express from 'express';
import { AdminController } from '../controllers/adminController.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);
router.use(requireRole('ADMIN'));

router.get('/dashboard', AdminController.getDashboardStats);
router.get('/users', AdminController.getUsers);
router.get('/users/:id', AdminController.getUserDetails);
router.put('/users/:id/role', AdminController.updateUserRole);
router.get('/ai-usage', AdminController.getAIUsageStats);
router.get('/logs', AdminController.getAdminLogs);

export default router;

