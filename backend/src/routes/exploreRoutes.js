const express = require('express');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const multer = require('multer');
const db = require('../db');
const defaultAuthService = require('../services/authService');
const config = require('../config');
const { ApiError } = require('../errors');
const { asyncHandler, parseEnum, parseKeyword, parsePage, parsePageSize, parsePositiveId } = require('../http');
const { authenticate, optionalAuthenticate } = require('../middleware/authMiddleware');
const { sendCreated, sendData } = require('../response');

const ARTICLE_TYPES = ['course', 'article', 'training_advice'];

fs.mkdirSync(config.uploads.exploreVideosDir, { recursive: true });
fs.mkdirSync(config.uploads.exploreImagesDir, { recursive: true });

const mediaStorage = multer.diskStorage({
  destination(req, file, callback) {
    callback(null, file.fieldname === 'image' ? config.uploads.exploreImagesDir : config.uploads.exploreVideosDir);
  },
  filename(req, file, callback) {
    const fallbackExtension = file.fieldname === 'image' ? '.jpg' : '.mp4';
    const extension = path.extname(file.originalname || '').slice(0, 16) || fallbackExtension;
    callback(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${extension}`);
  }
});

const uploadMedia = multer({
  storage: mediaStorage,
  limits: { fileSize: config.uploads.maxVideoBytes },
  fileFilter(req, file, callback) {
    const mimetype = String(file.mimetype || '');
    if (file.fieldname === 'video' && !mimetype.startsWith('video/')) {
      callback(new ApiError(400, 'video file is required', 'INVALID_UPLOAD'));
      return;
    }
    if (file.fieldname === 'image' && !mimetype.startsWith('image/')) {
      callback(new ApiError(400, 'image file is required', 'INVALID_UPLOAD'));
      return;
    }
    if (!['video', 'image'].includes(file.fieldname)) {
      callback(new ApiError(400, 'unsupported upload field', 'INVALID_UPLOAD'));
      return;
    }
    callback(null, true);
  }
});

function removeUploadedFile(file) {
  if (file?.path) {
    fs.unlink(file.path, () => {});
  }
}

function parsePaging(query, fallback = 20, max = 100) {
  const page = parsePage(query.page);
  const pageSize = parsePageSize(query.page_size, fallback, max);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function parseArticleFilters(query) {
  return {
    ...parsePaging(query),
    type: parseEnum(query.type, ARTICLE_TYPES, 'type', undefined),
    keyword: parseKeyword(query.keyword)
  };
}

function requireText(value, name, max) {
  const text = String(value || '').trim();
  if (!text || text.length > max) {
    throw new ApiError(400, `${name} is required and must be at most ${max} characters`, 'VALIDATION_ERROR');
  }
  return text;
}

function optionalText(value, max) {
  const text = String(value || '').trim();
  return text ? text.slice(0, max) : '';
}

function parseTags(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value;
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toArticle(row) {
  return {
    id: row.id,
    userId: row.userId,
    username: row.username || '',
    userBio: row.userBio || '',
    type: row.type,
    title: row.title,
    summary: row.summary,
    coverUrl: row.coverUrl,
    videoUrl: row.videoPath || '',
    videoOriginalName: row.videoOriginalName || '',
    videoMimeType: row.videoMimeType || '',
    videoSizeBytes: row.videoSizeBytes == null ? null : Number(row.videoSizeBytes),
    tags: parseTags(row.tags),
    difficulty: row.difficulty,
    durationMin: row.durationMin,
    content: row.content,
    publishedAt: row.publishedAt
  };
}

function articleWhere(filters, alias = '') {
  const prefix = alias ? `${alias}.` : '';
  const where = [`${prefix}status = 'published'`];
  const params = [];
  if (filters.type) {
    where.push(`${prefix}type = ?`);
    params.push(filters.type);
  }
  if (filters.keyword) {
    where.push(`(${prefix}title LIKE ? OR ${prefix}summary LIKE ? OR ${prefix}content LIKE ?)`);
    params.push(`%${filters.keyword}%`, `%${filters.keyword}%`, `%${filters.keyword}%`);
  }
  return { sql: where.join(' AND '), params };
}

async function listArticles(filters) {
  const countWhere = articleWhere(filters);
  const listWhere = articleWhere(filters, 'a');
  const countRows = await db.query(`SELECT COUNT(*) AS total FROM ExploreArticles WHERE ${countWhere.sql}`, countWhere.params);
  const rows = await db.query(
    `
      SELECT
        a.id,
        a.user_id AS userId,
        u.username,
        u.bio AS userBio,
        a.type,
        a.title,
        a.summary,
        a.cover_url AS coverUrl,
        a.video_path AS videoPath,
        a.video_original_name AS videoOriginalName,
        a.video_mime_type AS videoMimeType,
        a.video_size_bytes AS videoSizeBytes,
        a.tags_json AS tags,
        a.difficulty,
        a.duration_min AS durationMin,
        a.content,
        a.published_at AS publishedAt
      FROM ExploreArticles a
      LEFT JOIN Users u ON u.id = a.user_id
      WHERE ${listWhere.sql}
      ORDER BY a.published_at DESC, a.id DESC
      LIMIT ? OFFSET ?
    `,
    [...listWhere.params, filters.pageSize, filters.offset]
  );

  const total = Number(countRows[0]?.total || 0);
  return {
    items: rows.map(toArticle),
    page: filters.page,
    pageSize: filters.pageSize,
    total,
    totalPages: Math.ceil(total / filters.pageSize)
  };
}

async function getArticleById(articleId) {
  const rows = await db.query(
    `
      SELECT
        a.id,
        a.user_id AS userId,
        u.username,
        u.bio AS userBio,
        a.type,
        a.title,
        a.summary,
        a.cover_url AS coverUrl,
        a.video_path AS videoPath,
        a.video_original_name AS videoOriginalName,
        a.video_mime_type AS videoMimeType,
        a.video_size_bytes AS videoSizeBytes,
        a.tags_json AS tags,
        a.difficulty,
        a.duration_min AS durationMin,
        a.content,
        a.published_at AS publishedAt
      FROM ExploreArticles a
      LEFT JOIN Users u ON u.id = a.user_id
      WHERE a.id = ? AND a.status = 'published'
      LIMIT 1
    `,
    [articleId]
  );

  if (!rows[0]) {
    throw new ApiError(404, 'article not found', 'NOT_FOUND');
  }

  return toArticle(rows[0]);
}

async function createArticle(payload, user) {
  const result = await db.query(
    `
      INSERT INTO ExploreArticles (
        user_id,
        type,
        title,
        summary,
        content,
        status,
        published_at,
        video_path,
        video_original_name,
        video_mime_type,
        video_size_bytes
      )
      VALUES (?, ?, ?, ?, ?, 'published', NOW(3), ?, ?, ?, ?)
    `,
    [
      user.id,
      payload.type,
      payload.title,
      payload.summary || null,
      payload.content || null,
      payload.videoPath || null,
      payload.videoOriginalName || null,
      payload.videoMimeType || null,
      payload.videoSizeBytes || null
    ]
  );

  return getArticleById(result.insertId);
}

const defaultExploreService = {
  listArticles,
  getArticleById,
  getRecommendations: (filters) => listArticles(filters),
  createArticle
};

function createExploreRouter(exploreService = defaultExploreService, authService = defaultAuthService) {
  const router = express.Router();
  const maybeAuth = optionalAuthenticate(authService);
  const requireAuth = authenticate(authService);

  router.get(
    '/explore/articles',
    asyncHandler(async (req, res) => {
      sendData(res, await exploreService.listArticles(parseArticleFilters(req.query)));
    })
  );

  router.get(
    '/explore/recommendations',
    maybeAuth,
    asyncHandler(async (req, res) => {
      sendData(res, await exploreService.getRecommendations(parseArticleFilters(req.query), req.user));
    })
  );

  router.post(
    '/explore/articles',
    requireAuth,
    uploadMedia.fields([
      { name: 'video', maxCount: 1 },
      { name: 'image', maxCount: 1 }
    ]),
    asyncHandler(async (req, res) => {
      const type = parseEnum(req.body.type, ARTICLE_TYPES, 'type', 'article');
      const videoFile = req.files?.video?.[0] || null;
      const imageFile = req.files?.image?.[0] || null;

      if (type === 'course' && imageFile) {
        removeUploadedFile(imageFile);
        throw new ApiError(400, 'course only accepts video upload', 'INVALID_UPLOAD');
      }
      if (type !== 'course' && videoFile) {
        removeUploadedFile(videoFile);
        throw new ApiError(400, 'article and training advice only accept image upload', 'INVALID_UPLOAD');
      }
      if (imageFile && imageFile.size > config.uploads.maxImageBytes) {
        removeUploadedFile(imageFile);
        throw new ApiError(400, 'image file is too large', 'INVALID_UPLOAD');
      }

      const videoPath = videoFile
        ? `/uploads/explore-videos/${videoFile.filename}`
        : '';
      const imagePath = imageFile
        ? `/uploads/explore-images/${imageFile.filename}`
        : '';

      sendCreated(
        res,
        await exploreService.createArticle(
          {
            type,
            title: requireText(req.body.title, 'title', 200),
            summary: optionalText(req.body.summary, 500),
            content: optionalText(req.body.content, 10000),
            coverUrl: imagePath,
            videoPath,
            videoOriginalName: videoFile?.originalname || '',
            videoMimeType: videoFile?.mimetype || '',
            videoSizeBytes: videoFile?.size || null
          },
          req.user
        )
      );
    })
  );

  router.get(
    '/explore/articles/:id',
    asyncHandler(async (req, res) => {
      sendData(res, await exploreService.getArticleById(parsePositiveId(req.params.id, 'article id')));
    })
  );

  return router;
}

module.exports = createExploreRouter;
