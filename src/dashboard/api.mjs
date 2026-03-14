import { Router } from 'express';

export function createStatsRouter(storage) {
  const router = Router();
  
  router.get('/', async (req, res) => {
    const stats = await storage.getStats();
    res.json(stats);
  });

  return router;
}
