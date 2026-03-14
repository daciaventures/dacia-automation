/**
 * Brand DNA Research Service (Ad Gen 2.0)
 *
 * Multi-step pipeline that researches a brand and produces a Brand DNA document:
 * 1. Web search via Perplexity Sonar Pro for brand info
 * 2. Site capture via Puppeteer for brand URL analysis
 * 3. Claude analysis + synthesis into structured Brand DNA
 *
 * Reuses existing platform infrastructure:
 * - Perplexity client from quoteMiner.js pattern
 * - Puppeteer from lpSwipeFetcher.js
 * - Claude from anthropic.js
 */

import OpenAI from 'openai';
import { getSetting } from '../convexClient.js';
import { chat, chatWithImage } from './anthropic.js';
import { withRetry } from './retry.js';

// ── Perplexity client (same pattern as quoteMiner.js) ─────────────────────

let perplexityClient = null;
let lastPerplexityKey = null;

async function getPerplexityClient() {
  const apiKey = await getSetting('perplexity_api_key');
  if (!apiKey) throw new Error('Perplexity API key not configured. Set it in Settings.');
  if (!perplexityClient || lastPerplexityKey !== apiKey) {
    perplexityClient = new OpenAI({ apiKey, baseURL: 'https://api.perplexity.ai' });
    lastPerplexityKey = apiKey;
  }
  return perplexityClient;
}

// ── Perplexity web search ─────────────────────────────────────────────────

async function perplexitySearch(query) {
  const client = await getPerplexityClient();
  const response = await withRetry(
    () => client.chat.completions.create({
      model: 'sonar-pro',
      messages: [
        {
          role: 'system',
          content: 'You are a brand research assistant. Return detailed, factual information about brands, their visual identity, design, and positioning. Return plain text, not JSON.'
        },
        { role: 'user', content: query }
      ]
    }),
    { label: '[Perplexity BrandDNA]', maxRetries: 3, baseDelayMs: 2000 }
  );
  return response.choices[0]?.message?.content || '';
}

// ── Site fetch (lightweight, no Puppeteer needed for text) ─────────────────

async function fetchSiteText(url) {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BrandResearch/1.0)' },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return null;
    const html = await response.text();
    // Strip HTML tags, keep text content
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 15000); // Cap at 15K chars
    return text;
  } catch {
    return null;
  }
}

// ── Main research pipeline ────────────────────────────────────────────────

/**
 * Run the full Brand DNA research pipeline.
 *
 * @param {object} params
 * @param {string} params.brandUrl - Main brand/product URL
 * @param {string[]} [params.competitorUrls] - Optional competitor URLs
 * @param {string} [params.additionalContext] - User-provided context
 * @param {string} params.projectId - For cost tracking
 * @param {function} sendEvent - SSE event emitter
 * @returns {object} - Brand DNA fields ready for database storage
 */
