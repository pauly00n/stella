/**
 * Generate API Service
 * Implements the report generation logic using Gemini AI and Google Custom Search
 */
import { serverEnv } from '@/lib/env/server';

const GEMINI_API_KEY = serverEnv.GEMINI_API_KEY;
const SEARCH_API_KEY = serverEnv.SEARCH_API_KEY || '';
const CX = serverEnv.SEARCH_CX || '';
const PROVIDER_TIMEOUT_MS = 30000;
const PROVIDER_MAX_RETRIES = 2;

// Keywords for classification
const KEYWORDS: Record<string, string[]> = {
  "shoulder": [
    "shoulder", "rotator cuff", "supraspinatus", "infraspinatus", "subscapularis", "teres minor",
    "acromion", "acromioclavicular", "ac joint", "subacrom", "subdeltoid",
    "glenoid", "labrum", "labral", "biceps anchor", "long head biceps", "bicipital groove",
    "greater tuberosity", "lesser tuberosity"
  ],
  "knee": [
    "knee", "acl", "pcl", "cruciate",
    "meniscus", "meniscal",
    "root tear", "bucket-handle",
    "patella", "patellar", "patellofemoral", "hoffa", "baker", "pes anserine",
    "quadriceps", "tibia", "distal fem"
  ],
  "ankle": [
    "ankle", "talar", "talus", "calcaneus", "subtalar", "tibiotalar",
    "deltoid ligament", "spring ligament", "atfl", "cfl", "ptfl", "tibiofibular",
    "tibialis posterior", "achilles", "plantar fascia",
    "sinus tarsi"
  ],
  "elbow": [
    "elbow", "ulnar collateral", "radial collateral", "rcl", "ucl",
    "common flexor", "common extensor",
    "distal biceps", "triceps", "annular ligament"
  ],
  "hip": [
    "hip", "femoroacetabular", "acetabulum", "femoral head",
    "ligamentum teres", "iliopsoas", "greater trochanter", "less trochanter",
    "gluteus", "hamstring", "piriformis"
  ],
  "wrist": [
    "wrist", "carpal", "scaphoid", "lunate", "triquetrum", "tfcc", "triangular fibrocartilage",
    "scapholunate", "lunotriquetral", "carpal tunnel", "guyon",
    "dorsal capsule"
  ],
  "chest_ct": [
    "ct chest", "chest ct", "lungs", "pulmonary", "consolidation",
    "ground-glass", "ggo", "emphysema", "bronchiectasis", "atelectasis",
    "pneumothorax", "pleural", "mediastinum", "hilar", "lymph node",
    "lymphadenopathy", "trachea", "bronchi", "aorta", "heart", "cardiac", "coronary",
    "esophagus"
  ],
};

