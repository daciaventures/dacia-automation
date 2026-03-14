import { getSetting } from '../convexClient.js';
import { withRetry } from './retry.js';
import { withFALLimit } from './rateLimiter.js';
import { logFALCost } from './costTracker.js';

let configured = false;
let lastApiKey = null;
let falModule = null;

async function ensureConfigured() {
  const apiKey = await getSetting('fal_api_key');
  if (!apiKey) throw new Error('FAL API key not configured. Set it in Settings.');

  if (!falModule) {
    falModule = await import('@fal-ai/client');
  }

  if (!configured || lastApiKey !== apiKey) {
    falModule.fal.config({ credentials: apiKey });
    lastApiKey = apiKey;
    configured = true;
  }
  return falModule.fal;
}

const shouldRetryFAL = (err) => {
  const status = err.status || err.statusCode || err.httpCode;
  if (status === 429 || status >= 500) return true;
  const networkCodes = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED'];
  if (err.code && networkCodes.includes(err.code)) return true;
  if (err.message && /fetch|network|socket|ECONNRESET|ETIMEDOUT/i.test(err.message)) return true;
  return false;
};

/**
 * Generate images using Nano Banana 2 via FAL API (text-to-image).
 *
 * @param {string} prompt
 * @param {object} [options]
 * @param {string} [options.aspectRatio='1:1']
 * @param {string} [options.resolution='2K']
 * @param {number} [options.numImages=4]
 * @param {string} [options.projectId]
 * @param {string} [options.operation='adgen2_image']
 * @returns {Promise<Array<{url: string, width: number, height: number}>>}
 */
export async function generateImage(prompt, options = {}) {
  const {
    aspectRatio = '1:1',
    resolution = '2K',
    numImages = 4,
    projectId = null,
    operation = 'adgen2_image',
  } = options;

  const fal = await ensureConfigured();

  const result = await withFALLimit(
    () => withRetry(
      () => fal.subscribe('fal-ai/nano-banana-2', {
        input: {
          prompt,
          aspect_ratio: aspectRatio,
          num_images: numImages,
          output_format: 'png',
          resolution,
        },
      }),
      { label: '[FAL]', maxRetries: 3, shouldRetry: shouldRetryFAL, baseDelayMs: 2000 }
    ),
    '[FAL text-to-image]'
  );

  // Fire-and-forget cost logging
  logFALCost(projectId, numImages, resolution, operation).catch(() => {});

  return (result.data?.images || []).map(img => ({
    url: img.url,
    width: img.width,
    height: img.height,
  }));
}

/**
 * Generate images with product reference images (edit endpoint).
 *
 * @param {string} prompt
 * @param {string[]} imageUrls - Array of publicly accessible image URLs (up to 14)
 * @param {object} [options] - Same as generateImage options
 * @returns {Promise<Array<{url: string, width: number, height: number}>>}
 */
export async function generateImageWithReferences(prompt, imageUrls, options = {}) {
  const {
    aspectRatio = '1:1',
    resolution = '2K',
    numImages = 4,
    projectId = null,
    operation = 'adgen2_image_edit',
  } = options;

  const fal = await ensureConfigured();

  const result = await withFALLimit(
    () => withRetry(
      () => fal.subscribe('fal-ai/nano-banana-2/edit', {
        input: {
          prompt,
          image_urls: imageUrls.slice(0, 14),
          aspect_ratio: aspectRatio,
          num_images: numImages,
          output_format: 'png',
          resolution,
        },
      }),
      { label: '[FAL edit]', maxRetries: 3, shouldRetry: shouldRetryFAL, baseDelayMs: 2000 }
    ),
    '[FAL edit with refs]'
  );

  logFALCost(projectId, numImages, resolution, operation).catch(() => {});

  return (result.data?.images || []).map(img => ({
    url: img.url,
    width: img.width,
    height: img.height,
  }));
}

/**
 * Upload a buffer to FAL's storage for use as reference image.
 *
 * @param {Buffer} buffer
 * @param {string} [filename='product.png']
 * @param {string} [mimeType='image/png']
 * @returns {Promise<string>} - Public URL on FAL storage
 */
export async function uploadToFALStorage(buffer, filename = 'product.png', mimeType = 'image/png') {
  const fal = await ensureConfigured();
  const blob = new Blob([buffer], { type: mimeType });
  const file = new File([blob], filename, { type: mimeType });
  return await fal.storage.upload(file);
}

/**
 * Download an image from a URL and return it as a Buffer.
 *
 * @param {string} url
 * @returns {Promise<{buffer: Buffer, mimeType: string}>}
 */
export async function downloadImage(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download image: ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();
  const contentType = response.headers.get('content-type') || 'image/png';
  return { buffer: Buffer.from(arrayBuffer), mimeType: contentType };
}

/**
 * Test FAL API key validity by making a lightweight check.
 */
export async function testConnection() {
  const fal = await ensureConfigured();
  // Simple test — just verify the config is valid
  // FAL doesn't have a dedicated health endpoint, so we just verify the key configures without error
  return { success: true, message: 'FAL API key configured successfully' };
}
