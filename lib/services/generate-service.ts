/**
 * Generate API Service
 * Implements differential diagnosis generation using Gemini AI and Google Custom Search
 */
import { serverEnv } from '@/lib/env/server';
import { createRequestLogger } from '@/lib/observability/logger';
import type { Json } from '@/lib/supabase/database.types';

const GEMINI_API_KEY = serverEnv.GEMINI_API_KEY;
const SEARCH_API_KEY = serverEnv.SEARCH_API_KEY || '';
const CX = serverEnv.SEARCH_CX || '';
const SEMANTIC_SCHOLAR_API_KEY = serverEnv.SEMANTIC_SCHOLAR_API_KEY || '';
const PROVIDER_TIMEOUT_MS = 90000;
const PROVIDER_MAX_RETRIES = 2;
const logger = createRequestLogger({ route: 'lib/services/generate-service' });

// Per-category bias instructions injected into the diagnostic prompt
const DIFFERENTIAL_BIAS: Record<string, string> = {
  Auto: 'Based on the imaging features described, determine the most appropriate differential diagnoses from any of the above categories.',
  Tumor: 'PRIORITIZE tumor/neoplasm diagnoses. Lead with the most likely tumor entity, but include non-tumor diagnoses if the imaging features genuinely support them.',
  Arthritis: 'PRIORITIZE arthritis/arthropathy diagnoses. Lead with the most likely arthritis pattern, but include non-arthritic diagnoses if imaging features support them.',
  Trauma: 'PRIORITIZE trauma-related diagnoses (fracture, stress fracture, ligament/tendon tear, bone contusion). Include non-traumatic diagnoses if clinically relevant.',
  Infection: 'PRIORITIZE infectious etiologies (osteomyelitis, septic arthritis, Brodie abscess, soft tissue infection). Include alternative diagnoses if imaging features allow.',
  AVN: 'PRIORITIZE avascular necrosis/osteonecrosis patterns. Include other diagnoses if the imaging pattern is not classic for AVN.',
  Inflammatory: 'PRIORITIZE inflammatory conditions (bursitis, tendinopathy, synovitis, enthesopathy, PVNS/TGCT). Include other diagnoses if appropriate.',
  Developmental: 'PRIORITIZE developmental/congenital conditions (FAI, tarsal coalition, fibrous dysplasia, dysplasia). Include acquired diagnoses if supported by imaging.',
  Vascular: 'PRIORITIZE vascular and metabolic bone conditions (bone infarct, Paget\'s disease, metabolic bone disease). Include other diagnoses if appropriate.',
};

const TASK_SELECTION_PROMPT = `<< INSTRUCTION >>

You are an expert radiologist.

You are given a block of text.

Determine whether the text is a clinical or imaging description that warrants a radiology differential diagnosis.

OUTPUT FORMAT (JSON):

{
  "task": "[task name]"
}
with task name being one of the following:
- "diagnostic" (the text is a clinical/imaging description suitable for differential diagnosis)
- "none" (the text is not a medical imaging description)
`;

