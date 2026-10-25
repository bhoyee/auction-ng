import sharp from 'sharp';
import { imageRules } from '@auction-ng/shared';
import { BadRequestException } from '@nestjs/common';

export async function generateImages(input: Buffer, contentType: string) {
  if (input.length === 0 || input.length > imageRules.maxUploadBytes)
    throw new BadRequestException('Upload a photo no larger than 8 MB.');
  try {
    const options = {
      limitInputPixels: imageRules.maxPixels,
      failOn: 'warning' as const,
    };
    const metadata = await sharp(input, options).metadata();
    if (
      !['jpeg', 'png', 'webp'].includes(metadata.format ?? '') ||
      contentType !== `image/${metadata.format}` ||
      (metadata.pages ?? 1) !== 1
    )
      throw new Error('Unsupported photo.');
    const display = await sharp(input, options)
      .rotate()
      .resize({
        width: imageRules.displayWidth,
        height: imageRules.displayWidth,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    for (const quality of [75, 60, 45, 30, 20]) {
      const thumbnail = await sharp(input, options)
        .rotate()
        .resize({
          width: imageRules.thumbnailWidth,
          height: imageRules.thumbnailWidth,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality })
        .toBuffer();
      if (thumbnail.length <= imageRules.maxThumbnailBytes)
        return {
          thumbnail,
          display: display.data,
          width: display.info.width,
          height: display.info.height,
        };
    }
  } catch {
    throw new BadRequestException(
      'Use a valid, still JPEG, PNG or WebP photo up to 20 megapixels.',
    );
  }
  throw new BadRequestException(
    'This photo cannot meet the thumbnail size limit. Try a smaller photo.',
  );
}
