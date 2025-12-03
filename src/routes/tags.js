import express from 'express';
import { TagController } from '../controllers/tagController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.get('/', TagController.getTags);
router.use(authenticate);
router.post('/notes/:noteId', TagController.addTagToNote);
router.delete('/notes/:noteId/:tagId', TagController.removeTagFromNote);

export default router;