// Templates for different report types
const TEMPLATES: Record<string, string> = {
  "ankle": `MSK EXAM: MRI ANKLE

Clinical History:

Comparison: None.

Technique: MRI of the ankle was performed.

Findings:

Bones and Cartilage: Bone marrow signal intensity is within normal limits. The articular cartilage is intact with no areas of full thickness loss.

Fluid: No joint effusion or peri articular fluid collections.

Ligaments: The anterior and posterior tibiofibular ligaments are intact. The lateral ankle ligaments and deltoid ligament are intact. The spring ligament is intact.

Tendons: The flexor, peroneal, and extensor tendons are intact. The Achilles tendon is intact.

Plantar fascia: The plantar fascia is intact without a discrete tear.

Sinus tarsi: The sinus tarsi demonstrates normal fat signal intensity.

Additional findings: None.

Impression:

1.Normal MRI of the ankle.`,

  "elbow": `MSK EXAM: MRI ELBOW

Clinical History:

Comparison: None.

Technique: MRI of the elbow was performed.

Findings:

Bones and Cartilage: Bone marrow signal intensity is within normal limits. The articular cartilage is intact with no areas of full thickness loss or delamination.

Fluid: No joint effusion or peri articular ganglion.

Ligaments: Medial and lateral elbow ligaments are intact.

Tendons: The common flexor and extensor tendons are within normal limits.

Miscellaneous: The regional neurovascular structures are within normal limits.

Impression:

1.Normal MRI of the elbow.`,

  "hip": `MSK EXAM: MRI HIP

Clinical History:

Comparison: None.

Technique: MRI of the hip was performed.

Findings:

Bones and Cartilage: Bone marrow signal intensity is within normal limits. The articular cartilage is intact with no areas of full thickness loss or delamination.

Fluid: No significant joint effusion. No peri articular fluid collections.

Labrum: Evaluation of the labrum is limited as this is a non-arthrographic MRI exam.

Muscles and tendons: The flexors, extensors, abductors, and adductors are intact. No significant hamstring pathology. Ligamentum teres is intact.

Miscellaneous: Regional neurovascular structures are within normal limits. No lymphadenopathy. The visualized abdominal and pelvic organs are unremarkable.

Impression:

1.Normal MRI of the hip.`,

  "knee": `MSK EXAM: MRI KNEE

Clinical History:

Comparison: None.

Technique: MRI of the knee was performed.

FINDINGS:

Bones and Cartilage: Bone marrow signal intensity is within normal limits. The articular cartilage is intact with no areas of full thickness loss or delamination.

Fluid: No joint effusion or peri articular fluid collections.

Ligaments: The ACL, PCL, MCL, and LCL complex are intact.

Menisci: The menisci and roots are intact.

Extensor Mechanism: The quadriceps and patellar tendons are intact. Hoffa's, suprapatellar, and prefemoral fat are within normal limits. Patella alignment is anatomic.

Miscellaneous: No significant Baker's cyst or pes anserinus bursitis. Regional neurovascular structures are within normal limits.

Impression:

1.Normal MRI of the knee.`,

  "shoulder": `MSK EXAM: MRI SHOULDER

Clinical History:

Comparison: None.

Technique: MRI of the shoulder was performed.

Findings:

Bones and Cartilage: No fracture or malalignment. No significant lateral tilt or hook of the acromion. No os acromiale

Bone marrow signal intensity is within normal limits. The glenoid and humeral articular cartilage are grossly within normal limits.

Fluid: No significant subacromial/subdeltoid bursal fluid, glenohumeral effusion, or subcoracoid bursitis.

Rotator cuff: No significant rotator cuff tear. No significant muscle atrophy or evidence of denervation.

Labrum: The labrum is grossly intact, although evaluation is limited as this study is not an arthrogram.

Biceps: The biceps tendon is within normal limits and in anatomic position.

Miscellaneous: Limited assessment of the upper lung zones and regional soft tissues are within normal limits.

Impression:

1.Normal MRI of the shoulder.`,

  "wrist": `MSK EXAM: MRI WRIST

Clinical History:

Comparison: None.

Technique: MRI of the wrist was performed.

Findings:

Bones and Cartilage: Bone marrow signal intensity is within normal limits. The articular cartilage is intact with no areas of full thickness loss or delamination.

Fluid: No joint effusion or peri articular ganglion.

Ligaments: Scapholunate and lunotriquetral ligaments are intact. The volar and dorsal capsular ligaments are intact.

Triangular fibrocartilage complex: The triangular fibrocartilage and suspensory ligaments are intact.

Tendons: The flexor and extensor tendons are within normal limits.

Miscellaneous: No carpal tunnel or Guyon's canal lesions.

Impression:

1.Normal MRI of the wrist.`,

  "chest_ct": `Clinical History: 

Comparison: 

Technique: Multi-detector CT of the chest performed without/with intravenous contrast.

Findings:

Lungs: Lungs are clear without focal consolidation, effusions, or suspicious nodules. 

Mediastinum: Normal mediastinal contours. No abnormally enlarged lymph nodes.

Heart: Normal cardiac size.

Pleura: No pleural effusion or thickening.

Bones: Visualized osseous structures are within normal limits. 

Upper Abdomen: Upper abdominal organs appear unremarkable on limited views.

Impression:

`,
};

const TASK_SELECTION_PROMPT = `<< INSTRUCTION >>

You are an expert radiologist.

You are given a block of text.

You need to determine the task to be performed on the text.

The applicable tasks are:

- Refine draft report (You are given a radiology draft report and you need to refine it.)
- Differential diagnosis (You are given a clinical/imaging description and you need to provide a differential diagnosis.)
- Neither ()

OUTPUT FORMAT (JSON):

{
  "task": "[task name]"
}
with task name being one of the following:
- "refine"
- "diagnostic"
- "none"
`;

const INSTRUCTION_REPORT = `<< INSTRUCTION >>

You are an expert Radiologist.

Use the TEMPLATE below and re-write the following DRAFT REPORT using the same headings as the template, moving each statement to the appropriate section. The findings should be in paragraph format. Proofread for spelling/grammar and fix contradictory statements. Conclude with an Impression of up to 3 concise points.

If a mass/lesion is described, extract the imaging features including T1, T2, and post contrast characteristics; then using the imaging features, age, sex, and clinical history, provide an Impression item summarizing the lesion, a specific differential, and clinical next steps (no references).

<< TEMPLATE >>

<< DRAFT REPORT >>`;

