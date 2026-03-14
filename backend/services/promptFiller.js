/**
 * Prompt Filler Service (Ad Gen 2.0)
 *
 * Takes ad prompt templates + Brand DNA and uses Claude to intelligently
 * fill placeholders with brand-specific details.
 */

import { chat } from './anthropic.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Load available prompt templates from the JSON file.
 */
export function loadTemplates() {
  const filePath = path.join(__dirname, '..', 'data', 'adgen2-templates.json');
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

/**
 * Fill selected templates with brand-specific details from Brand DNA.
 *
 * @param {object} brandDna - Brand DNA record from database
 * @param {string[]} templateIds - IDs of templates to fill (or empty for all)
 * @param {object} [options]
 * @param {string} [options.productName] - Specific product name
 * @param {string} [options.projectId] - For cost tracking
 * @returns {Promise<Array<{templateId, templateName, filledPrompt, aspectRatio, needsProductImages}>>}
 */
export async function fillTemplates(brandDna, templateIds = [], options = {}) {
  const { productName = '', projectId = null } = options;

  const allTemplates = loadTemplates();
  const templates = templateIds.length > 0
    ? allTemplates.filter(t => templateIds.includes(t.id))
    : allTemplates;

  if (templates.length === 0) {
    return [];
  }

  // Parse visual identity from Brand DNA
  let visualIdentity = {};
  try {
    visualIdentity = JSON.parse(brandDna.visual_identity || '{}');
  } catch { /* use empty */ }

  const fillerPrompt = `You are an expert ad creative director. Fill in the bracketed placeholders in each image generation prompt template below using the Brand DNA provided.

## Brand DNA

**Brand Overview:**
${brandDna.brand_overview || 'Not available'}

**Visual Identity:**
- Primary Color: ${visualIdentity.primary_color || 'unknown'}
- Secondary Color: ${visualIdentity.secondary_color || 'unknown'}
- Accent Color: ${visualIdentity.accent_color || 'unknown'}
- Background Colors: ${(visualIdentity.background_colors || []).join(', ') || 'unknown'}
- CTA Color: ${visualIdentity.cta_color || 'unknown'}
- Primary Font: ${visualIdentity.primary_font || 'unknown'}
- Secondary Font: ${visualIdentity.secondary_font || 'unknown'}
- Headline Style: ${visualIdentity.headline_style || 'unknown'}
- Body Style: ${visualIdentity.body_style || 'unknown'}

**Photography Style:**
${typeof brandDna.photography_style === 'string' ? brandDna.photography_style : ''}

**Target Audience:**
${brandDna.target_audience || 'Not available'}

**Tone & Voice:**
${brandDna.tone_and_voice || 'Not available'}

**Image Prompt Modifier:**
${brandDna.image_prompt_modifier || 'Not available'}

**Product Name:** ${productName || 'Use the main product from the brand overview'}

## Templates to Fill

${templates.map((t, i) => `### Template ${i + 1}: ${t.name} (id: ${t.id})
${t.template}
`).join('\n')}

## Instructions

For each template:
1. Replace ALL [BRACKETED_PLACEHOLDERS] with specific, brand-appropriate details
2. Replace [IMAGE_PROMPT_MODIFIER] with the exact Image Prompt Modifier from the Brand DNA
3. Write compelling, specific ad copy for any text placeholders (headlines, subheadlines, CTAs)
4. Use the exact hex colors from the Brand DNA
5. Match the brand's photography style and mood
6. Remove any [ASPECT_RATIO_NOTE] placeholders

Return a JSON array where each element has:
{
  "template_id": "the template id",
  "filled_prompt": "the complete filled prompt with no remaining brackets"
}

Return ONLY the JSON array, no markdown fences.`;

  const response = await chat(
    [{ role: 'user', content: fillerPrompt }],
    'claude-sonnet-4-20250514',
    { operation: 'adgen2_prompt_fill', projectId }
  );

  let filledResults;
  try {
    const cleaned = response.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    filledResults = JSON.parse(cleaned);
  } catch {
    const match = response.match(/\[[\s\S]*\]/);
    if (match) {
      try { filledResults = JSON.parse(match[0]); } catch { /* fall through */ }
    }
    if (!filledResults) {
      throw new Error('Failed to parse prompt filling response');
    }
  }

  // Map back to template metadata
  return filledResults.map(result => {
    const template = templates.find(t => t.id === result.template_id);
    return {
      templateId: result.template_id,
      templateName: template?.name || result.template_id,
      filledPrompt: result.filled_prompt,
      originalTemplate: template?.template || '',
      aspectRatio: template?.aspect_ratio || '1:1',
      needsProductImages: template?.needs_product_images || false,
      category: template?.category || 'other',
    };
  });
}
