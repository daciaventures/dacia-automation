import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { streamService } from '../utils/sseHelper.js';
import {
  getProject,
  getBrandDnaByProject,
  getBrandDna,
  createBrandDna,
  updateBrandDna,
  deleteBrandDna,
  getAdgen2ImagesByProject,
  createAdgen2Image,
  updateAdgen2Image,
  deleteAdgen2Image,
  uploadBuffer,
} from '../convexClient.js';
import { researchBrandDna } from '../services/brandDnaResearcher.js';
import { loadTemplates, fillTemplates } from '../services/promptFiller.js';
import { generateImage, generateImageWithReferences, downloadImage, uploadToFALStorage } from '../services/fal.js';

const router = Router();

// ── Brand DNA ─────────────────────────────────────────────────────────────

// GET brand DNA for project
router.get('/:projectId/adgen2/brand-dna', async (req, res) => {
  try {
    const dna = await getBrandDnaByProject(req.params.projectId);
    res.json({ brand_dna: dna });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST generate brand DNA (SSE stream)
router.post('/:projectId/adgen2/brand-dna', async (req, res) => {
  const project = await getProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const { brand_url, competitor_urls, additional_context } = req.body;
  if (!brand_url) return res.status(400).json({ error: 'brand_url is required' });

  streamService(req, res, async (sendEvent) => {
    const id = uuidv4();

    // Create initial record
    await createBrandDna({
      id,
      project_id: req.params.projectId,
      status: 'researching',
      brand_url,
      competitor_urls: competitor_urls ? JSON.stringify(competitor_urls) : undefined,
      additional_context,
    });

    try {
      const result = await researchBrandDna({
        brandUrl: brand_url,
        competitorUrls: competitor_urls || [],
        additionalContext: additional_context || '',
        projectId: req.params.projectId,
      }, sendEvent);

      await updateBrandDna(id, {
        status: 'completed',
        ...result,
      });

      const dna = await getBrandDna(id);
      sendEvent({ type: 'complete', brand_dna: dna });
    } catch (err) {
      await updateBrandDna(id, {
        status: 'failed',
        error_message: err.message,
      });
      sendEvent({ type: 'error', message: err.message });
    }
  });
});

// PUT update brand DNA (manual edits)
router.put('/:projectId/adgen2/brand-dna/:dnaId', async (req, res) => {
  try {
    await updateBrandDna(req.params.dnaId, req.body);
    const dna = await getBrandDna(req.params.dnaId);
    res.json({ success: true, brand_dna: dna });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE brand DNA
router.delete('/:projectId/adgen2/brand-dna/:dnaId', async (req, res) => {
  try {
    await deleteBrandDna(req.params.dnaId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Prompt Templates ──────────────────────────────────────────────────────

// GET available templates
router.get('/:projectId/adgen2/templates', async (req, res) => {
  try {
    const templates = loadTemplates();
    res.json({ templates });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST fill templates with brand DNA
router.post('/:projectId/adgen2/fill-templates', async (req, res) => {
  const { template_ids, product_name } = req.body;

  try {
    const dna = await getBrandDnaByProject(req.params.projectId);
    if (!dna) return res.status(400).json({ error: 'Generate Brand DNA first' });

    const filled = await fillTemplates(dna, template_ids || [], {
      productName: product_name,
      projectId: req.params.projectId,
    });

    res.json({ prompts: filled });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Image Generation ──────────────────────────────────────────────────────

// GET generated images
router.get('/:projectId/adgen2/images', async (req, res) => {
  try {
    const images = await getAdgen2ImagesByProject(req.params.projectId);
    res.json({ images });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST generate images from prompts (SSE stream)
router.post('/:projectId/adgen2/generate', async (req, res) => {
  const project = await getProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const {
    prompts,
    resolution = '2K',
    num_images = 4,
    product_image_urls = [],
  } = req.body;

  if (!prompts || !Array.isArray(prompts) || prompts.length === 0) {
    return res.status(400).json({ error: 'prompts array is required' });
  }

  streamService(req, res, async (sendEvent) => {
    const dna = await getBrandDnaByProject(req.params.projectId);
    const totalPrompts = prompts.length;
    const results = [];

    for (let i = 0; i < totalPrompts; i++) {
      const p = prompts[i];
      const pctBase = Math.round((i / totalPrompts) * 100);
      sendEvent({
        type: 'progress',
        step: `generating_${i}`,
        message: `Generating ${p.templateName || `prompt ${i + 1}`} (${i + 1}/${totalPrompts})...`,
      });

      try {
        let images;
        if (p.needsProductImages && product_image_urls.length > 0) {
          images = await generateImageWithReferences(p.filledPrompt, product_image_urls, {
            aspectRatio: p.aspectRatio || '1:1',
            resolution,
            numImages: num_images,
            projectId: req.params.projectId,
          });
        } else {
          images = await generateImage(p.filledPrompt, {
            aspectRatio: p.aspectRatio || '1:1',
            resolution,
            numImages: num_images,
            projectId: req.params.projectId,
          });
        }

        // Download and store each generated image
        for (let j = 0; j < images.length; j++) {
          const img = images[j];
          try {
            const { buffer, mimeType } = await downloadImage(img.url);
            const storageId = await uploadBuffer(buffer, mimeType);

            const imageId = uuidv4();
            await createAdgen2Image({
              id: imageId,
              project_id: req.params.projectId,
              brand_dna_id: dna?.id || undefined,
              template_name: p.templateName || undefined,
              filled_prompt: p.filledPrompt,
              original_template: p.originalTemplate || undefined,
              storageId,
              fal_image_url: img.url,
              aspect_ratio: p.aspectRatio || '1:1',
              resolution,
              width: img.width,
              height: img.height,
              reference_image_urls: product_image_urls.length > 0 ? JSON.stringify(product_image_urls) : undefined,
              used_edit_endpoint: p.needsProductImages && product_image_urls.length > 0,
              status: 'completed',
            });

            results.push({ imageId, templateName: p.templateName, url: img.url });
          } catch (dlErr) {
            console.error(`[AdGen2] Failed to download/store image: ${dlErr.message}`);
          }
        }

        sendEvent({
          type: 'progress',
          step: `done_${i}`,
          message: `Completed ${p.templateName || `prompt ${i + 1}`} (${images.length} images)`,
        });
      } catch (genErr) {
        console.error(`[AdGen2] Failed to generate for template ${p.templateId}: ${genErr.message}`);
        sendEvent({
          type: 'progress',
          step: `error_${i}`,
          message: `Failed: ${p.templateName || `prompt ${i + 1}`} — ${genErr.message}`,
        });
      }
    }

    sendEvent({ type: 'complete', count: results.length });
  });
});

// POST generate single image (playground mode)
router.post('/:projectId/adgen2/generate-single', async (req, res) => {
  const project = await getProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const {
    prompt,
    aspect_ratio = '1:1',
    resolution = '2K',
    num_images = 4,
    product_image_urls = [],
  } = req.body;

  if (!prompt) return res.status(400).json({ error: 'prompt is required' });

  streamService(req, res, async (sendEvent) => {
    sendEvent({ type: 'progress', step: 'generating', message: 'Generating images...' });

    try {
      let images;
      if (product_image_urls.length > 0) {
        images = await generateImageWithReferences(prompt, product_image_urls, {
          aspectRatio: aspect_ratio, resolution, numImages: num_images,
          projectId: req.params.projectId,
        });
      } else {
        images = await generateImage(prompt, {
          aspectRatio: aspect_ratio, resolution, numImages: num_images,
          projectId: req.params.projectId,
        });
      }

      sendEvent({ type: 'progress', step: 'storing', message: 'Saving images...' });

      const dna = await getBrandDnaByProject(req.params.projectId);
      const stored = [];
      for (const img of images) {
        try {
          const { buffer, mimeType } = await downloadImage(img.url);
          const storageId = await uploadBuffer(buffer, mimeType);
          const imageId = uuidv4();
          await createAdgen2Image({
            id: imageId,
            project_id: req.params.projectId,
            brand_dna_id: dna?.id || undefined,
            filled_prompt: prompt,
            storageId,
            fal_image_url: img.url,
            aspect_ratio,
            resolution,
            width: img.width,
            height: img.height,
            used_edit_endpoint: product_image_urls.length > 0,
            reference_image_urls: product_image_urls.length > 0 ? JSON.stringify(product_image_urls) : undefined,
            status: 'completed',
          });
          stored.push(imageId);
        } catch (dlErr) {
          console.error(`[AdGen2] Failed to download/store: ${dlErr.message}`);
        }
      }

      sendEvent({ type: 'complete', count: stored.length });
    } catch (err) {
      sendEvent({ type: 'error', message: err.message });
    }
  });
});

// PUT update image metadata
router.put('/:projectId/adgen2/images/:imageId', async (req, res) => {
  try {
    await updateAdgen2Image(req.params.imageId, req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE image
router.delete('/:projectId/adgen2/images/:imageId', async (req, res) => {
  try {
    await deleteAdgen2Image(req.params.imageId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
