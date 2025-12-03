import express from 'express';
import { FolderController } from '../controllers/folderController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

router.get('/', FolderController.getFolders);
router.post('/', FolderController.createFolder);
router.put('/:id', FolderController.updateFolder);
router.delete('/:id', FolderController.deleteFolder);

export default router;