const INSTRUCTION_DIAGNOSTIC = `<< INSTRUCTION >>

You are an expert musculoskeletal radiologist.

Read the clinical/imaging description below.

First, extract the key imaging features from the description: signal characteristics (T1, T2, STIR), enhancement pattern, bone involvement (lytic, sclerotic, mixed), lesion location (epiphysis, metaphysis, diaphysis), margins, periosteal reaction, soft tissue involvement, and relevant clinical data (age, sex, history).

Then provide the TOP 3 MOST LIKELY DIFFERENTIAL DIAGNOSES in order of likelihood, drawing from any of these categories:
- Tumor/Neoplasm (benign or malignant: osteosarcoma, chondrosarcoma, Ewing sarcoma, GCT, NOF, enchondroma, osteoid osteoma, lipoma, synovial sarcoma, metastasis, lymphoma, etc.)
- Arthritis (OA, RA, gout/CPPD, psoriatic arthritis, septic arthritis, erosive arthropathy)
- Trauma (fracture, stress fracture, bone contusion, ligament/tendon tear, avulsion fracture)
- Infection (osteomyelitis, septic arthritis, Brodie abscess, soft tissue infection)
- Avascular Necrosis (osteonecrosis: femoral head, talus, carpal bones, Kienbock's, Freiberg's)
- Inflammatory/Tendinopathy (bursitis, tendinopathy, synovitis, enthesopathy, PVNS/TGCT)
- Developmental/Congenital (FAI, tarsal coalition, fibrous dysplasia, bone dysplasia)
- Vascular/Metabolic (bone infarct, Paget's disease, osteoporosis, hyperparathyroidism)

{BIAS}

OUTPUT FORMAT (follow exactly, use markdown, no preamble):

## DIFFERENTIAL DIAGNOSIS: {CATEGORY}

**Imaging features:** [concise comma-separated summary of the key extracted features]

**1. [Diagnosis Name]** [1-2 sentences explaining which imaging features support this diagnosis]

**2. [Diagnosis Name]** [1-2 sentences explaining which imaging features support this diagnosis]

**3. [Diagnosis Name]** [1-2 sentences explaining which imaging features support this diagnosis]

<< DESCRIPTION >>`;

const KEYWORD_EXTRACTION_FOR_SEARCH_API = `You are a medical imaging search optimizer.

Given a radiology differential diagnosis report, extract the TOP 3 diagnoses and create an optimized Google image search query for each.

OUTPUT FORMAT (return ONLY a JSON array, no other text):
[
  {
    "differentialName": "Osteosarcoma",
    "searchQuery": "osteosarcoma MRI distal femur"
  },
  {
    "differentialName": "Ewing Sarcoma",
    "searchQuery": "Ewing sarcoma MRI bone radiology"
  },
  {
    "differentialName": "Giant Cell Tumor",
    "searchQuery": "giant cell tumor bone MRI epiphysis"
  }
]

RULES:
- Extract exactly 3 diagnoses from the report
- Each search query: diagnosis + imaging modality + anatomy (concise, common medical terms)
- Return ONLY the JSON array

Report to process:
`;

export interface GenerateRequest {
  draft: string;
  /**
   * UI-level task type used to bias the differential diagnosis prompt.
   * Defaults to 'Auto' (no bias).
   */
  differentialBias?: string;
}

export interface GenerateResponse {
  ok: boolean;
  type?: string;
  result?: string;
  error?: string;
}

export interface ImageResult {
  title: string;
  link: string;
  displayLink: string;
  snippet: string;
  image: ImagePayload;
  [key: string]: Json | undefined;
}

export interface ImagePayload {
  contextLink: string;
  thumbnailLink: string;
  width: number;
  height: number;
  [key: string]: Json | undefined;
}

export interface DifferentialImageGroup {
  differentialName: string;
  searchQuery: string;
  images: ImageResult[];
  [key: string]: Json | undefined;
}