const INSTRUCTION_DIAGNOSTIC= `<< INSTRUCTION >>

You are an expert musculoskeletal radiologist. 

Read the description of a musculoskeletal mass below.

Extract imaging features such as sclerosis, lytic, T1, T2, and/or post contrast characteristics.

Using the imaging features, age, sex, and clinical history, FIRST LIST the most likely diagnosis and, if applicable, differential diagnosis in order of most to least likely.

Give a 1-3 sentence explanation of each diagnosis. Be brief and concise, use a narrative radiology report style. Get straight to the extracted image features first without any prior "here is the analysis..."

<< DESCRIPTION >>`;

const KEYWORD_EXTRACTION_FOR_SEARCH_API = `You are a medical imaging search optimizer. Extract the primary diagnosis, modality, and anatomical location from the radiology report and create ONE optimized search query for finding relevant medical images.

TASK: 

1. Identify the PRIMARY/MOST LIKELY diagnosis from the report

2. Extract the imaging modality (CT, MRI, X-ray, ultrasound, etc.)

3. Extract the anatomical location

4. Generate ONE optimized search query

INPUT: Medical radiology report text

OUTPUT FORMAT (JSON):

{
  "diagnosis": "[primary diagnosis name]",
  "modality": "[imaging modality]", 
  "location": "[anatomical location]",
  "search_query": "[optimized search term for image APIs]"
}

OPTIMIZATION RULES:

- Use simple, common medical terms

- Combine diagnosis + modality + location

- Avoid complex terminology that reduces search results

- Keep query concise but specific

EXAMPLE:

Input: Some report describing osteoid osteoma in proximal tibia on MRI

Output:

{
  "diagnosis": "Osteoid Osteoma",
  "modality": "MRI",
  "location": "Proximal Tibia", 
  "search_query": "osteoid osteoma MRI tibia"
}

Now process this medical report and return ONLY the JSON:

`;

export interface GenerateRequest {
  draft: string;
  /**
   * 'report' maps to the "refine" task, 'diagnostic' maps to the differential diagnostic task.
   * (Kept separate from UI labels.)
   */
  mode?: 'report' | 'diagnostic';
  /**
   * Whether images should be fetched. Defaults to true.
   */
  includeImages?: boolean;
}

export interface GenerateResponse {
  ok: boolean;
  type?: string;
  result?: string;
  images?: ImageResult[];
  imageQuery?: string;
  error?: string;
}

export interface ImageResult {
  title: string;
  link: string;
  displayLink: string;
  snippet: string;
  image: {
    contextLink: string;
    thumbnailLink: string;
    width: number;
    height: number;
  };
}

export interface ImageGenerationResult {
  images: ImageResult[];
  imageQuery?: string;
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
        await sleep(300 * 2 ** attempt);
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
 * Classifies the report type based on keyword matching
 */
function classify(text: string): string {
  const textLower = text.toLowerCase();
  let bestType = "shoulder";
  let bestScore = 0;

  for (const [type, keywords] of Object.entries(KEYWORDS)) {
    const score = keywords.reduce((acc, keyword) => {
      const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      return acc + (textLower.match(regex)?.length || 0);
    }, 0);

    if (score > bestScore) {
      bestType = type;
      bestScore = score;
    }
  }

  return bestType;
}

/**
 * Public helper for callers that need the classified report type.
 */
export function classifyReportType(text: string): string {
  return classify(text);
}

/**
 * For Auto mode: ask Gemini which task to perform and map to
 * 'refine' | 'diagnostic' | 'none'.
 */
export async function selectTaskForAutoMode(
  draft: string
): Promise<'refine' | 'diagnostic' | 'none'> {
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
    if (task === 'refine' || task === 'diagnostic' || task === 'none') {
      return task;
    }
  } catch (err) {
    console.error('Error parsing task selection response:', err, cleaned);
  }

  // Fallback if parsing fails.
  return 'none';
}

/**
 * Builds the prompt for Gemini API
 */
