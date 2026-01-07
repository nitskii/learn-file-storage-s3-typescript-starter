import type { BunRequest } from "bun";
import { join } from 'node:path';
import { getBearerToken, validateJWT } from "../auth";
import type { ApiConfig } from "../config";
import { getVideo, updateVideo } from "../db/videos";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";
import { respondWithJSON } from "./json";

export async function handlerUploadThumbnail(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  console.log("uploading thumbnail for video", videoId, "by user", userID);

  const formData = await req.formData();
  const file = formData.get('thumbnail');

  if (!(file instanceof File)) {
    throw new BadRequestError("Thumbnail file missing");
  }

  if (file.size > MAX_UPLOAD_SIZE) {
    throw new BadRequestError("File too large");
  }

  const videoMetadata = getVideo(cfg.db, videoId);

  if (!videoMetadata) {
    throw new NotFoundError(`Video with id ${videoId} not found`);
  }

  if (videoMetadata.userID !== userID) {
    throw new UserForbiddenError('Not an owner');
  }

  const supportedMimeTypes = ['image/jpeg', 'image/png'];

  if (!supportedMimeTypes.includes(file.type)) {
    throw new BadRequestError(`Invalid thumbnail type. Must be one of: ${supportedMimeTypes.join(', ')}`);
  }

  const extension = file.type.split('/')[1];
  const thumbnailPath = join(cfg.assetsRoot, `${videoMetadata.id}.${extension}`);
  await Bun.write(thumbnailPath, file);

  videoMetadata.thumbnailURL = `http://localhost:${cfg.port}/${thumbnailPath}`;

  updateVideo(cfg.db, videoMetadata);

  return respondWithJSON(200, videoMetadata);
}

const MAX_UPLOAD_SIZE = 10 << 20; // 10 MB
