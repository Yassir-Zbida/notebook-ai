import express from 'express';
import { NoteController } from '../controllers/noteController.js';
import { authenticate } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';

const router = express.Router();

router.use(authenticate);

router.get('/', NoteController.getNotes);
router.get('/:id', NoteController.getNote);
router.post('/', upload.single('image'), NoteController.createNote);
router.put('/:id', NoteController.updateNote);
router.delete('/:id', NoteController.deleteNote);
router.post('/:id/clean', NoteController.cleanNote);
router.post('/:id/summarize', NoteController.summarizeNote);
router.post('/:id/rewrite', NoteController.rewriteNote);

export default router;