function buildPrompt(reportType: string, draft: string, mode: string): string {
  if (mode === "diagnostic") {
    return INSTRUCTION_DIAGNOSTIC.replace("<< DESCRIPTION >>", `<< DESCRIPTION >>\n${draft.trim()}`);
  } else {
    const template = TEMPLATES[reportType] || TEMPLATES["shoulder"];
    let prompt = INSTRUCTION_REPORT.replace("<< TEMPLATE >>", `<< TEMPLATE >>\n${template}`);
    prompt = prompt.replace("<< DRAFT REPORT >>", `<< DRAFT REPORT >>\n${draft.trim()}`);
    return prompt;
  }
}

/**
 * Calls the Gemini API to generate content
 */
async function callGemini(promptText: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  try {
    const response = await fetchWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: promptText
            }]
          }]
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
  } catch (error) {
    throw new Error(`Error calling Gemini API: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Searches for images using Google Custom Search API
 */
async function searchImages(query: string): Promise<ImageResult[]> {
  if (!SEARCH_API_KEY || !CX) {
    console.warn('Search API keys not configured, skipping image search');
    return [];
  }

  try {
    const url = new URL('https://www.googleapis.com/customsearch/v1');
    url.searchParams.set('key', SEARCH_API_KEY);
    url.searchParams.set('cx', CX);
    url.searchParams.set('q', query);
    url.searchParams.set('searchType', 'image');
    url.searchParams.set('num', '8');
    url.searchParams.set('imgSize', 'MEDIUM');
    url.searchParams.set('safe', 'active');

    const response = await fetchWithRetry(
      url.toString(),
      { method: 'GET' },
      { timeoutMs: PROVIDER_TIMEOUT_MS, retries: PROVIDER_MAX_RETRIES }
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error(`Image search error: ${response.status} - ${errorData}`);
      return [];
    }

    const data = await response.json();
    const images: ImageResult[] = [];

    if (data.items) {
      for (const item of data.items) {
        images.push({
          title: item.title || '',
          link: item.link || '',
          displayLink: item.displayLink || '',
          snippet: item.snippet || '',
          image: {
            contextLink: item.image?.contextLink || '',
            thumbnailLink: item.image?.thumbnailLink || '',
            width: item.image?.width || 0,
            height: item.image?.height || 0,
          },
        });
      }
    }

    return images;
  } catch (error) {
    console.error(`Image search error: ${error}`);
    return [];
  }
}

/**
 * Image generation-only helper.
 * Runs keyword extraction on the given draft and performs image search.
 */
export async function generateImagesForDraft(draft: string): Promise<ImageGenerationResult> {
  let images: ImageResult[] = [];
  let imageQuery: string | undefined;

  try {
    if (!draft || !draft.trim()) {
      return { images, imageQuery };
    }

    const keywordPrompt = KEYWORD_EXTRACTION_FOR_SEARCH_API + draft;
    const keywordResponse = await callGemini(keywordPrompt);
    imageQuery = keywordResponse;

    // Clean and parse JSON response
    let cleanedResponse = keywordResponse.trim();
    if (cleanedResponse.startsWith('```json')) {
      cleanedResponse = cleanedResponse.slice(7);
    }
    if (cleanedResponse.endsWith('```')) {
      cleanedResponse = cleanedResponse.slice(0, -3);
    }
    cleanedResponse = cleanedResponse.trim();

    // Parse JSON
    const keywordData = JSON.parse(cleanedResponse);
    const searchQuery = keywordData.search_query;

    if (searchQuery) {
      images = await searchImages(searchQuery);
    }
  } catch (error) {
    console.error('Error with keyword extraction or image search:', error);
    // Continue even if image search fails
  }

  return { images, imageQuery };
}

/**
 * Main generate function - processes draft report and returns AI-generated result.
 * Image fetching is optional and delegated to generateImagesForDraft.
 */
export async function generateReport(request: GenerateRequest): Promise<GenerateResponse> {
  try {
    const { draft, mode = 'report', includeImages = true } = request;

    if (!draft || !draft.trim()) {
      return {
        ok: false,
        error: 'Draft report is empty',
      };
    }

    // Classify report type
    const reportType = mode === 'report' ? classify(draft) : 'diagnostic';

    // Build prompt
    const prompt = buildPrompt(reportType, draft, mode);

    // Call Gemini API for text
    const aiText = await callGemini(prompt);

    let images: ImageResult[] = [];
    let imageQuery: string | undefined;
    if (includeImages) {
      const imageResult = await generateImagesForDraft(draft);
      images = imageResult.images;
      imageQuery = imageResult.imageQuery;
    }

    return {
      ok: true,
      type: reportType,
      result: aiText,
      images,
      imageQuery,
    };
  } catch (error) {
    console.error('Error in generateReport:', error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred',
    };
  }
}
