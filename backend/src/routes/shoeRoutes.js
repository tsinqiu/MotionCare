const express = require('express');
const { asyncHandler, parsePositiveId } = require('../http');
const { authenticate } = require('../middleware/authMiddleware');

function createShoeRouter(shoeService, authService) {
  const router = express.Router();

  router.get('/shoes', authenticate(authService), asyncHandler(async (req, res) => {
    const items = await shoeService.list(req.user.id);
    res.json(items);
  }));

  router.post('/shoes', authenticate(authService), asyncHandler(async (req, res) => {
    const shoe = await shoeService.create(req.user.id, req.body);
    res.status(201).json(shoe);
  }));

  router.patch('/shoes/:id', authenticate(authService), asyncHandler(async (req, res) => {
    await shoeService.updateShoe(req.user.id, parsePositiveId(req.params.id), req.body);
    res.json({ ok: true });
  }));

  router.delete('/shoes/:id', authenticate(authService), asyncHandler(async (req, res) => {
    await shoeService.remove(req.user.id, parsePositiveId(req.params.id));
    res.json({ ok: true });
  }));

  router.post('/activities/:id/shoe', authenticate(authService), asyncHandler(async (req, res) => {
    await shoeService.bindActivity(req.user.id, parsePositiveId(req.params.id), req.body.shoeId || null);
    res.json({ ok: true });
  }));

  return router;
}

module.exports = createShoeRouter;
