const express = require('express');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const multer = require('multer');
const config = require('../config');
const { ApiError } = require('../errors');
const { asyncHandler, parsePositiveId } = require('../http');
const { authenticate } = require('../middleware/authMiddleware');
const { removeUploadedFile, validateUploadedFile } = require('../services/uploadSecurity');

fs.mkdirSync(config.uploads.shoeImagesDir, { recursive: true });

const shoeImageStorage = multer.diskStorage({
  destination(req, file, callback) {
    callback(null, config.uploads.shoeImagesDir);
  },
  filename(req, file, callback) {
    const extension = path.extname(file.originalname || '').slice(0, 16) || '.jpg';
    callback(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${extension}`);
  }
});

const uploadShoeImage = multer({
  storage: shoeImageStorage,
  limits: { fileSize: config.uploads.maxImageBytes },
  fileFilter(req, file, callback) {
    if (!String(file.mimetype || '').startsWith('image/')) {
      callback(new ApiError(400, 'image file is required', 'INVALID_UPLOAD'));
      return;
    }
    callback(null, true);
  }
});

function createShoeRouter(shoeService, authService) {
  const router = express.Router();

  router.get('/shoes', authenticate(authService), asyncHandler(async (req, res) => {
    const items = await shoeService.list(req.user.id);
    res.json(items);
  }));

  router.get('/shoes/:id', authenticate(authService), asyncHandler(async (req, res) => {
    const shoe = await shoeService.getById(parsePositiveId(req.params.id), req.user.id);
    if (!shoe) {
      throw new ApiError(404, 'shoe not found');
    }
    res.json(shoe);
  }));

  router.post('/shoes', authenticate(authService), asyncHandler(async (req, res) => {
    const shoe = await shoeService.create(req.user.id, req.body);
    res.status(201).json(shoe);
  }));

  router.patch('/shoes/:id', authenticate(authService), asyncHandler(async (req, res) => {
    const shoe = await shoeService.updateShoe(req.user.id, parsePositiveId(req.params.id), req.body);
    res.json(shoe);
  }));

  router.delete('/shoes/:id', authenticate(authService), asyncHandler(async (req, res) => {
    await shoeService.remove(req.user.id, parsePositiveId(req.params.id));
    res.json({ ok: true });
  }));

  router.get('/shoes/:id/activities', authenticate(authService), asyncHandler(async (req, res) => {
    const activities = await shoeService.getActivities(req.user.id, parsePositiveId(req.params.id));
    res.json(activities);
  }));

  router.post('/shoes/:id/photo', authenticate(authService), uploadShoeImage.single('photo'), asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) {
      throw new ApiError(400, 'photo file is required', 'INVALID_UPLOAD');
    }
    try {
      const shoeId = parsePositiveId(req.params.id);
      await validateUploadedFile(file, { kind: 'image' });
      const result = await shoeService.updatePhoto(req.user.id, shoeId, {
        path: `/uploads/shoe-images/${file.filename}`,
        originalName: file.originalname || null,
        mimeType: file.mimetype || null,
        size: file.size
      });
      res.json(result);
    } catch (error) {
      await removeUploadedFile(file);
      throw error;
    }
  }));

  router.post('/activities/:id/shoe', authenticate(authService), asyncHandler(async (req, res) => {
    await shoeService.bindActivity(req.user.id, parsePositiveId(req.params.id), req.body.shoeId || null);
    res.json({ ok: true });
  }));

  return router;
}

module.exports = createShoeRouter;
