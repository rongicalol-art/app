import React, { useMemo, useState } from 'react';
import './MasterFlashcard.css';

const STORAGE_PREFIX = 'master_flashcard_cache_v1';
const DEFAULT_ENDPOINT = '/api/generate-memory';

function makeCacheKey(word, pinyin, definition) {
  return `${STORAGE_PREFIX}:${[word, pinyin, definition].map(value => String(value || '').trim()).join('|')}`;
}

function readCache(word, pinyin, definition) {
  try {
    const raw = localStorage.getItem(makeCacheKey(word, pinyin, definition));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(word, pinyin, definition, value) {
  try {
    localStorage.setItem(makeCacheKey(word, pinyin, definition), JSON.stringify(value));
  } catch {
    // Ignore cache failures.
  }
}

function getSpeakText(word, pinyin) {
  return [word, pinyin].filter(Boolean).join('，');
}

async function fetchMemoryBatch(items, endpoint) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ items })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.error || 'Ron had trouble building this memory hook.');
  }

  return data;
}

export default function MasterFlashcard({
  word,
  pinyin,
  definition,
  batchItems = [],
  apiEndpoint = DEFAULT_ENDPOINT
}) {
  const [memory, setMemory] = useState(() => readCache(word, pinyin, definition));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [voiceState, setVoiceState] = useState('idle');

  const normalizedBatch = useMemo(() => {
    const seed = [{ word, pinyin, definition }, ...batchItems]
      .map(item => ({
        word: String(item?.word || '').trim(),
        pinyin: String(item?.pinyin || '').trim(),
        definition: String(item?.definition || '').trim()
      }))
      .filter(item => item.word && item.pinyin && item.definition);

    const deduped = [];
    const seen = new Set();

    seed.forEach(item => {
      const key = `${item.word}|${item.pinyin}|${item.definition}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(item);
      }
    });

    return deduped.slice(0, 8);
  }, [word, pinyin, definition, batchItems]);

  const currentCacheKey = useMemo(
    () => makeCacheKey(word, pinyin, definition),
    [word, pinyin, definition]
  );

  async function handleGenerate() {
    setLoading(true);
    setError('');

    try {
      const cached = readCache(word, pinyin, definition);
      if (cached) {
        setMemory(cached);
        setLoading(false);
        return;
      }

      const uncachedItems = normalizedBatch.filter(
        item => !readCache(item.word, item.pinyin, item.definition)
      );

      if (!uncachedItems.length) {
        const fallback = readCache(word, pinyin, definition);
        setMemory(fallback);
        setLoading(false);
        return;
      }

      const data = await fetchMemoryBatch(uncachedItems, apiEndpoint);
      const returnedItems = Array.isArray(data?.items) ? data.items : [];

      returnedItems.forEach(item => {
        writeCache(item.word, item.pinyin, item.definition, item);
      });

      const latest = readCache(word, pinyin, definition);
      if (!latest) {
        throw new Error('The memory hook was generated, but the result format was incomplete.');
      }

      setMemory(latest);
    } catch (err) {
      setError(
        err?.message ||
          'Ron is off helping at the campus clinic right now. Please try again in a moment.'
      );
    } finally {
      setLoading(false);
    }
  }

  function handleSpeak() {
    if (!('speechSynthesis' in window)) {
      setError('This browser does not support speech synthesis.');
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(getSpeakText(word, pinyin));
    utterance.lang = 'zh-TW';
    utterance.rate = 0.88;
    utterance.pitch = 1.02;

    utterance.onstart = () => setVoiceState('speaking');
    utterance.onend = () => setVoiceState('idle');
    utterance.onerror = () => {
      setVoiceState('idle');
      setError('Speech playback failed on this device.');
    };

    window.speechSynthesis.speak(utterance);
  }

  const characterStories = Array.isArray(memory?.character_stories)
    ? memory.character_stories
    : [];

  return (
    <section className="master-flashcard" aria-live="polite">
      <div className="master-flashcard__island">
        <div className="master-flashcard__header">
          <div>
            <p className="master-flashcard__label">Master Flashcard</p>
            <h2 className="master-flashcard__word">{word || '請輸入詞彙'}</h2>
            <p className="master-flashcard__meta">
              <span>{pinyin || 'pinyin'}</span>
              <span className="master-flashcard__dot">•</span>
              <span>{definition || 'definition'}</span>
            </p>
          </div>

          <div className="master-flashcard__actions">
            <button
              type="button"
              className="master-flashcard__button master-flashcard__button--ghost"
              onClick={handleSpeak}
              disabled={!word}
            >
              {voiceState === 'speaking' ? 'Speaking…' : 'Speak'}
            </button>

            <button
              type="button"
              className="master-flashcard__button"
              onClick={handleGenerate}
              disabled={loading || !word || !pinyin || !definition}
            >
              {loading ? 'Building…' : memory ? 'Refresh Story' : 'Generate Hook'}
            </button>
          </div>
        </div>

        {error ? <div className="master-flashcard__error">{error}</div> : null}

        <div className="master-flashcard__grid">
          <article className="master-flashcard__panel master-flashcard__panel--ear">
            <p className="master-flashcard__section-kicker">Ear</p>
            <h3>Sound Hook</h3>
            <p className="master-flashcard__sound">
              {memory?.sound_hook ||
                'Generate a hook to hear Ron turn this pronunciation into a memorable English pun.'}
            </p>
          </article>

          <article className="master-flashcard__panel master-flashcard__panel--eye">
            <p className="master-flashcard__section-kicker">Eye</p>
            <h3>Character Stories</h3>

            {characterStories.length ? (
              <div className="master-flashcard__stories">
                {characterStories.map((item, index) => (
                  <div className="master-flashcard__story" key={`${item.character}-${index}`}>
                    <div className="master-flashcard__story-head">
                      <span className="master-flashcard__character">{item.character}</span>
                      <div className="master-flashcard__radicals">
                        {(item.radicals || []).map((radical, radicalIndex) => (
                          <span className="master-flashcard__radical" key={`${radical.radical}-${radicalIndex}`}>
                            {radical.radical}: {radical.meaning}
                          </span>
                        ))}
                      </div>
                    </div>
                    <p>{item.story}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="master-flashcard__placeholder">
                Character breakdowns will appear here after generation.
              </p>
            )}
          </article>
        </div>

        <article className="master-flashcard__panel master-flashcard__panel--logic">
          <p className="master-flashcard__section-kicker">Link</p>
          <h3>Combination Logic</h3>
          <p>
            {memory?.combination_logic ||
              'Ron will explain why these characters team up to create the word’s meaning.'}
          </p>
        </article>

        <p className="master-flashcard__footer">
          Cache key: <code>{currentCacheKey}</code>
        </p>
      </div>
    </section>
  );
}
