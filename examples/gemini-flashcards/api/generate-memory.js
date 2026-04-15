const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.REACT_APP_GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const MAX_ITEMS = 8;
const MAX_FIELD_LENGTH = 120;

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function normalizeText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, MAX_FIELD_LENGTH);
}

function normalizeItem(item) {
  return {
    word: normalizeText(item?.word),
    pinyin: normalizeText(item?.pinyin),
    definition: normalizeText(item?.definition)
  };
}

function validateItems(items) {
  if (!Array.isArray(items) || !items.length) {
    const error = new Error('Request body must include a non-empty items array.');
    error.statusCode = 400;
    throw error;
  }

  if (items.length > MAX_ITEMS) {
    const error = new Error(`You can send up to ${MAX_ITEMS} words at once.`);
    error.statusCode = 400;
    throw error;
  }

  const normalized = items.map(normalizeItem);

  normalized.forEach((item, index) => {
    if (!item.word || !item.pinyin || !item.definition) {
      const error = new Error(`Item ${index + 1} is missing word, pinyin, or definition.`);
      error.statusCode = 400;
      throw error;
    }
  });

  return normalized;
}

function buildPrompt(items) {
  const compactItems = items.map((item, index) => ({
    id: index + 1,
    w: item.word,
    p: item.pinyin,
    d: item.definition
  }));

  return [
    'You are Ron, a supportive tutor in Taiwan.',
    'Style: funny, memorable, concise.',
    'Sometimes mention hospital life or Shute University campus life.',
    'Return ONLY JSON array.',
    'Each object schema:',
    '{"id":1,"sound_hook":"string","character_stories":[{"character":"字","radicals":[{"radical":"x","meaning":"y"}],"story":"string"}],"combination_logic":"string"}',
    'Use Traditional Chinese character components/radicals when possible.',
    'Keep output compact but useful.',
    `Items=${JSON.stringify(compactItems)}`
  ].join(' ');
}

async function callGemini(prompt) {
  if (!GEMINI_API_KEY) {
    const error = new Error('Missing GEMINI_API_KEY on the server.');
    error.statusCode = 500;
    throw error;
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      generationConfig: {
        temperature: 0.8,
        topP: 0.9,
        topK: 32,
        maxOutputTokens: 1200,
        responseMimeType: 'application/json'
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    const error = new Error(`Gemini request failed: ${response.status} ${errorText}`);
    error.statusCode = response.status || 500;
    throw error;
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.map(part => part?.text || '').join('').trim();

  if (!text) {
    const error = new Error('Gemini returned an empty response.');
    error.statusCode = 502;
    throw error;
  }

  try {
    return JSON.parse(text);
  } catch {
    return JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
  }
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  try {
    const items = validateItems(req.body?.items);
    const result = await callGemini(buildPrompt(items));

    if (!Array.isArray(result)) {
      res.status(502).json({ error: 'Gemini returned an invalid response format.' });
      return;
    }

    const normalizedResult = items.map((item, index) => {
      const found = result.find(entry => Number(entry?.id) === index + 1) || {};
      return {
        word: item.word,
        pinyin: item.pinyin,
        definition: item.definition,
        sound_hook: typeof found.sound_hook === 'string' ? found.sound_hook : '',
        character_stories: Array.isArray(found.character_stories) ? found.character_stories : [],
        combination_logic: typeof found.combination_logic === 'string' ? found.combination_logic : ''
      };
    });

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ items: normalizedResult, model: GEMINI_MODEL });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error: error.message || 'Memory generation failed.'
    });
  }
}