export interface ImageGenerationResult {
  groups: DifferentialImageGroup[];
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

async function fetchWithRetry(
  input: string | URL,
  init: RequestInit,
  options?: { timeoutMs?: number; retries?: number }
): Promise<Response> {
  const timeoutMs = options?.timeoutMs ?? PROVIDER_TIMEOUT_MS;
  const retries = options?.retries ?? PROVIDER_MAX_RETRIES;
  let attempt = 0;

  while (true) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(input, { ...init, signal: controller.signal });
      if (response.ok) return response;
      if (attempt < retries && shouldRetryStatus(response.status)) {
        // Use a longer base delay for rate limit responses
        const baseMs = response.status === 429 ? 1000 : 300;
        await sleep(baseMs * 2 ** attempt);
        attempt += 1;
        continue;
      }
      return response;
    } catch (error) {
      if (attempt < retries) {
        await sleep(300 * 2 ** attempt);
        attempt += 1;
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

/**
 * For Auto mode: ask Gemini whether the text warrants a differential diagnosis.
 */
export async function selectTaskForAutoMode(
  draft: string
): Promise<'diagnostic' | 'none'> {
  const prompt = `${TASK_SELECTION_PROMPT}\n\n<< TEXT >>\n${draft.trim()}`;
  const raw = await callGemini(prompt);

  let cleaned = raw.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
  if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();

  try {
    const parsed = JSON.parse(cleaned);
    const task = String(parsed.task || '').toLowerCase();
    if (task === 'diagnostic' || task === 'none') return task;
  } catch (err) {
    logger.error('generate.task_selection.parse_failed', err, {
      responsePreview: cleaned.slice(0, 200),
    });
  }

  return 'none';
}

// Maps UI task names to readable category labels for the output header
const CATEGORY_LABEL: Record<string, string> = {
  Auto: '[determine the most appropriate category from the list above and write it here]',
  Tumor: 'Tumor / Neoplasm',
  Arthritis: 'Arthritis',
  Trauma: 'Trauma',
  Infection: 'Infection',
  AVN: 'Avascular Necrosis',
  Inflammatory: 'Inflammatory / Tendinopathy',
  Developmental: 'Developmental / Congenital',
  Vascular: 'Vascular / Metabolic',
};

/**
 * Builds the differential diagnosis prompt with the appropriate bias and category header.
 */
function buildDiagnosticPrompt(draft: string, differentialBias?: string): string {
  const bias = DIFFERENTIAL_BIAS[differentialBias ?? 'Auto'] ?? DIFFERENTIAL_BIAS['Auto'];
  const category = CATEGORY_LABEL[differentialBias ?? 'Auto'] ?? CATEGORY_LABEL['Auto'];
  return INSTRUCTION_DIAGNOSTIC
    .replace('{BIAS}', bias)
    .replace('{CATEGORY}', category)
    .replace('<< DESCRIPTION >>', `<< DESCRIPTION >>\n${draft.trim()}`);
}

/**
 * Calls the Gemini API to generate content
 */
async function callGemini(promptText: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const response = await fetchWithRetry(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
      }),
    },
    { timeoutMs: PROVIDER_TIMEOUT_MS, retries: PROVIDER_MAX_RETRIES }
  );

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errorData}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No text returned from API.';
}

/**
 * Searches for images using Google Custom Search API
 */
async function searchImages(query: string, num: number = 5): Promise<ImageResult[]> {
  if (!SEARCH_API_KEY || !CX) {
    logger.warn('generate.images.search_config_missing');
    return [];
  }

  try {
    const url = new URL('https://www.googleapis.com/customsearch/v1');
    url.searchParams.set('key', SEARCH_API_KEY);
    url.searchParams.set('cx', CX);
    url.searchParams.set('q', query);
    url.searchParams.set('searchType', 'image');
    url.searchParams.set('num', String(num));
    url.searchParams.set('imgSize', 'MEDIUM');
    url.searchParams.set('safe', 'active');

    const response = await fetchWithRetry(
      url.toString(),
      { method: 'GET' },
      { timeoutMs: PROVIDER_TIMEOUT_MS, retries: PROVIDER_MAX_RETRIES }
    );

    if (!response.ok) {
      const errorData = await response.text();
      logger.error('generate.images.search_failed', undefined, {
        status: response.status,
        errorData,
      });
      return [];
    }

    const data = await response.json();
    if (!data.items) return [];

    return data.items.map((item: Record<string, unknown>) => ({
      title: item.title || '',
      link: item.link || '',
      displayLink: item.displayLink || '',
      snippet: item.snippet || '',
      image: {
        contextLink: (item.image as Record<string, unknown>)?.contextLink || '',
        thumbnailLink: (item.image as Record<string, unknown>)?.thumbnailLink || '',
        width: (item.image as Record<string, unknown>)?.width || 0,
        height: (item.image as Record<string, unknown>)?.height || 0,
      },
    }));
  } catch (error) {
    logger.error('generate.images.search_failed', error);
    return [];
  }
}

