import type { BunRequest } from 'bun';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

import { getBearerToken, validateJWT } from '../auth';
import { type ApiConfig } from '../config';
import { getVideo, updateVideo } from '../db/videos';
import { BadRequestError, NotFoundError, UserForbiddenError } from './errors';
import { respondWithJSON } from './json';

export async function handlerUploadVideo(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError('Invalid video ID');
  }

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  console.log('uploading video', videoId, 'by user', userID);

  const formData = await req.formData();
  const file = formData.get('video');
  
  if (!(file instanceof File)) {
    throw new BadRequestError('Video file missing');
  }

  if (file.size > MAX_UPLOAD_SIZE) {
    throw new BadRequestError('File too large');
  }

  const supportedMimeTypes = ['video/mp4'];

  if (!supportedMimeTypes.includes(file.type)) {
    throw new BadRequestError(`Invalid video type. Must be one of: ${supportedMimeTypes.join(', ')}`);
  }

  const videoMetadata = getVideo(cfg.db, videoId);
  
  if (!videoMetadata) {
    throw new NotFoundError(`Video with id ${videoId} not found`);
  }

  if (videoMetadata.userID !== userID) {
    throw new UserForbiddenError('Not an owner');
  }

  const extension = file.type.split('/')[1];
  const videoPath = join(cfg.assetsRoot, `${randomBytes(32).toString('base64url')}.${extension}`);
  await Bun.write(videoPath, file);
  await cfg.s3Client.file(videoPath).write(Bun.file(videoPath));

  videoMetadata.videoURL = `https://${cfg.s3Bucket}.s3.${cfg.s3Region}.amazonaws.com/${videoPath}`;

  updateVideo(cfg.db, videoMetadata);

  return respondWithJSON(200, null);
}

const MAX_UPLOAD_SIZE = 1 << 30; // 1 GB
