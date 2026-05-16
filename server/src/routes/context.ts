// server/src/routes/context.ts
import { Router } from 'express';
import { getContext } from '../controllers/context.controller.js'; // Import the function we just fixed
import { handleGithubWebhook } from '../controllers/webhook.controller.js';

const router: Router = Router();

router.get('/', getContext);
router.post('/webhooks/github', handleGithubWebhook);

export default router;