/**
 * Image generation helper.
 * Extracts 3 differentials from the AI response, runs 3 parallel Google searches (5 images each),
 * and returns grouped results labeled by differential name.
 */
export async function generateImagesForDraft(draft: string): Promise<ImageGenerationResult> {
  try {
    if (!draft || !draft.trim()) return { groups: [] };

    const keywordPrompt = KEYWORD_EXTRACTION_FOR_SEARCH_API + draft;
    const keywordResponse = await callGemini(keywordPrompt);

    let cleaned = keywordResponse.trim();
    if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
    if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
    if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
    cleaned = cleaned.trim();

    const extracted: Array<{ differentialName: string; searchQuery: string }> = JSON.parse(cleaned);

    // Run all 3 searches in parallel
    const groups = await Promise.all(
      extracted.map(async (g) => ({
        differentialName: g.differentialName,
        searchQuery: g.searchQuery,
        images: await searchImages(g.searchQuery, 5),
      }))
    );

    return { groups };
  } catch (error) {
    logger.error('generate.images.keyword_or_search_failed', error);
    return { groups: [] };
  }
}

export interface PaperResult {
  title: string;
  authors: string;
  url: string;
  [key: string]: Json | undefined;
}

export interface DiagnosisPaperGroup {
  diagnosisName: string;
  paper: PaperResult | null;
  [key: string]: Json | undefined;
}

export interface PaperGenerationResult {
  groups: DiagnosisPaperGroup[];
}

/**
 * Extracts the top 3 diagnosis names from a diagnostic markdown report.
 * Handles formats like:
 *   **1. Osteosarcoma** ...
 *   **1. Giant Cell Tumor (GCT)** ...
 *   **1. Tenosynovial Giant Cell Tumor, Localized Type** ...
 */
function extractDiagnosisNames(content: string): string[] {
  // Match **N. Diagnosis Name** — capture everything between the bold markers after the number
  const matches = Array.from(content.matchAll(/\*\*\d+\.\s+([^*\n]+?)\*\*/g));
  return matches
    .slice(0, 3)
    .map((m) => {
      // Strip trailing parenthetical abbreviations like "(GCT)" for cleaner search
      return m[1].trim().replace(/\s*\([^)]*\)\s*$/, '').trim();
    })
    .filter(Boolean);
}

async function searchPaper(diagnosisName: string): Promise<PaperResult | null> {
  const query = `${diagnosisName} MRI radiology imaging`;
  const url = new URL('https://api.semanticscholar.org/graph/v1/paper/search');
  url.searchParams.set('query', query);
  url.searchParams.set('fields', 'title,authors,year,url,paperId,citationCount');
  url.searchParams.set('limit', '10');

  const headers: Record<string, string> = {};
  if (SEMANTIC_SCHOLAR_API_KEY) {
    headers['x-api-key'] = SEMANTIC_SCHOLAR_API_KEY;
  }

  try {
    const response = await fetchWithRetry(
      url.toString(),
      { method: 'GET', headers },
      { timeoutMs: 15000, retries: 3 }
    );

    if (!response.ok) {
      logger.error('generate.papers.search_failed', undefined, {
        diagnosisName,
        status: response.status,
      });
      return null;
    }

    const data = await response.json();
    const results: Array<{
      title?: string;
      url?: string;
      paperId?: string;
      authors?: Array<{ name: string }>;
      year?: number;
      citationCount?: number;
    }> = data.data ?? [];

    // Filter to candidates with a meaningful title (>10 chars) and a resolvable URL
    const candidates = results.filter(
      (p) =>
        p.title &&
        p.title.trim().length > 10 &&
        (p.url || p.paperId)
    );

    if (candidates.length === 0) return null;

    // Prefer papers that have both a year and authors; among those, pick the most-cited
    const withMeta = candidates.filter((p) => p.year && p.authors && p.authors.length > 0);
    const pool = withMeta.length > 0 ? withMeta : candidates;
    const best = pool.reduce((top, p) =>
      (p.citationCount ?? 0) > (top.citationCount ?? 0) ? p : top
    );

    const paperUrl =
      best.url ||
      (best.paperId ? `https://www.semanticscholar.org/paper/${best.paperId}` : '');

    if (!paperUrl) return null;

    const names = (best.authors ?? []).map((a) => a.name);
    const authorStr =
      names.length === 0 ? '' :
      names.length > 2 ? `${names[0]} et al.` :
      names.join(', ');
    const authorsYear = best.year
      ? authorStr ? `${authorStr} (${best.year})` : String(best.year)
      : authorStr;

    return {
      title: best.title ?? '',
      authors: authorsYear,
      url: paperUrl,
    };
  } catch (error) {
    logger.error('generate.papers.search_exception', error, { diagnosisName });
    return null;
  }
}

