const fs = require('node:fs/promises');
const path = require('node:path');
const { ApiError } = require('../errors');

let fileTypeModulePromise;

function getFileTypeModule() {
  fileTypeModulePromise ||= import('file-type');
  return fileTypeModulePromise;
}

async function removeUploadedFile(file) {
  if (!file?.path) {
    return;
  }

  try {
    await fs.unlink(file.path);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

async function removeUploadedFiles(files) {
  await Promise.all((files || []).filter(Boolean).map(removeUploadedFile));
}

async function validateUploadedFile(file, { kind }) {
  if (!file?.path || !['image', 'video'].includes(kind)) {
    await removeUploadedFile(file);
    throw new ApiError(400, `${kind || 'media'} file is invalid`, 'INVALID_UPLOAD');
  }

  try {
    const { fileTypeFromFile } = await getFileTypeModule();
    const detected = await fileTypeFromFile(file.path);
    if (!detected || !detected.mime.startsWith(`${kind}/`)) {
      await removeUploadedFile(file);
      throw new ApiError(400, `${kind} file content is invalid`, 'INVALID_UPLOAD');
    }

    const parsedPath = path.parse(file.path);
    const safePath = path.join(parsedPath.dir, `${parsedPath.name}.${detected.ext}`);
    if (safePath !== file.path) {
      await fs.rename(file.path, safePath);
      file.path = safePath;
      file.filename = path.basename(safePath);
    }
    file.mimetype = detected.mime;
    return file;
  } catch (error) {
    await removeUploadedFile(file);
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(400, `${kind} file content could not be verified`, 'INVALID_UPLOAD');
  }
}

module.exports = {
  removeUploadedFile,
  removeUploadedFiles,
  validateUploadedFile
};
