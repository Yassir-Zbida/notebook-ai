import express from 'express';
import { AuthController } from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Register endpoint temporarily disabled
// router.post('/register', AuthController.register);
router.post('/login', AuthController.login);
router.post('/refresh', AuthController.refreshToken);
router.post('/google', AuthController.googleCallback);
router.get('/me', authenticate, AuthController.getMe);

export default router;