/**
 * Searches Semantic Scholar for one paper per differential diagnosis extracted
 * from a completed diagnostic report.
 * With an API key: runs all searches in parallel (100 req/sec limit).
 * Without: staggers at 1.1s intervals to respect the unauthenticated rate limit.
 */
export async function searchPapersForContent(content: string): Promise<PaperGenerationResult> {
  const names = extractDiagnosisNames(content);
  if (names.length === 0) return { groups: [] };

  if (SEMANTIC_SCHOLAR_API_KEY) {
    // Authenticated — parallel is safe
    const results = await Promise.all(
      names.map(async (name) => ({
        diagnosisName: name,
        paper: await searchPaper(name),
      }))
    );
    return { groups: results };
  }

  // Unauthenticated — stagger to respect 1 req/sec limit
  const groups: DiagnosisPaperGroup[] = [];
  for (let i = 0; i < names.length; i++) {
    if (i > 0) await sleep(1100);
    groups.push({
      diagnosisName: names[i],
      paper: await searchPaper(names[i]),
    });
  }
  return { groups };
}

/**
 * Streams a differential diagnosis from Gemini using SSE.
 * Yields text chunks as they arrive. The caller is responsible for assembling
 * the full text and persisting it to the DB.
 */
export async function* streamGeminiReport(
  request: GenerateRequest
): AsyncGenerator<string, void, unknown> {
  const { draft, differentialBias = 'Auto' } = request;

  if (!draft || !draft.trim()) {
    throw new Error('Description is empty');
  }

  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const prompt = buildDiagnosticPrompt(draft, differentialBias);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
        signal: controller.signal,
      }
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Gemini streaming API error: ${response.status} - ${errorData}`);
  }

  if (!response.body) {
    throw new Error('Gemini streaming API returned no body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      // Keep the last (potentially incomplete) line in the buffer
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const jsonStr = trimmed.slice(5).trim();
        if (!jsonStr || jsonStr === '[DONE]') continue;

        try {
          const parsed = JSON.parse(jsonStr);
          const chunk: string =
            parsed?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
          if (chunk) yield chunk;
        } catch {
          // Malformed SSE line — skip
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Main generate function — produces a differential diagnosis using Gemini.
 */
export async function generateReport(request: GenerateRequest): Promise<GenerateResponse> {
  try {
    const { draft, differentialBias = 'Auto' } = request;

    if (!draft || !draft.trim()) {
      return { ok: false, error: 'Description is empty' };
    }

    const prompt = buildDiagnosticPrompt(draft, differentialBias);
    const aiText = await callGemini(prompt);

    return {
      ok: true,
      type: 'diagnostic',
      result: aiText,
    };
  } catch (error) {
    logger.error('generate.report_failed', error, {
      differentialBias: request.differentialBias ?? 'Auto',
    });
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred',
    };
  }
}
