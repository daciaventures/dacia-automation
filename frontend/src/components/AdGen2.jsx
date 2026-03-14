import { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '../api';
import { useToast } from './Toast';
import PipelineProgress from './PipelineProgress';

// ── Step progress maps ───────────────────────────────────────────────────
const DNA_STEP_PROGRESS = {
  web_search: 5,
  site_capture: 30,
  competitor_search: 50,
  synthesis: 65,
  finalizing: 90,
};

// ── Category labels & colors ─────────────────────────────────────────────
const CATEGORY_LABELS = {
  product: 'Product',
  'text-overlay': 'Text Overlay',
  'social-proof': 'Social Proof',
  comparison: 'Comparison',
  ugc: 'UGC',
  transformation: 'Transformation',
  educational: 'Educational',
  promotional: 'Promotional',
  trust: 'Trust',
  vertical: 'Vertical',
  brand: 'Brand',
  other: 'Other',
};

const CATEGORY_COLORS = {
  product: 'bg-navy/10 text-navy',
  'text-overlay': 'bg-gold/15 text-gold',
  'social-proof': 'bg-teal/10 text-teal',
  comparison: 'bg-purple-100 text-purple-700',
  ugc: 'bg-amber-100 text-amber-700',
  transformation: 'bg-emerald-100 text-emerald-700',
  educational: 'bg-blue-100 text-blue-700',
  promotional: 'bg-red-100 text-red-700',
  trust: 'bg-indigo-100 text-indigo-700',
  vertical: 'bg-pink-100 text-pink-700',
  brand: 'bg-cyan-100 text-cyan-700',
  other: 'bg-gray-100 text-gray-600',
};

// ── Main Component ───────────────────────────────────────────────────────
export default function AdGen2({ projectId }) {
  const toast = useToast();
  const [phase, setPhase] = useState('dna'); // dna | prompts | gallery

  // Brand DNA state
  const [brandDna, setBrandDna] = useState(null);
  const [dnaLoading, setDnaLoading] = useState(true);
  const [dnaUrl, setDnaUrl] = useState('');
  const [dnaCompetitors, setDnaCompetitors] = useState('');
  const [dnaContext, setDnaContext] = useState('');
  const [dnaGenerating, setDnaGenerating] = useState(false);
  const [dnaProgress, setDnaProgress] = useState(0);
  const [dnaMessage, setDnaMessage] = useState('');
  const dnaStartRef = useRef(null);
  const dnaAbortRef = useRef(null);

  // Templates state
  const [templates, setTemplates] = useState([]);
  const [selectedTemplates, setSelectedTemplates] = useState(new Set());
  const [productName, setProductName] = useState('');
  const [filling, setFilling] = useState(false);
  const [filledPrompts, setFilledPrompts] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Image generation state
  const [images, setImages] = useState([]);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState(0);
  const [genMessage, setGenMessage] = useState('');
  const genStartRef = useRef(null);
  const genAbortRef = useRef(null);
  const [resolution, setResolution] = useState('2K');
  const [numImages, setNumImages] = useState(4);

  // Playground state
  const [playgroundPrompt, setPlaygroundPrompt] = useState('');
  const [playgroundAspect, setPlaygroundAspect] = useState('1:1');
  const [playgroundGenerating, setPlaygroundGenerating] = useState(false);
  const [pgProgress, setPgProgress] = useState(0);
  const [pgMessage, setPgMessage] = useState('');
  const pgStartRef = useRef(null);

  // Gallery state
  const [galleryFilter, setGalleryFilter] = useState('all');
  const [selectedImage, setSelectedImage] = useState(null);

  // ── Load existing data on mount ──────────────────────────────────────
  useEffect(() => {
    loadBrandDna();
    loadTemplates();
  }, [projectId]);

  const loadBrandDna = useCallback(async () => {
    try {
      setDnaLoading(true);
      const res = await api.getBrandDna(projectId);
      if (res.brand_dna) {
        setBrandDna(res.brand_dna);
      }
    } catch (err) {
      console.error('Failed to load Brand DNA:', err);
    } finally {
      setDnaLoading(false);
    }
  }, [projectId]);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await api.getAdgen2Templates(projectId);
      setTemplates(res.templates || []);
    } catch (err) {
      console.error('Failed to load templates:', err);
    }
  }, [projectId]);

  const loadImages = useCallback(async () => {
    try {
      setImagesLoading(true);
      const res = await api.getAdgen2Images(projectId);
      setImages(res.images || []);
    } catch (err) {
      console.error('Failed to load images:', err);
    } finally {
      setImagesLoading(false);
    }
  }, [projectId]);

  // Load images when switching to gallery
  useEffect(() => {
    if (phase === 'gallery') loadImages();
  }, [phase, loadImages]);

  // ── Brand DNA Generation ─────────────────────────────────────────────
  const handleResearchBrand = () => {
    if (!dnaUrl.trim()) {
      toast.error('Enter a brand URL');
      return;
    }

    setDnaGenerating(true);
    setDnaProgress(0);
    setDnaMessage('Starting research...');
    dnaStartRef.current = Date.now();

    const competitorUrls = dnaCompetitors.trim()
      ? dnaCompetitors.split('\n').map(u => u.trim()).filter(Boolean)
      : [];

    const { abort, done } = api.generateBrandDna(
      projectId,
      { brand_url: dnaUrl.trim(), competitor_urls: competitorUrls, additional_context: dnaContext.trim() },
      (event) => {
        if (event.type === 'progress') {
          setDnaMessage(event.message || '');
          if (event.step && DNA_STEP_PROGRESS[event.step] !== undefined) {
            setDnaProgress(prev => Math.max(prev, DNA_STEP_PROGRESS[event.step]));
          }
        } else if (event.type === 'complete') {
          setDnaProgress(100);
          setTimeout(() => {
            setDnaGenerating(false);
            setDnaProgress(0);
            setDnaMessage('');
            dnaStartRef.current = null;
            setBrandDna(event.brand_dna);
            toast.success('Brand DNA research complete');
          }, 500);
        } else if (event.type === 'error') {
          setDnaGenerating(false);
          setDnaProgress(0);
          setDnaMessage('');
          dnaStartRef.current = null;
          toast.error(event.message || 'Brand DNA research failed');
        }
      }
    );

    dnaAbortRef.current = abort;
    done.catch((err) => {
      if (err.name !== 'AbortError') {
        setDnaGenerating(false);
        setDnaProgress(0);
        setDnaMessage('');
        dnaStartRef.current = null;
        toast.error(err.message || 'Brand DNA research failed');
      }
    });
  };

  const handleDeleteDna = async () => {
    if (!brandDna) return;
    if (!confirm('Delete Brand DNA? You will need to re-research.')) return;
    try {
      await api.deleteBrandDna(projectId, brandDna.id);
      setBrandDna(null);
      setFilledPrompts([]);
      toast.success('Brand DNA deleted');
    } catch (err) {
      toast.error(err.message || 'Failed to delete');
    }
  };

  // ── Template Selection & Filling ─────────────────────────────────────
  const toggleTemplate = (id) => {
    setSelectedTemplates(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    const filtered = filteredTemplates;
    const allSelected = filtered.every(t => selectedTemplates.has(t.id));
    if (allSelected) {
      setSelectedTemplates(prev => {
        const next = new Set(prev);
        filtered.forEach(t => next.delete(t.id));
        return next;
      });
    } else {
      setSelectedTemplates(prev => {
        const next = new Set(prev);
        filtered.forEach(t => next.add(t.id));
        return next;
      });
    }
  };

  const handleFillTemplates = async () => {
    if (selectedTemplates.size === 0) {
      toast.error('Select at least one template');
      return;
    }
    if (!brandDna) {
      toast.error('Generate Brand DNA first');
      return;
    }

    setFilling(true);
    try {
      const res = await api.fillAdgen2Templates(projectId, {
        template_ids: Array.from(selectedTemplates),
        product_name: productName.trim() || undefined,
      });
      setFilledPrompts(res.prompts || []);
      toast.success(`${(res.prompts || []).length} prompts filled`);
    } catch (err) {
      toast.error(err.message || 'Failed to fill templates');
    } finally {
      setFilling(false);
    }
  };

  // ── Image Generation ─────────────────────────────────────────────────
  const handleGenerateImages = () => {
    if (filledPrompts.length === 0) {
      toast.error('Fill templates first');
      return;
    }

    setGenerating(true);
    setGenProgress(0);
    setGenMessage('Starting image generation...');
    genStartRef.current = Date.now();

    const { abort, done } = api.generateAdgen2Images(
      projectId,
      {
        prompts: filledPrompts.map(p => ({
          templateId: p.templateId,
          templateName: p.templateName,
          filledPrompt: p.filledPrompt,
          originalTemplate: p.originalTemplate,
          aspectRatio: p.aspectRatio,
          needsProductImages: p.needsProductImages,
        })),
        resolution,
        num_images: numImages,
      },
      (event) => {
        if (event.type === 'progress') {
          setGenMessage(event.message || '');
          // Calculate progress based on step naming pattern: generating_N, done_N
          const match = event.step?.match(/(?:generating|done)_(\d+)/);
          if (match) {
            const idx = parseInt(match[1]);
            const total = filledPrompts.length;
            const isDone = event.step.startsWith('done_');
            const pct = isDone
              ? Math.round(((idx + 1) / total) * 95)
              : Math.round((idx / total) * 95) + 2;
            setGenProgress(prev => Math.max(prev, pct));
          }
        } else if (event.type === 'complete') {
          setGenProgress(100);
          setTimeout(() => {
            setGenerating(false);
            setGenProgress(0);
            setGenMessage('');
            genStartRef.current = null;
            toast.success(`${event.count || 0} images generated`);
            loadImages();
            setPhase('gallery');
          }, 500);
        } else if (event.type === 'error') {
          setGenerating(false);
          setGenProgress(0);
          setGenMessage('');
          genStartRef.current = null;
          toast.error(event.message || 'Image generation failed');
        }
      }
    );

    genAbortRef.current = abort;
    done.catch((err) => {
      if (err.name !== 'AbortError') {
        setGenerating(false);
        setGenProgress(0);
        setGenMessage('');
        genStartRef.current = null;
        toast.error(err.message || 'Image generation failed');
      }
    });
  };

  // ── Playground Generation ────────────────────────────────────────────
  const handlePlaygroundGenerate = () => {
    if (!playgroundPrompt.trim()) {
      toast.error('Enter a prompt');
      return;
    }

    setPlaygroundGenerating(true);
    setPgProgress(0);
    setPgMessage('Generating...');
    pgStartRef.current = Date.now();

    const { abort, done } = api.generateAdgen2Single(
      projectId,
      {
        prompt: playgroundPrompt.trim(),
        aspect_ratio: playgroundAspect,
        resolution,
        num_images: numImages,
      },
      (event) => {
        if (event.type === 'progress') {
          setPgMessage(event.message || '');
          if (event.step === 'generating') setPgProgress(prev => Math.max(prev, 10));
          if (event.step === 'storing') setPgProgress(prev => Math.max(prev, 80));
        } else if (event.type === 'complete') {
          setPgProgress(100);
          setTimeout(() => {
            setPlaygroundGenerating(false);
            setPgProgress(0);
            setPgMessage('');
            pgStartRef.current = null;
            toast.success(`${event.count || 0} images generated`);
            loadImages();
            setPhase('gallery');
          }, 500);
        } else if (event.type === 'error') {
          setPlaygroundGenerating(false);
          setPgProgress(0);
          setPgMessage('');
          pgStartRef.current = null;
          toast.error(event.message || 'Generation failed');
        }
      }
    );

    done.catch((err) => {
      if (err.name !== 'AbortError') {
        setPlaygroundGenerating(false);
        setPgProgress(0);
        setPgMessage('');
        pgStartRef.current = null;
        toast.error(err.message || 'Generation failed');
      }
    });
  };

  // ── Image Actions ────────────────────────────────────────────────────
  const handleToggleFavorite = async (image) => {
    try {
      await api.updateAdgen2Image(projectId, image.id, { is_favorite: !image.is_favorite });
      setImages(prev => prev.map(img =>
        img.id === image.id ? { ...img, is_favorite: !img.is_favorite } : img
      ));
    } catch (err) {
      toast.error('Failed to update');
    }
  };

  const handleDeleteImage = async (image) => {
    if (!confirm('Delete this image?')) return;
    try {
      await api.deleteAdgen2Image(projectId, image.id);
      setImages(prev => prev.filter(img => img.id !== image.id));
      if (selectedImage?.id === image.id) setSelectedImage(null);
      toast.success('Image deleted');
    } catch (err) {
      toast.error('Failed to delete');
    }
  };

  // ── Derived data ─────────────────────────────────────────────────────
  const categories = ['all', ...new Set(templates.map(t => t.category))];
  const filteredTemplates = categoryFilter === 'all'
    ? templates
    : templates.filter(t => t.category === categoryFilter);

  const filteredImages = galleryFilter === 'all'
    ? images
    : galleryFilter === 'favorites'
    ? images.filter(img => img.is_favorite)
    : images.filter(img => img.template_name === galleryFilter);

  const templateNames = ['all', 'favorites', ...new Set(images.map(img => img.template_name).filter(Boolean))];

  // Parse visual identity for display
  let visualIdentity = {};
  if (brandDna?.visual_identity) {
    try { visualIdentity = JSON.parse(brandDna.visual_identity); } catch { /* ok */ }
  }

  let photographyStyle = {};
  if (brandDna?.photography_style) {
    try { photographyStyle = typeof brandDna.photography_style === 'string' ? JSON.parse(brandDna.photography_style) : brandDna.photography_style; } catch { /* ok */ }
  }

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Phase Navigation */}
      <div className="flex items-center justify-between">
        <div className="segmented-control">
          <button onClick={() => setPhase('dna')} className={phase === 'dna' ? 'active' : ''}>
            Brand DNA
          </button>
          <button onClick={() => setPhase('prompts')} className={phase === 'prompts' ? 'active' : ''}>
            Prompts
          </button>
          <button onClick={() => setPhase('gallery')} className={phase === 'gallery' ? 'active' : ''}>
            Gallery
          </button>
        </div>

        {/* Status indicators */}
        <div className="flex items-center gap-3 text-xs">
          <span className={`flex items-center gap-1 ${brandDna ? 'text-teal' : 'text-textlight'}`}>
            <span className={`w-2 h-2 rounded-full ${brandDna ? 'bg-teal' : 'bg-textlight/40'}`} />
            DNA
          </span>
          <span className={`flex items-center gap-1 ${filledPrompts.length > 0 ? 'text-teal' : 'text-textlight'}`}>
            <span className={`w-2 h-2 rounded-full ${filledPrompts.length > 0 ? 'bg-teal' : 'bg-textlight/40'}`} />
            {filledPrompts.length} Prompts
          </span>
          <span className={`flex items-center gap-1 ${images.length > 0 ? 'text-teal' : 'text-textlight'}`}>
            <span className={`w-2 h-2 rounded-full ${images.length > 0 ? 'bg-teal' : 'bg-textlight/40'}`} />
            {images.length} Images
          </span>
        </div>
      </div>

      {/* ── Phase 1: Brand DNA ─────────────────────────────────────────── */}
      {phase === 'dna' && (
        <div className="fade-in">
          {dnaLoading ? (
            <div className="flex items-center justify-center py-12">
              <svg className="w-5 h-5 text-navy animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5"
                  strokeDasharray="31.4 31.4" strokeLinecap="round" />
              </svg>
            </div>
          ) : brandDna && brandDna.status === 'completed' ? (
            <BrandDnaDisplay
              dna={brandDna}
              visualIdentity={visualIdentity}
              onDelete={handleDeleteDna}
              onRerun={() => { setBrandDna(null); }}
            />
          ) : (
            <div className="card p-6 space-y-4">
              <div>
                <h3 className="text-base font-semibold text-textdark mb-1">Research Brand DNA</h3>
                <p className="text-xs text-textmid">Enter a brand URL and we'll research their visual identity, colors, fonts, photography style, and create a reusable Image Prompt Modifier.</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-textmid mb-1">Brand URL *</label>
                <input
                  type="url"
                  value={dnaUrl}
                  onChange={e => setDnaUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="input-apple w-full"
                  disabled={dnaGenerating}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-textmid mb-1">Competitor URLs (one per line, optional)</label>
                <textarea
                  value={dnaCompetitors}
                  onChange={e => setDnaCompetitors(e.target.value)}
                  placeholder={"https://competitor1.com\nhttps://competitor2.com"}
                  rows={3}
                  className="input-apple w-full"
                  disabled={dnaGenerating}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-textmid mb-1">Additional Context (optional)</label>
                <textarea
                  value={dnaContext}
                  onChange={e => setDnaContext(e.target.value)}
                  placeholder="Any specific brand details you want to emphasize..."
                  rows={2}
                  className="input-apple w-full"
                  disabled={dnaGenerating}
                />
              </div>

              {dnaGenerating && (
                <PipelineProgress
                  progress={dnaProgress}
                  message={dnaMessage}
                  startTime={dnaStartRef.current}
                />
              )}

              <button
                onClick={handleResearchBrand}
                disabled={dnaGenerating || !dnaUrl.trim()}
                className="btn-primary w-full"
              >
                {dnaGenerating ? 'Researching...' : 'Research Brand'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Phase 2: Prompts ───────────────────────────────────────────── */}
      {phase === 'prompts' && (
        <div className="fade-in space-y-4">
          {!brandDna ? (
            <div className="card p-8 text-center">
              <p className="text-sm text-textmid mb-3">Generate Brand DNA first to fill templates.</p>
              <button onClick={() => setPhase('dna')} className="btn-secondary">
                Go to Brand DNA
              </button>
            </div>
          ) : (
            <>
              {/* Template Browser */}
              <div className="card p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-textdark">Select Templates</h3>
                  <div className="flex items-center gap-2">
                    <button onClick={selectAll} className="text-xs text-gold hover:text-gold-light">
                      {filteredTemplates.every(t => selectedTemplates.has(t.id)) ? 'Deselect All' : 'Select All'}
                    </button>
                    <span className="text-xs text-textlight">
                      {selectedTemplates.size} selected
                    </span>
                  </div>
                </div>

                {/* Category filter */}
                <div className="flex flex-wrap gap-1.5">
                  {categories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setCategoryFilter(cat)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                        categoryFilter === cat
                          ? 'bg-navy text-white'
                          : 'bg-offwhite text-textmid hover:bg-navy/5'
                      }`}
                    >
                      {cat === 'all' ? 'All' : CATEGORY_LABELS[cat] || cat}
                    </button>
                  ))}
                </div>

                {/* Template grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredTemplates.map(t => (
                    <button
                      key={t.id}
                      onClick={() => toggleTemplate(t.id)}
                      className={`text-left p-3 rounded-lg border transition-all ${
                        selectedTemplates.has(t.id)
                          ? 'border-navy bg-navy/5 ring-1 ring-navy/20'
                          : 'border-black/5 hover:border-navy/20 hover:bg-offwhite'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-textdark truncate">{t.name}</p>
                          <p className="text-[11px] text-textmid mt-0.5 line-clamp-2">{t.description}</p>
                        </div>
                        <div className={`w-4 h-4 rounded border flex-shrink-0 mt-0.5 flex items-center justify-center ${
                          selectedTemplates.has(t.id)
                            ? 'bg-navy border-navy'
                            : 'border-textlight/40'
                        }`}>
                          {selectedTemplates.has(t.id) && (
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${CATEGORY_COLORS[t.category] || CATEGORY_COLORS.other}`}>
                          {CATEGORY_LABELS[t.category] || t.category}
                        </span>
                        <span className="text-[10px] text-textlight">{t.aspect_ratio}</span>
                        {t.needs_product_images && (
                          <span className="text-[10px] text-textlight">+ product photos</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Fill Controls */}
              <div className="card p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-textmid mb-1">Product Name (optional)</label>
                    <input
                      type="text"
                      value={productName}
                      onChange={e => setProductName(e.target.value)}
                      placeholder="Override product name from Brand DNA..."
                      className="input-apple w-full"
                      disabled={filling}
                    />
                  </div>
                  <button
                    onClick={handleFillTemplates}
                    disabled={filling || selectedTemplates.size === 0}
                    className="btn-primary mt-5"
                  >
                    {filling ? 'Filling...' : `Fill ${selectedTemplates.size} Template${selectedTemplates.size !== 1 ? 's' : ''}`}
                  </button>
                </div>
              </div>

              {/* Filled Prompts */}
              {filledPrompts.length > 0 && (
                <div className="card p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold text-textdark">Filled Prompts ({filledPrompts.length})</h3>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-textmid">Resolution:</label>
                        <select value={resolution} onChange={e => setResolution(e.target.value)} className="input-apple text-xs py-1 px-2">
                          <option value="0.5K">0.5K</option>
                          <option value="1K">1K</option>
                          <option value="2K">2K</option>
                          <option value="4K">4K</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-textmid">Per prompt:</label>
                        <select value={numImages} onChange={e => setNumImages(Number(e.target.value))} className="input-apple text-xs py-1 px-2">
                          <option value={1}>1</option>
                          <option value={2}>2</option>
                          <option value={4}>4</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {filledPrompts.map((p, i) => (
                      <FilledPromptCard key={p.templateId + '-' + i} prompt={p} />
                    ))}
                  </div>

                  {generating && (
                    <PipelineProgress
                      progress={genProgress}
                      message={genMessage}
                      startTime={genStartRef.current}
                    />
                  )}

                  <div className="flex items-center justify-between pt-2">
                    <p className="text-[11px] text-textlight">
                      Estimated: ~{filledPrompts.length * numImages} images, ~${(filledPrompts.length * numImages * (resolution === '4K' ? 0.16 : resolution === '2K' ? 0.12 : resolution === '1K' ? 0.08 : 0.06)).toFixed(2)}
                    </p>
                    <button
                      onClick={handleGenerateImages}
                      disabled={generating}
                      className="btn-primary"
                    >
                      {generating ? 'Generating...' : `Generate ${filledPrompts.length * numImages} Images`}
                    </button>
                  </div>
                </div>
              )}

              {/* Playground */}
              <div className="card p-5 space-y-3">
                <h3 className="text-base font-semibold text-textdark">Playground</h3>
                <p className="text-xs text-textmid">Generate images from a custom prompt (no template needed).</p>

                <textarea
                  value={playgroundPrompt}
                  onChange={e => setPlaygroundPrompt(e.target.value)}
                  placeholder="Enter your image generation prompt..."
                  rows={4}
                  className="input-apple w-full"
                  disabled={playgroundGenerating}
                />

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-textmid">Aspect:</label>
                    <select value={playgroundAspect} onChange={e => setPlaygroundAspect(e.target.value)} className="input-apple text-xs py-1 px-2">
                      <option value="1:1">1:1</option>
                      <option value="4:5">4:5</option>
                      <option value="9:16">9:16</option>
                      <option value="16:9">16:9</option>
                      <option value="3:2">3:2</option>
                    </select>
                  </div>
                  <div className="flex-1" />
                  <button
                    onClick={handlePlaygroundGenerate}
                    disabled={playgroundGenerating || !playgroundPrompt.trim()}
                    className="btn-primary"
                  >
                    {playgroundGenerating ? 'Generating...' : 'Generate'}
                  </button>
                </div>

                {playgroundGenerating && (
                  <PipelineProgress
                    progress={pgProgress}
                    message={pgMessage}
                    startTime={pgStartRef.current}
                  />
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Phase 3: Gallery ───────────────────────────────────────────── */}
      {phase === 'gallery' && (
        <div className="fade-in space-y-4">
          {/* Gallery filter */}
          <div className="flex items-center justify-between">
            <div className="flex flex-wrap gap-1.5">
              {templateNames.map(name => (
                <button
                  key={name}
                  onClick={() => setGalleryFilter(name)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                    galleryFilter === name
                      ? 'bg-navy text-white'
                      : 'bg-offwhite text-textmid hover:bg-navy/5'
                  }`}
                >
                  {name === 'all' ? `All (${images.length})` : name === 'favorites' ? `Favorites (${images.filter(i => i.is_favorite).length})` : name}
                </button>
              ))}
            </div>
            <button onClick={loadImages} className="text-xs text-gold hover:text-gold-light">
              Refresh
            </button>
          </div>

          {imagesLoading ? (
            <div className="flex items-center justify-center py-12">
              <svg className="w-5 h-5 text-navy animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5"
                  strokeDasharray="31.4 31.4" strokeLinecap="round" />
              </svg>
            </div>
          ) : filteredImages.length === 0 ? (
            <div className="card p-8 text-center">
              <p className="text-sm text-textmid">
                {images.length === 0 ? 'No images yet. Generate some from the Prompts tab.' : 'No images match this filter.'}
              </p>
              {images.length === 0 && (
                <button onClick={() => setPhase('prompts')} className="btn-secondary mt-3">
                  Go to Prompts
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredImages.map(img => (
                <ImageCard
                  key={img.id}
                  image={img}
                  onSelect={() => setSelectedImage(img)}
                  onToggleFavorite={() => handleToggleFavorite(img)}
                  onDelete={() => handleDeleteImage(img)}
                />
              ))}
            </div>
          )}

          {/* Image Detail Modal */}
          {selectedImage && (
            <ImageDetailModal
              image={selectedImage}
              onClose={() => setSelectedImage(null)}
              onToggleFavorite={() => handleToggleFavorite(selectedImage)}
              onDelete={() => handleDeleteImage(selectedImage)}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-Components ─────────────────────────────────────────────────────

function BrandDnaDisplay({ dna, visualIdentity, onDelete, onRerun }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-textdark">Brand DNA</h3>
          <p className="text-[11px] text-textlight mt-0.5">
            Researched from {dna.brand_url} {dna.duration_ms ? `in ${Math.round(dna.duration_ms / 1000)}s` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onRerun} className="text-xs text-gold hover:text-gold-light">
            Re-research
          </button>
          <button onClick={onDelete} className="text-xs text-red-500 hover:text-red-600">
            Delete
          </button>
        </div>
      </div>

      {/* Color swatches */}
      {visualIdentity.primary_color && (
        <div className="flex items-center gap-2">
          {['primary_color', 'secondary_color', 'accent_color', 'cta_color'].map(key => {
            const color = visualIdentity[key];
            if (!color) return null;
            return (
              <div key={key} className="flex items-center gap-1.5">
                <div
                  className="w-6 h-6 rounded border border-black/10"
                  style={{ backgroundColor: color }}
                  title={`${key.replace(/_/g, ' ')}: ${color}`}
                />
                <span className="text-[10px] text-textlight">{color}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Image Prompt Modifier (most important) */}
      {dna.image_prompt_modifier && (
        <div className="bg-navy/5 rounded-lg p-3">
          <p className="text-[11px] font-medium text-navy mb-1">Image Prompt Modifier</p>
          <p className="text-xs text-textdark leading-relaxed">{dna.image_prompt_modifier}</p>
        </div>
      )}

      {/* Brand overview */}
      {dna.brand_overview && (
        <div>
          <p className="text-[11px] font-medium text-textmid mb-1">Brand Overview</p>
          <p className="text-xs text-textdark leading-relaxed">{dna.brand_overview}</p>
        </div>
      )}

      {/* Expandable sections */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-gold hover:text-gold-light flex items-center gap-1"
      >
        {expanded ? 'Show less' : 'Show full DNA'}
        <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-black/5 pt-3">
          {/* Visual Identity */}
          {visualIdentity && Object.keys(visualIdentity).length > 0 && (
            <div>
              <p className="text-[11px] font-medium text-textmid mb-1">Visual Identity</p>
              <div className="grid grid-cols-2 gap-2 text-xs text-textdark">
                {Object.entries(visualIdentity).map(([k, v]) => {
                  if (['primary_color', 'secondary_color', 'accent_color', 'cta_color', 'background_colors'].includes(k)) return null;
                  return (
                    <div key={k}>
                      <span className="text-textlight">{k.replace(/_/g, ' ')}:</span>{' '}
                      {typeof v === 'string' ? v : JSON.stringify(v)}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {dna.target_audience && (
            <div>
              <p className="text-[11px] font-medium text-textmid mb-1">Target Audience</p>
              <p className="text-xs text-textdark">{dna.target_audience}</p>
            </div>
          )}

          {dna.tone_and_voice && (
            <div>
              <p className="text-[11px] font-medium text-textmid mb-1">Tone & Voice</p>
              <p className="text-xs text-textdark">{dna.tone_and_voice}</p>
            </div>
          )}

          {dna.competitor_analysis && (
            <div>
              <p className="text-[11px] font-medium text-textmid mb-1">Competitor Analysis</p>
              <p className="text-xs text-textdark">{dna.competitor_analysis}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FilledPromptCard({ prompt }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-black/5 rounded-lg p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${CATEGORY_COLORS[prompt.category] || CATEGORY_COLORS.other}`}>
            {CATEGORY_LABELS[prompt.category] || prompt.category}
          </span>
          <span className="text-sm font-medium text-textdark truncate">{prompt.templateName}</span>
          <span className="text-[10px] text-textlight">{prompt.aspectRatio}</span>
          {prompt.needsProductImages && (
            <span className="text-[10px] text-gold">+ product</span>
          )}
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-gold hover:text-gold-light flex-shrink-0"
        >
          {expanded ? 'Hide' : 'Show'}
        </button>
      </div>
      {expanded && (
        <div className="mt-2 bg-offwhite rounded p-2">
          <p className="text-xs text-textdark leading-relaxed whitespace-pre-wrap">{prompt.filledPrompt}</p>
        </div>
      )}
    </div>
  );
}

function ImageCard({ image, onSelect, onToggleFavorite, onDelete }) {
  const imageUrl = image.imageUrl || image.fal_image_url;

  return (
    <div className="group relative rounded-lg overflow-hidden border border-black/5 bg-white cursor-pointer hover:shadow-card-hover transition-shadow">
      <div className="aspect-square bg-offwhite" onClick={onSelect}>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={image.template_name || 'Generated image'}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-textlight text-xs">
            No preview
          </div>
        )}
      </div>

      {/* Overlay controls */}
      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={e => { e.stopPropagation(); onToggleFavorite(); }}
          className={`w-7 h-7 rounded-full flex items-center justify-center backdrop-blur-sm transition-colors ${
            image.is_favorite ? 'bg-gold/80 text-white' : 'bg-black/30 text-white hover:bg-gold/60'
          }`}
        >
          <svg className="w-3.5 h-3.5" fill={image.is_favorite ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
        </button>
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          className="w-7 h-7 rounded-full bg-black/30 text-white hover:bg-red-500/80 flex items-center justify-center backdrop-blur-sm transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      {/* Bottom info */}
      {image.template_name && (
        <div className="px-2 py-1.5 border-t border-black/5">
          <p className="text-[10px] text-textmid truncate">{image.template_name}</p>
        </div>
      )}
    </div>
  );
}

function ImageDetailModal({ image, onClose, onToggleFavorite, onDelete }) {
  const imageUrl = image.imageUrl || image.fal_image_url;

  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-black/5">
          <div className="flex items-center gap-3 min-w-0">
            <h3 className="text-sm font-semibold text-textdark truncate">{image.template_name || 'Generated Image'}</h3>
            {image.aspect_ratio && <span className="text-[11px] text-textlight">{image.aspect_ratio}</span>}
            {image.resolution && <span className="text-[11px] text-textlight">{image.resolution}</span>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onToggleFavorite} className="text-xs text-gold hover:text-gold-light">
              {image.is_favorite ? 'Unfavorite' : 'Favorite'}
            </button>
            {imageUrl && (
              <a href={imageUrl} download target="_blank" rel="noopener noreferrer" className="text-xs text-gold hover:text-gold-light">
                Download
              </a>
            )}
            <button onClick={onDelete} className="text-xs text-red-500 hover:text-red-600">
              Delete
            </button>
            <button onClick={onClose} className="text-textlight hover:text-textdark ml-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Image */}
        <div className="flex-1 overflow-auto p-4 bg-offwhite flex items-center justify-center">
          {imageUrl ? (
            <img src={imageUrl} alt="" className="max-w-full max-h-[60vh] object-contain rounded" />
          ) : (
            <p className="text-textlight text-sm">No preview available</p>
          )}
        </div>

        {/* Prompt */}
        {image.filled_prompt && (
          <div className="px-4 py-3 border-t border-black/5 max-h-32 overflow-auto">
            <p className="text-[11px] font-medium text-textmid mb-1">Prompt</p>
            <p className="text-xs text-textdark leading-relaxed">{image.filled_prompt}</p>
          </div>
        )}
      </div>
    </div>
  );
}