export async function researchBrandDna({ brandUrl, competitorUrls = [], additionalContext = '', projectId }, sendEvent) {
  const startTime = Date.now();

  // Step 1: Web search for brand info
  sendEvent({ type: 'progress', step: 'web_search', message: 'Searching for brand information...' });

  const brandName = new URL(brandUrl).hostname.replace('www.', '').split('.')[0];
  const searchQueries = [
    `${brandName} brand identity design colors fonts typography visual style`,
    `${brandName} brand story mission target audience positioning`,
    `${brandName} product packaging design photography style advertising`,
  ];

  const searchResults = [];
  for (const query of searchQueries) {
    const result = await perplexitySearch(query);
    searchResults.push(result);
  }
  const combinedSearch = searchResults.join('\n\n---\n\n');

  // Step 2: Fetch brand website content
  sendEvent({ type: 'progress', step: 'site_capture', message: 'Analyzing brand website...' });
  const siteText = await fetchSiteText(brandUrl);

  // Step 3: Competitor research (if URLs provided)
  let competitorResearch = '';
  if (competitorUrls.length > 0) {
    sendEvent({ type: 'progress', step: 'competitor_search', message: `Researching ${competitorUrls.length} competitor(s)...` });
    for (const compUrl of competitorUrls.slice(0, 3)) {
      try {
        const compName = new URL(compUrl).hostname.replace('www.', '').split('.')[0];
        const compSearch = await perplexitySearch(`${compName} brand visual identity colors fonts vs ${brandName}`);
        competitorResearch += `\n\n### ${compName}\n${compSearch}`;
      } catch {
        // Skip failed competitor research
      }
    }
  }

  // Step 4: Claude synthesis
  sendEvent({ type: 'progress', step: 'synthesis', message: 'Synthesizing Brand DNA document...' });

  const synthesisPrompt = `You are a Senior Brand Strategist conducting a full reverse-engineering of a brand's visual and verbal identity.

Based on the research below, create a comprehensive Brand DNA document. Every detail matters because the output will be fed into an image generation model (Nano Banana 2) that needs exact specifications.

## Research Data

### Web Research
${combinedSearch}

### Brand Website Content
${siteText || '(Could not fetch website content)'}

### Competitor Analysis
${competitorResearch || '(No competitor data)'}

### Additional Context from User
${additionalContext || '(None provided)'}

## Output Format

Return a JSON object with these exact keys:

{
  "brand_overview": "2-3 paragraph summary: brand name, tagline, mission, positioning, key differentiators, founding story if known",
  "visual_identity": {
    "primary_color": "#hex",
    "secondary_color": "#hex",
    "accent_color": "#hex",
    "background_colors": ["#hex1", "#hex2"],
    "cta_color": "#hex",
    "primary_font": "Font name and style description",
    "secondary_font": "Font name and style description",
    "headline_style": "Bold/Light/Serif/Sans-serif, weight, letter-spacing",
    "body_style": "Font style description",
    "logo_description": "Visual description of the logo"
  },
  "photography_style": {
    "lighting": "Natural/Studio/Warm/Cool/etc",
    "color_grading": "Warm tones/Cool tones/High contrast/Muted/etc",
    "composition": "Centered/Rule of thirds/Asymmetric/etc",
    "subject_matter": "What's typically shown in brand photos",
    "mood": "Overall feeling and atmosphere",
    "props_surfaces": "Common backgrounds, surfaces, staging elements"
  },
  "target_audience": "2-3 sentences describing the primary buyer persona: demographics, psychographics, lifestyle, pain points",
  "tone_and_voice": "5 adjectives that describe the brand's voice, plus a 1-2 sentence description of how they communicate",
  "competitor_analysis": "Brief overview of 2-3 competitors and how this brand differentiates visually",
  "image_prompt_modifier": "A single 50-75 word paragraph to PREPEND to any image generation prompt to match this brand's visual identity. Include exact hex colors, font descriptions, photography direction, and mood. This is the most critical output — it must be specific enough that any image generated with this prepended will look on-brand."
}

Return ONLY the JSON object, no markdown fences.`;

  const synthesisResponse = await chat(
    [{ role: 'user', content: synthesisPrompt }],
    'claude-sonnet-4-20250514',
    { operation: 'brand_dna_research', projectId }
  );

  // Parse the response
  sendEvent({ type: 'progress', step: 'finalizing', message: 'Finalizing Brand DNA...' });

  let parsed;
  try {
    const cleaned = synthesisResponse
      .replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    // Try to extract JSON from the response
    const match = synthesisResponse.match(/\{[\s\S]*\}/);
    if (match) {
      try { parsed = JSON.parse(match[0]); } catch { /* fall through */ }
    }
    if (!parsed) {
      throw new Error('Failed to parse Brand DNA synthesis response');
    }
  }

  const duration = Date.now() - startTime;

  return {
    brand_overview: parsed.brand_overview || '',
    visual_identity: JSON.stringify(parsed.visual_identity || {}),
    target_audience: parsed.target_audience || '',
    tone_and_voice: parsed.tone_and_voice || '',
    competitor_analysis: parsed.competitor_analysis || '',
    image_prompt_modifier: parsed.image_prompt_modifier || '',
    raw_research: combinedSearch.slice(0, 50000), // Cap at 50K
    duration_ms: duration,
  };
}
