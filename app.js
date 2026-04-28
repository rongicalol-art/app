const DATA = {
  VOCAB: [],
  SENTENCES: [],
  SENTENCES_BY_LESSON: {},
  SENTENCES_BY_CHAR: {},
  CHARS: {},
  FALLBACK_DEFS: {},
  VOCAB_EXACT_MATCH: {},
  VOCAB_BY_CHAR: {}
};

window.App = null;

// ============ READER MODE DETECTION & STABILITY ============
// Safari Reader Mode removes elements from DOM - we need to detect and handle this
const ReaderModeDetection = {
  isReaderModeActive() {
    // Check if critical app elements are missing (sign of Reader Mode activation)
    return !document.getElementById?.('mainContainer') || 
           !document.getElementById?.('dynamicIsland') ||
           !document.body?.querySelector?.('.bottom-nav');
  },
  
  safeGetElement(id) {
    try { return document.getElementById?.(id) ?? null; } catch { return null; }
  },
  
  onReaderModeEnter() {
    console.warn('[ReaderMode] Safari Reader Mode activated. Cleaning up event listeners.');
    App?.stopAutoPlay?.();
    App?.pauseDialoguePlayer?.({ persist: false, updateUI: false });
  }
};

// Detect Reader Mode changes
if (document) {
  new MutationObserver(() => {
    if (ReaderModeDetection.isReaderModeActive()) {
      ReaderModeDetection.onReaderModeEnter();
    }
  }).observe(document.body || document, { childList: true, subtree: true });
}

const App = {
  state: {
    charHistory: [],
    currentCharModal: null,
    mode: 'study',
    bookFilter: ['1'],
    lessonFilter: ['All'],
    dialogueFilter: {},
    shuffle: false,
    currentIndex: 0,
    isFlipped: false,
    isStudyBreakdownOpen: false,
    skipFlipAnimationOnce: false,
    ttsRate: 0.85,
    quizType: 'vocab',
    quizDefOnly: false,
    noPinyin: false,
    noHanziColor: true,
    noTranslation: false,
    separateMode: 'off',
    fastNext: true,
    listeningHard: false,
    listeningToneTest: false,
    listeningMode: 'def',
    dialoguePlayerText: '',
    dialoguePlayerActiveLineIndex: 0,
    dialoguePlayerCurrentTimeMs: 0,
    dialoguePlayerVoiceMode: 'auto',
    dialoguePlayerContentType: 'conversation',
    dialoguePlayerPacing: 'relaxed',
    dialoguePlayerSpeed: 1,
    readExpandedIndex: null,
    writingShowOutline: false,
    writingHideDrawing: false,
    writingFullscreen: true,
    activeList: [],
    showHooks: true,
    quizPrompt: 'hz',
    quizAnswer: 'py',
    mcPrompt: 'hz',
    mcAnswer: 'def',
    builderTokens: [],
    builderAnswer: [],
    quizStats: { correct: 0, total: 0 },
    streak: 0,
    isFinished: false,
    sessionMistakes: [],
    modeCache: {},
    currentExample: null,
    learnedItems: new Set(),
    hideLearned: true,
    currentWriter: null,
    hideDock: false,
    autoPlay: false,
    ttsReadWord: true,
    ttsReadMeaning: true,
    ttsReadExample: false,
    ttsReadExampleEn: false,
    ttsItemInterval: 1.0,
    ttsCardInterval: 2.0,
    ttsVoiceZh: '',
    ttsVoiceEn: '',
    listSelectionMode: false,
    listSelectedIds: new Set(),
    listVisibleItems: [],
  },

  _dialoguePlayerRuntime: {
    isPlaying: false,
    rafId: 0,
    progressRafId: 0,
    startedAt: 0,
    startedFromMs: 0,
    sessionId: 0,
    sessionKey: '',
    timeline: [],
    playbackToken: 0,
    queuedUtterances: [],
    utteranceTimerId: 0,
    speakerVoiceMap: { zh: new Map(), en: new Map() },
    prepareToken: 0,
    preparePromise: null,
    prepareKey: '',
    preparedKey: '',
    preparedPlan: null,
    isPreparing: false,
    prepareProgress: 0,
    prepareLabel: ''
  },
  
 async init() {
    try {
      // 🌟 CRITICAL FIX: Remove optional chaining to let errors propagate
      // Optional chaining (?.) masks exceptions - they just return undefined instead of throwing
      await this.importData();
      this.loadSettings();
      await this.ensureDataLoadedForCurrentState();

      try {
          const learned = JSON.parse(localStorage.getItem?.('fc_learned_items') ?? '[]');
          this.state.learnedItems = new Set(learned);
      } catch (e) {
          console.error("Failed to load learned items", e);
      }

      // 🌟 FIX: Tell the list generator to preserve the exact state we just loaded
      this.updateActiveList(true);
      
      if (this.state.activeList.length === 0 && DATA.VOCAB.length > 0 && !this.state.hideLearned) {
        this.state.lessonFilter = ['All'];
        this.state.bookFilter = ['All'];
        await this.ensureDataLoadedForCurrentState();
        this.updateActiveList(false);
        this.saveSettings();
      }
      
      // Safely update body and UI
      if (document.body) {
        document.body.dataset.mode = this.state.mode;
        if (document.body.classList) {
          document.body.classList.toggle('mode-quiz', this.state.mode === 'quiz');
          document.body.classList.toggle('mode-quiz-mc', this.state.mode === 'quiz-mc');
          document.body.classList.toggle('focus-mode', this.state.mode === 'writing');
        }
      }

      UI.init();
      try {
        UI.render();
      } catch (renderError) {
        console.error('Initial UI render failed, falling back to study mode.', renderError);
        this.recoverFromInitialRenderFailure();
        UI.render();
        this.saveSettings();
      }
      this.setupInteraction();

      // 🌟 PRE-COMPUTE HEAVY INDICES IN THE BACKGROUND TO PREVENT UI JANK LATER
      // Delayed by 2.5 seconds to ensure the UI has completely faded in and is interactive
      setTimeout(() => {
        const runBackground = window.requestIdleCallback || ((cb) => window.setTimeout(cb, 1));
        runBackground(async () => {
          try {
            await this.buildCharacterIndices();
          } catch (error) {
            console.error('Character support preload failed', error);
          }
          
          // 🌟 Load all books sequentially in the background so character lookup has the full dictionary
          // without causing a massive memory/network spike that freezes mobile browsers
          const allBooks = [...new Set([...this.getAvailableBooks('vocab'), ...this.getAvailableBooks('sentences')])];
          for (const book of allBooks) {
            try {
              await this.ensureDatasetBooksLoaded([book]);
            } catch (e) {
              console.warn(`Background dictionary preload failed for book ${book}`, e);
            }
            // Yield to main thread to let the phone breathe between heavy data processing
            await new Promise(r => setTimeout(r, 150));
          }
        });
      }, 2500);
    } catch (err) {
      console.error('[App.init] Initialization failed:', err);
      console.error('[App.init] Stack trace:', err.stack);
      console.error('[App.init] DATA state:', { VOCAB_COUNT: DATA.VOCAB.length, SENTENCES_COUNT: DATA.SENTENCES.length });
      // Fallback recovery
      this.recoverFromInitialRenderFailure();
    }
  },

  recoverFromInitialRenderFailure() {
    // 🌟 Clean up timers before recovery
    if (this._autoPlayTimer) clearTimeout(this._autoPlayTimer);
    if (this._markLearnedAnimTimer) clearTimeout(this._markLearnedAnimTimer);
    if (this._swipeFeedbackTimer) clearTimeout(this._swipeFeedbackTimer);
    if (this._autoRestartTimer) clearTimeout(this._autoRestartTimer);

    if (this.state?.mode === 'listening' && this.state?.listeningMode === 'dialogue') {
      this.pauseDialoguePlayer?.({ persist: false, updateUI: false });
    }

    this.state.mode = 'study';
    this.state.listeningMode = 'def';
    this.state.readExpandedIndex = null;
    this.state.dialoguePlayerActiveLineIndex = 0;
    this.state.dialoguePlayerCurrentTimeMs = 0;
    this.state.skipFadeInOnce = true;
    
    if (document.body && document.body.classList) {
      document.body.dataset.mode = this.state.mode;
      document.body.classList.toggle('mode-quiz', false);
      document.body.classList.toggle('mode-quiz-mc', false);
      document.body.classList.toggle('focus-mode', false);
    }

    // 🌟 CRITICAL: Re-initialize UI to attach event listeners after recovery
    if (window.UI && typeof UI.init === 'function') {
      try {
        UI.init();
      } catch (e) {
        console.error('Failed to re-initialize UI during recovery', e);
      }
    }
  },

  getDialoguePlayerLines(text = this.state.dialoguePlayerText) {
    return String(text || '')
      .split(/\r?\n/)
      .map(line => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
  },

  parseDialoguePlayerLine(text) {
    const rawText = String(text || '').trim();
    const match = rawText.match(/^\s*([^:：]{1,28})\s*[:：]\s*(.+)$/);
    const speaker = match ? match[1].trim() : '';
    const bodyText = match ? match[2].trim() : rawText;
    const speechText = bodyText || rawText;
    return {
      rawText,
      speaker,
      bodyText,
      speechText,
      hasSpeaker: !!speaker,
      hasHanzi: /[\u4e00-\u9fff]/.test(rawText)
    };
  },

  getDialoguePlayerSpeed() {
    return Math.max(0.5, Math.min(2, Number(this.state.dialoguePlayerSpeed) || 1));
  },

  normalizeDialoguePlayerTranslationKey(text) {
    return String(text || '')
      .replace(/\s+/g, '')
      .replace(/[“”‘’"']/g, '')
      .trim();
  },

  getDialoguePlayerLineTranslation(text) {
    if (!(this._dialoguePlayerTranslationIndex instanceof Map)) {
      this._dialoguePlayerTranslationIndex = new Map();
      (DATA.SENTENCES || []).forEach(sentence => {
        const zh = String(sentence?.zh || '').trim();
        const en = String(sentence?.en || '').trim();
        if (!zh || !en) return;
        const key = this.normalizeDialoguePlayerTranslationKey(zh);
        if (key && !this._dialoguePlayerTranslationIndex.has(key)) {
          this._dialoguePlayerTranslationIndex.set(key, en);
        }
      });
    }

    const parsed = this.parseDialoguePlayerLine(text);
    const candidates = [parsed.bodyText, parsed.rawText]
      .map(value => this.normalizeDialoguePlayerTranslationKey(value))
      .filter(Boolean);

    for (const candidate of candidates) {
      const match = this._dialoguePlayerTranslationIndex.get(candidate);
      if (match) return match;
    }

    return '';
  },

  buildDialoguePlayerTimeline(lines = this.getDialoguePlayerLines()) {
    const paceMultiplierMap = {
      steady: 1,
      relaxed: 1.15,
      slow: 1.35
    };
    let paceMultiplier = paceMultiplierMap[this.state.dialoguePlayerPacing] || 1.15;
    if (this.state.dialoguePlayerContentType === 'shadowing') paceMultiplier += 0.12;
    if (this.state.dialoguePlayerContentType === 'narration') paceMultiplier -= 0.04;

    const speedFactor = 1 / this.getDialoguePlayerSpeed();

    let cursorMs = 0;
    return lines.map((text, index) => {
      const compact = String(text || '').trim();
      const wordCount = compact ? compact.split(/\s+/).length : 0;
      const charCount = compact.replace(/\s+/g, '').length;
      const baseDurationMs = 1200 + wordCount * 260 + charCount * 42;
      const durationMs = Math.max(1200, Math.min(8800, Math.round(baseDurationMs * paceMultiplier * speedFactor)));
      const startMs = cursorMs;
      cursorMs += durationMs;
      return {
        index,
        text: compact,
        startMs,
        endMs: cursorMs,
        durationMs
      };
    });
  },

  ensureDialoguePlayerSession(forceNewSession = false) {
    const runtime = this._dialoguePlayerRuntime;
    const lines = this.getDialoguePlayerLines();
    const signature = lines.join('\n');
    const timeline = this.buildDialoguePlayerTimeline(lines);
    const needsNewSession = forceNewSession || signature !== runtime.sessionKey;

    runtime.timeline = timeline;

    if (needsNewSession) {
      runtime.sessionKey = signature;
      runtime.sessionId += 1;
      runtime.queuedUtterances = [];
      runtime.speakerVoiceMap = { zh: new Map(), en: new Map() };
      runtime.preparePromise = null;
      runtime.prepareKey = '';
      runtime.preparedKey = '';
      runtime.preparedPlan = null;
      runtime.isPreparing = false;
      runtime.prepareProgress = 0;
      runtime.prepareLabel = '';
    }

    if (!timeline.length) {
      this.state.dialoguePlayerActiveLineIndex = 0;
      this.state.dialoguePlayerCurrentTimeMs = 0;
      runtime.startedFromMs = 0;
      return timeline;
    }

    const maxIndex = timeline.length - 1;
    const totalDuration = timeline[maxIndex].endMs;
    const maxTime = Math.max(0, totalDuration - 1);
    const safeTime = Math.max(0, Math.min(Number(this.state.dialoguePlayerCurrentTimeMs) || 0, maxTime));

    this.state.dialoguePlayerActiveLineIndex = this.getDialoguePlayerActiveIndexForTime(safeTime, timeline);
    this.state.dialoguePlayerCurrentTimeMs = safeTime;
    runtime.startedFromMs = safeTime;

    return timeline;
  },

  getDialoguePlayerDurationMs() {
    const timeline = this.ensureDialoguePlayerSession();
    if (!timeline.length) return 0;
    return timeline[timeline.length - 1].endMs;
  },

  getDialoguePlayerActiveIndexForTime(timeMs, timeline = this.ensureDialoguePlayerSession()) {
    if (!timeline.length) return 0;
    const safeTime = Math.max(0, Number(timeMs) || 0);
    for (let i = 0; i < timeline.length; i++) {
      if (safeTime < timeline[i].endMs) return i;
    }
    return timeline.length - 1;
  },

  getDialoguePlayerViewModel() {
    const timeline = this.ensureDialoguePlayerSession();
    const durationMs = this.getDialoguePlayerDurationMs();
    const currentTimeMs = durationMs
      ? Math.max(0, Math.min(this.state.dialoguePlayerCurrentTimeMs || 0, Math.max(0, durationMs - 1)))
      : 0;
    const activeLineIndex = timeline.length
      ? Math.max(0, Math.min(this.state.dialoguePlayerActiveLineIndex || 0, timeline.length - 1))
      : 0;

    return {
      text: this.state.dialoguePlayerText || '',
      lines: timeline,
      hasLines: timeline.length > 0,
      activeLineIndex,
      currentTimeMs,
      durationMs,
      progress: durationMs ? currentTimeMs / durationMs : 0,
      isPlaying: !!this._dialoguePlayerRuntime.isPlaying,
      isPreparing: !!this._dialoguePlayerRuntime.isPreparing,
      prepareProgress: Math.max(0, Math.min(Number(this._dialoguePlayerRuntime.prepareProgress) || 0, 1)),
      prepareLabel: this._dialoguePlayerRuntime.prepareLabel || '',
      sessionId: this._dialoguePlayerRuntime.sessionId
    };
  },

  updateDialoguePlayerPreparationState(state = {}, options = {}) {
    const runtime = this._dialoguePlayerRuntime;

    if (typeof state.isPreparing === 'boolean') runtime.isPreparing = state.isPreparing;
    if (typeof state.progress === 'number') runtime.prepareProgress = state.progress;
    if (typeof state.label === 'string') runtime.prepareLabel = state.label;

    if (options.updateUI !== false
      && this.state.mode === 'listening'
      && this.state.listeningMode === 'dialogue'
      && typeof UI !== 'undefined'
      && typeof UI.updateDialoguePlayerUI === 'function') {
      UI.updateDialoguePlayerUI({ centerOnActive: false, instant: true });
    }
  },

  resetDialoguePlayerPreparedAudio(options = {}) {
    const runtime = this._dialoguePlayerRuntime;

    if (runtime.isPreparing && window.DialogueAudioEngine && typeof window.DialogueAudioEngine.cancel === 'function') {
      window.DialogueAudioEngine.cancel(this, {
        keepPrepared: false,
        updateUI: options.updateUI !== false
      });
      return;
    }

    runtime.prepareToken += 1;
    runtime.preparePromise = null;
    runtime.prepareKey = '';
    runtime.preparedKey = '';
    runtime.preparedPlan = null;

    this.updateDialoguePlayerPreparationState({
      isPreparing: false,
      progress: 0,
      label: ''
    }, {
      updateUI: options.updateUI !== false
    });
  },

  prepareDialoguePlayerAudio(options = {}) {
    if (!window.DialogueAudioEngine || typeof window.DialogueAudioEngine.prepare !== 'function') {
      return Promise.resolve(true);
    }
    return window.DialogueAudioEngine.prepare(this, options);
  },

  getDialoguePlayerSpeechEnvironment() {
    const ua = String(navigator.userAgent || '').toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(ua)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isAndroid = /android/.test(ua);
    const isMobile = isIOS || isAndroid || /mobile/.test(ua);
    const isEdge = /edg\//.test(ua) || /edga\//.test(ua) || /edgios\//.test(ua);
    const isWebKitShell = /applewebkit/.test(ua) && !/chrome|crios|crmo|edg|edga|edgios|opr|opera|firefox|fxios/.test(ua);

    return {
      isIOS,
      isAndroid,
      isMobile,
      isEdge,
      isWebKitShell
    };
  },

  getTtsPriorityContext(options = {}) {
    if (options.context) return options.context;
    if (options.preferEdge === true) return 'edge-priority';
    if (this.state.mode === 'listening' && this.state.listeningMode === 'dialogue') return 'edge-priority';
    if (this.state.mode === 'sentences') return 'edge-priority';
    return 'default';
  },

  shouldPrioritizeEdgeVoice(options = {}) {
    return this.getTtsPriorityContext(options) === 'edge-priority';
  },

  getVoiceSelectionKey(lang, options = {}) {
    return JSON.stringify({
      lang: String(lang || ''),
      context: this.getTtsPriorityContext(options),
      ttsVoiceZh: this.state.ttsVoiceZh || '',
      ttsVoiceEn: this.state.ttsVoiceEn || ''
    });
  },

  shouldUseDialoguePlayerSequentialSpeech() {
    const env = this.getDialoguePlayerSpeechEnvironment();
    return env.isMobile || env.isEdge || env.isWebKitShell;
  },

  dispatchDialoguePlayerUtterance(utterance, playbackToken, options = {}) {
    if (!utterance || !window.speechSynthesis) return;

    const runtime = this._dialoguePlayerRuntime;
    if (runtime.utteranceTimerId) {
      clearTimeout(runtime.utteranceTimerId);
      runtime.utteranceTimerId = 0;
    }

    const delayMs = Math.max(0, Number(options.delayMs) || 0);
    const speakNow = () => {
      runtime.utteranceTimerId = 0;
      if (!runtime.isPlaying || runtime.playbackToken !== playbackToken) return;

      try {
        if (typeof window.speechSynthesis.resume === 'function') window.speechSynthesis.resume();
      } catch (e) {}

      try {
        window.speechSynthesis.speak(utterance);
      } catch (e) {
        if (typeof utterance.onerror === 'function') utterance.onerror(e);
      }
    };

    if (delayMs > 0) {
      runtime.utteranceTimerId = window.setTimeout(speakNow, delayMs);
      return;
    }

    speakNow();
  },

  syncDialoguePlayerPosition(timeMs, options = {}) {
    const timeline = this.ensureDialoguePlayerSession();
    const durationMs = this.getDialoguePlayerDurationMs();
    const previousIndex = this.state.dialoguePlayerActiveLineIndex || 0;
    let lineChanged = false;

    if (!timeline.length) {
      this.state.dialoguePlayerActiveLineIndex = 0;
      this.state.dialoguePlayerCurrentTimeMs = 0;
    } else {
      const maxTime = Math.max(0, durationMs - 1);
      const nextTimeMs = Math.max(0, Math.min(Number(timeMs) || 0, maxTime));
      const nextIndex = this.getDialoguePlayerActiveIndexForTime(nextTimeMs, timeline);
      this.state.dialoguePlayerCurrentTimeMs = nextTimeMs;
      this.state.dialoguePlayerActiveLineIndex = nextIndex;
      this._dialoguePlayerRuntime.startedFromMs = nextTimeMs;
      lineChanged = nextIndex !== previousIndex;
    }

    if (options.persist) this.saveSettings();

    if (this.state.mode === 'listening' && this.state.listeningMode === 'dialogue' && typeof UI !== 'undefined' && typeof UI.updateDialoguePlayerUI === 'function') {
      UI.updateDialoguePlayerUI({
        centerOnActive: options.centerOnActive === undefined ? lineChanged : options.centerOnActive,
        instant: options.instant
      });
    }
  },

  setDialoguePlayerText(text) {
    const nextText = String(text ?? '');
    if (nextText === this.state.dialoguePlayerText) return;

    this.pauseDialoguePlayer({ persist: false, updateUI: false });
    this.state.dialoguePlayerText = nextText;
    this.state.dialoguePlayerActiveLineIndex = 0;
    this.state.dialoguePlayerCurrentTimeMs = 0;
    this.ensureDialoguePlayerSession(true);
    this.resetDialoguePlayerPreparedAudio({ updateUI: false });
    this.saveSettings();

    if (this.state.mode === 'listening' && this.state.listeningMode === 'dialogue' && typeof UI !== 'undefined' && typeof UI.renderDialoguePlayer === 'function') {
      UI.renderDialoguePlayer();
    }
  },

  setDialoguePlayerSetting(key, value) {
    if (!Object.prototype.hasOwnProperty.call(this.state, key)) return;
    if (this.state[key] === value) return;

    this.state[key] = value;

    if (['dialoguePlayerPacing', 'dialoguePlayerContentType', 'dialoguePlayerSpeed'].includes(key)) {
      this.ensureDialoguePlayerSession(true);
    }

    if (['dialoguePlayerVoiceMode', 'dialoguePlayerPacing', 'dialoguePlayerContentType', 'dialoguePlayerSpeed'].includes(key)) {
      this.resetDialoguePlayerPreparedAudio({ updateUI: false });
    }

    this.saveSettings();

    const shouldRestartPlayback = this._dialoguePlayerRuntime.isPlaying
      && ['dialoguePlayerVoiceMode', 'dialoguePlayerPacing', 'dialoguePlayerContentType', 'dialoguePlayerSpeed'].includes(key);

    if (shouldRestartPlayback) {
      this.restartDialoguePlayerPlayback();
    }

    if (this.state.mode === 'listening' && this.state.listeningMode === 'dialogue' && typeof UI !== 'undefined' && typeof UI.renderDialoguePlayer === 'function') {
      UI.renderDialoguePlayer();
    }
  },

  // Mock seek transport: scrubbing reuses the existing session instead of regenerating audio/TTS.
  mockScrubDialogueAudio(targetTimeMs) {
    const runtime = this._dialoguePlayerRuntime;
    runtime.lastScrubMs = Math.max(0, Number(targetTimeMs) || 0);
    return {
      sessionId: runtime.sessionId,
      currentTimeMs: runtime.lastScrubMs
    };
  },

  seekDialoguePlayerToLine(index) {
    const timeline = this.ensureDialoguePlayerSession();
    if (!timeline.length) return;

    const targetIndex = Math.max(0, Math.min(Number(index) || 0, timeline.length - 1));
    const targetTimeMs = timeline[targetIndex].startMs;
    const runtime = this._dialoguePlayerRuntime;

    this.mockScrubDialogueAudio(targetTimeMs);

    if (runtime.isPlaying) {
      runtime.startedAt = performance.now();
      runtime.startedFromMs = targetTimeMs;
    }

    this.syncDialoguePlayerPosition(targetTimeMs, {
      persist: true,
      centerOnActive: true,
      instant: !runtime.isPlaying
    });

    if (runtime.isPlaying) this.restartDialoguePlayerPlayback();
  },

  seekDialoguePlayerToProgress(progress) {
    const durationMs = this.getDialoguePlayerDurationMs();
    if (!durationMs) return;

    const safeProgress = Math.max(0, Math.min(Number(progress) || 0, 1));
    const targetTimeMs = Math.min(durationMs - 1, Math.round(durationMs * safeProgress));
    const runtime = this._dialoguePlayerRuntime;

    this.mockScrubDialogueAudio(targetTimeMs);

    if (runtime.isPlaying) {
      runtime.startedAt = performance.now();
      runtime.startedFromMs = targetTimeMs;
    }

    this.syncDialoguePlayerPosition(targetTimeMs, {
      persist: true,
      centerOnActive: true,
      instant: !runtime.isPlaying
    });

    if (runtime.isPlaying) this.restartDialoguePlayerPlayback();
  },

  getDialoguePlayerSpeechRate() {
    const globalBias = Math.max(0.86, Math.min(1.18, (this.state.ttsRate || 0.85) / 0.85));
    let rate = this.getDialoguePlayerSpeed() * globalBias;

    if (this.state.dialoguePlayerPacing === 'relaxed') rate -= 0.08;
    else if (this.state.dialoguePlayerPacing === 'slow') rate -= 0.14;
    else if (this.state.dialoguePlayerPacing === 'steady') rate -= 0.02;

    if (this.state.dialoguePlayerContentType === 'shadowing') rate -= 0.06;
    if (this.state.dialoguePlayerContentType === 'narration') rate += 0.02;

    return Math.max(0.5, Math.min(2, rate));
  },

  getDialoguePlayerVoicePool(lang = 'zh-TW') {
    if (!window.speechSynthesis) return [];

    const normalizedLang = String(lang || 'zh-TW').toLowerCase();
    const isZh = normalizedLang.startsWith('zh');
    const prioritizeEdge = this.shouldPrioritizeEdgeVoice({ context: 'edge-priority' });
    const voices = window.speechSynthesis.getVoices();
    const filtered = voices.filter(voice => {
      const voiceLang = String(voice.lang || '').toLowerCase().replace('_', '-');
      if (isZh) return voiceLang.includes('zh');
      return voiceLang.startsWith('en');
    });

    if (isZh) this.ensureCachedVoice({ context: 'edge-priority' });
    else this.ensureEnglishVoice({ context: 'edge-priority' });

    const primaryVoice = isZh ? this._cachedVoice : this._cachedEnVoice;
    const ordered = [];
    const seen = new Set();
    const pushVoice = voice => {
      if (!voice || seen.has(voice.name)) return;
      seen.add(voice.name);
      ordered.push(voice);
    };

    pushVoice(primaryVoice);

    filtered
      .slice()
      .sort((a, b) => {
        const scoreVoice = voice => {
          const name = String(voice.name || '');
          const voiceLang = String(voice.lang || '').toLowerCase().replace('_', '-');
          let score = 0;
          if (prioritizeEdge && /microsoft|natural|edge/i.test(name)) score += 42;
          if (name.includes('Natural')) score += 40;
          if (isZh && (voiceLang.includes('tw') || voiceLang.includes('hant') || name.includes('Taiwan'))) score += 18;
          if (!isZh && (voiceLang.includes('en-us') || name.includes('US') || name.includes('American'))) score += 18;
          if (name.includes('Microsoft') || name.includes('Apple') || name.includes('Siri') || name.includes('Google')) score += 8;
          return score;
        };
        return scoreVoice(b) - scoreVoice(a);
      })
      .forEach(pushVoice);

    return ordered;
  },

  getDialoguePlayerSpeechLang(text) {
    if (this.state.dialoguePlayerVoiceMode === 'zh') return 'zh-TW';
    if (this.state.dialoguePlayerVoiceMode === 'en') return 'en-US';
    const sample = String(text || '').trim();
    if (!sample) return 'zh-TW';
    return /[\u4e00-\u9fff]/.test(sample) ? 'zh-TW' : 'en-US';
  },

  getDialoguePlayerSpeakerVoice(speaker, lang) {
    const pool = this.getDialoguePlayerVoicePool(lang);
    if (!pool.length) return null;
    if (!speaker || this.state.dialoguePlayerContentType !== 'conversation') return pool[0];

    const runtime = this._dialoguePlayerRuntime;
    const langKey = String(lang || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
    if (!runtime.speakerVoiceMap || !(runtime.speakerVoiceMap[langKey] instanceof Map)) {
      runtime.speakerVoiceMap = runtime.speakerVoiceMap || {};
      runtime.speakerVoiceMap[langKey] = new Map();
    }

    const map = runtime.speakerVoiceMap[langKey];
    if (map.has(speaker)) return map.get(speaker);

    const usedNames = new Set(Array.from(map.values()).map(voice => voice?.name).filter(Boolean));
    const voice = pool.find(candidate => !usedNames.has(candidate.name)) || pool[map.size % pool.length] || pool[0];
    map.set(speaker, voice);
    return voice;
  },

  primeDialoguePlayerSpeechPipeline() {
    if (!window.speechSynthesis) return;
    try {
      window.speechSynthesis.getVoices();
      if (typeof window.speechSynthesis.resume === 'function') window.speechSynthesis.resume();
    } catch (e) {}
  },

  formatDialoguePlayerSpeechText(text, lang = 'zh-TW') {
    const cleaned = String(text || '').trim();
    if (!cleaned) return '';
    if (/[.!?…。！？]$/.test(cleaned)) return cleaned;

    if (this.state.dialoguePlayerPacing === 'slow') {
      return lang.startsWith('zh') ? `${cleaned}。` : `${cleaned}...`;
    }
    if (this.state.dialoguePlayerPacing === 'relaxed') {
      return lang.startsWith('zh') ? `${cleaned}。` : `${cleaned}.`;
    }
    return cleaned;
  },

  getDialoguePlayerPauseMs() {
    const gapMap = {
      steady: 220,
      relaxed: 360,
      slow: 520
    };
    let gapMs = gapMap[this.state.dialoguePlayerPacing] || 360;
    if (this.state.dialoguePlayerContentType === 'shadowing') gapMs += 120;
    return gapMs;
  },

  startDialoguePlayerSegmentProgress(segment, playbackToken) {
    const runtime = this._dialoguePlayerRuntime;
    if (runtime.progressRafId) {
      cancelAnimationFrame(runtime.progressRafId);
      runtime.progressRafId = 0;
    }

    runtime.startedAt = performance.now();
    runtime.startedFromMs = segment.startMs;

    const tick = () => {
      if (!runtime.isPlaying || runtime.playbackToken !== playbackToken) return;

      const elapsedMs = performance.now() - runtime.startedAt;
      const estimatedMs = Math.min(segment.durationMs - 40, elapsedMs);
      const nextTimeMs = segment.startMs + Math.max(0, estimatedMs);

      this.syncDialoguePlayerPosition(nextTimeMs, {
        persist: false,
        centerOnActive: false,
        instant: false
      });

      runtime.progressRafId = requestAnimationFrame(tick);
    };

    runtime.progressRafId = requestAnimationFrame(tick);
  },

  stopDialoguePlayerSegmentProgress(finalTimeMs = null, options = {}) {
    const runtime = this._dialoguePlayerRuntime;
    if (runtime.progressRafId) {
      cancelAnimationFrame(runtime.progressRafId);
      runtime.progressRafId = 0;
    }

    if (typeof finalTimeMs === 'number') {
      this.syncDialoguePlayerPosition(finalTimeMs, {
        persist: options.persist,
        centerOnActive: options.centerOnActive,
        instant: options.instant
      });
    }
  },

  createDialoguePlayerUtterance(segment, playbackToken, queueIndex, queueLength) {
    if (!window.speechSynthesis || !segment) return null;

    const runtime = this._dialoguePlayerRuntime;
    const line = segment.line || this.parseDialoguePlayerLine(segment.text);
    const lang = segment.lang || this.getDialoguePlayerSpeechLang(line.speechText);
    const speechText = segment.speechText || this.formatDialoguePlayerSpeechText(line.speechText, lang);
    const utterance = new SpeechSynthesisUtterance(speechText);
    const voice = Object.prototype.hasOwnProperty.call(segment, 'voice')
      ? segment.voice
      : this.getDialoguePlayerSpeakerVoice(line.speaker, lang);

    utterance.lang = lang;
    utterance.rate = this.getDialoguePlayerSpeechRate();
    if (voice) utterance.voice = voice;

    window._tts_utterances = window._tts_utterances || [];
    window._tts_utterances.push(utterance);

    const cleanup = () => {
      window._tts_utterances = window._tts_utterances.filter(entry => entry !== utterance);
    };

    utterance.onstart = () => {
      if (!runtime.isPlaying || runtime.playbackToken !== playbackToken) return;
      this.syncDialoguePlayerPosition(segment.startMs, {
        persist: false,
        centerOnActive: true,
        instant: false
      });
      this.startDialoguePlayerSegmentProgress(segment, playbackToken);
    };

    utterance.onend = () => {
      cleanup();
      this.stopDialoguePlayerSegmentProgress(segment.endMs - 1, {
        persist: false,
        centerOnActive: false,
        instant: true
      });
      if (!runtime.isPlaying || runtime.playbackToken !== playbackToken) return;
      if (queueIndex === queueLength - 1) {
        this.pauseDialoguePlayer({ persist: true, updateUI: true, keepSpeech: true });
      }
    };

    utterance.onerror = () => {
      cleanup();
      this.stopDialoguePlayerSegmentProgress(segment.endMs - 1, {
        persist: false,
        centerOnActive: false,
        instant: true
      });
      if (!runtime.isPlaying || runtime.playbackToken !== playbackToken) return;
      if (queueIndex === queueLength - 1) {
        this.pauseDialoguePlayer({ persist: true, updateUI: true, keepSpeech: true });
      }
    };

    return utterance;
  },

  playDialoguePlayerSequentialSegments(segments, playbackToken, queueIndex = 0) {
    const runtime = this._dialoguePlayerRuntime;
    if (!runtime.isPlaying || runtime.playbackToken !== playbackToken) return;

    const segment = segments[queueIndex];
    if (!segment) {
      this.pauseDialoguePlayer({ persist: true, updateUI: true, keepSpeech: true });
      return;
    }

    const utterance = this.createDialoguePlayerUtterance(segment, playbackToken, queueIndex, segments.length);
    if (!utterance) {
      this.playDialoguePlayerSequentialSegments(segments, playbackToken, queueIndex + 1);
      return;
    }

    const originalEnd = utterance.onend;
    const originalError = utterance.onerror;

    utterance.onend = event => {
      if (typeof originalEnd === 'function') originalEnd(event);
      if (!runtime.isPlaying || runtime.playbackToken !== playbackToken) return;
      this.playDialoguePlayerSequentialSegments(segments, playbackToken, queueIndex + 1);
    };

    utterance.onerror = event => {
      if (typeof originalError === 'function') originalError(event);
      if (!runtime.isPlaying || runtime.playbackToken !== playbackToken) return;
      this.playDialoguePlayerSequentialSegments(segments, playbackToken, queueIndex + 1);
    };

    this.dispatchDialoguePlayerUtterance(utterance, playbackToken, {
      delayMs: this.shouldUseDialoguePlayerSequentialSpeech() ? 48 : 0
    });
  },

  continueDialoguePlayerPlayback(playbackToken) {
    const runtime = this._dialoguePlayerRuntime;
    const timeline = this.ensureDialoguePlayerSession();
    if (!timeline.length) {
      this.pauseDialoguePlayer({ persist: false, updateUI: true });
      return;
    }

    const currentIndex = this.getDialoguePlayerActiveIndexForTime(this.state.dialoguePlayerCurrentTimeMs || 0, timeline);
    const preparedSegments = Array.isArray(runtime.preparedPlan?.segments) && runtime.preparedPlan?.key === runtime.preparedKey
      ? runtime.preparedPlan.segments
      : timeline;
    const queueSegments = preparedSegments.filter(segment => segment.index >= currentIndex);
    if (this.shouldUseDialoguePlayerSequentialSpeech()) {
      runtime.queuedUtterances = [];
      this.playDialoguePlayerSequentialSegments(queueSegments, playbackToken, 0);
      return;
    }

    const utterances = queueSegments
      .map((segment, queueIndex) => this.createDialoguePlayerUtterance(segment, playbackToken, queueIndex, queueSegments.length))
      .filter(Boolean);

    runtime.queuedUtterances = utterances;
    if (!utterances.length) {
      this.pauseDialoguePlayer({ persist: false, updateUI: true });
      return;
    }

    // Queueing upfront gives desktop engines a chance to fetch ahead instead of stalling between lines.
    utterances.forEach((utterance, index) => {
      this.dispatchDialoguePlayerUtterance(utterance, playbackToken, {
        delayMs: index === 0 ? 20 : 0
      });
    });
  },

  async restartDialoguePlayerPlayback() {
    if (!this._dialoguePlayerRuntime.isPlaying) return;
    this.pauseDialoguePlayer({ persist: false, updateUI: true });
    await this.playDialoguePlayer();
  },

  async playDialoguePlayer() {
    const timeline = this.ensureDialoguePlayerSession();
    if (!timeline.length) return;
    if (!window.speechSynthesis) {
      if (typeof UI !== 'undefined' && typeof UI.showToast === 'function') {
        UI.showToast('Speech unavailable in this browser', { variant: 'strong', duration: 1800 });
      }
      return;
    }

    const runtime = this._dialoguePlayerRuntime;
    const durationMs = this.getDialoguePlayerDurationMs();
    const shouldUseSequentialSpeech = this.shouldUseDialoguePlayerSequentialSpeech();
    this.primeDialoguePlayerSpeechPipeline();

    if (shouldUseSequentialSpeech) {
      this.prepareDialoguePlayerAudio({ warm: false, silent: true }).catch(() => {});
    } else {
      const isReady = await this.prepareDialoguePlayerAudio({ warm: true });
      if (!isReady) return;
    }

    if (runtime.rafId) {
      cancelAnimationFrame(runtime.rafId);
      runtime.rafId = 0;
    }
    if (runtime.progressRafId) {
      cancelAnimationFrame(runtime.progressRafId);
      runtime.progressRafId = 0;
    }
    if (runtime.utteranceTimerId) {
      clearTimeout(runtime.utteranceTimerId);
      runtime.utteranceTimerId = 0;
    }
    if (window.speechSynthesis) {
      try { window.speechSynthesis.cancel(); } catch (e) {}
    }

    if ((this.state.dialoguePlayerCurrentTimeMs || 0) >= Math.max(0, durationMs - 32)) {
      this.state.dialoguePlayerCurrentTimeMs = 0;
      this.state.dialoguePlayerActiveLineIndex = 0;
    }

    runtime.isPlaying = true;
    runtime.startedFromMs = this.state.dialoguePlayerCurrentTimeMs || 0;
    runtime.startedAt = performance.now();
    runtime.playbackToken += 1;
    runtime.queuedUtterances = [];

    if (this.state.mode === 'listening' && this.state.listeningMode === 'dialogue' && typeof UI !== 'undefined' && typeof UI.updateDialoguePlayerUI === 'function') {
      UI.updateDialoguePlayerUI({ centerOnActive: false, instant: true });
    }

    this.continueDialoguePlayerPlayback(runtime.playbackToken);
  },

  pauseDialoguePlayer(options = {}) {
    const runtime = this._dialoguePlayerRuntime;

    if (runtime.isPreparing && window.DialogueAudioEngine && typeof window.DialogueAudioEngine.cancel === 'function') {
      window.DialogueAudioEngine.cancel(this, {
        keepPrepared: false,
        updateUI: options.updateUI !== false
      });
    }

    if (runtime.rafId) {
      cancelAnimationFrame(runtime.rafId);
      runtime.rafId = 0;
    }
    if (runtime.progressRafId) {
      cancelAnimationFrame(runtime.progressRafId);
      runtime.progressRafId = 0;
    }
    if (runtime.utteranceTimerId) {
      clearTimeout(runtime.utteranceTimerId);
      runtime.utteranceTimerId = 0;
    }

    runtime.isPlaying = false;
    runtime.startedAt = 0;
    runtime.startedFromMs = this.state.dialoguePlayerCurrentTimeMs || 0;
    runtime.playbackToken += 1;
    runtime.queuedUtterances = [];

    if (options.keepSpeech !== true && window.speechSynthesis) {
      try { window.speechSynthesis.cancel(); } catch (e) {}
    }

    if (options.persist !== false) this.saveSettings();

    if (options.updateUI !== false && this.state.mode === 'listening' && this.state.listeningMode === 'dialogue' && typeof UI !== 'undefined' && typeof UI.updateDialoguePlayerUI === 'function') {
      UI.updateDialoguePlayerUI({ centerOnActive: false, instant: true });
    }
  },

  toggleDialoguePlayerPlayback() {
    if (this._dialoguePlayerRuntime.isPreparing || this._dialoguePlayerRuntime.isPlaying) this.pauseDialoguePlayer();
    else this.playDialoguePlayer();
  },

  async loadScript(src) {
      if (!window._scriptPromises) window._scriptPromises = {};
      if (window._scriptPromises[src]) return window._scriptPromises[src];

      const isLocalFile = window.location.protocol === 'file:';
      const actualSrc = (isLocalFile && src.includes('?')) ? src.split('?')[0] : src;

      const resolvedSrc = new URL(actualSrc, window.location.href).href;
      const existingScript = [...document.scripts].find(script => {
          try {
              return new URL(script.src, window.location.href).href === resolvedSrc;
          } catch (e) {
              return script.getAttribute('src') === actualSrc;
          }
      });
      if (existingScript) return Promise.resolve();

      const p = new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = actualSrc;
          script.async = true;
          script.onload = () => resolve();
          script.onerror = async () => {
              try {
                  const response = await fetch(actualSrc, { cache: 'no-store' });
                  if (!response.ok) {
                      throw new Error(`Failed to fetch fallback script ${actualSrc}: ${response.status}`);
                  }
                  const code = await response.text();
                  const inlineScript = document.createElement('script');
                  inlineScript.text = `${code}\n//# sourceURL=${actualSrc}`;
                  document.head.appendChild(inlineScript);
                  resolve();
              } catch (error) {
                  reject(new Error(`Load failed for ${actualSrc}: ${error?.message || 'unknown script error'}`));
              }
          };
          document.head.appendChild(script);
      }).catch(error => {
          delete window._scriptPromises[src];
          throw error;
      });
      window._scriptPromises[src] = p;
      return p;
  },

  async fetchJSON(src) {
      if (!window._jsonPromises) window._jsonPromises = {};
      if (window._jsonPromises[src]) return window._jsonPromises[src];

      const isLocalFile = window.location.protocol === 'file:';
      const assetSrc = isLocalFile ? src : `${src}${src.includes('?') ? '&' : '?'}v=20260415charsplit`;
      const p = fetch(assetSrc)
          .then(async response => {
              if (!response.ok) {
                  throw new Error(`Failed to fetch ${src}: ${response.status}`);
              }
              return response.json();
          })
          .catch(error => {
              delete window._jsonPromises[src];
              throw error;
          });
      window._jsonPromises[src] = p;
      return p;
  },

  async loadHanziWriter() {
      if (window.HanziWriter) return true;
      try {
          await this.loadScript('https://cdn.jsdelivr.net/npm/hanzi-writer@3.5/dist/hanzi-writer.min.js');
          return true;
      } catch(e) {
          return false;
      }
  },

  normalizeCharRecord(char, record = {}, options = {}) {
      const keepTree = options.includeTree === true;
      const pinyin = Array.isArray(record.pinyin) ? [...record.pinyin] : (record.pinyin ? [record.pinyin] : []);
      const definition = this.sanitizeDefinition(record.def || record.meaning || record.definition);
      const normalized = {
          hanzi: char,
          pinyin,
          def: definition,
          meaning: definition,
          chameleon_alert: record.chameleon_alert || null,
          phonetic_clue: record.phonetic_clue || null,
          street_utility: record.street_utility || null
      };

      if (keepTree && record.deconstruction_tree) {
          normalized.deconstruction_tree = record.deconstruction_tree;
      }

      if (record.isGeneratedFallback) normalized.isGeneratedFallback = true;
      if (options.metaOnly) normalized.isMetaOnly = true;

      return normalized;
  },

  applyStoredUserHooks() {
      const userHooks = JSON.parse(localStorage.getItem('fc_user_hooks') || '{}');
      Object.keys(userHooks).forEach(char => {
          if (DATA.CHARS[char]) {
              DATA.CHARS[char].hook = userHooks[char];
          } else {
              DATA.CHARS[char] = { hanzi: char, hook: userHooks[char] };
          }
      });
  },

  async loadCharacterMeta() {
      if (this._characterMetaPromise) return this._characterMetaPromise;

      this._characterMetaPromise = this.fetchJSON('data/chars/meta.json')
          .then(meta => {
              Object.entries(meta || {}).forEach(([char, record]) => {
                  const existing = DATA.CHARS[char] || {};
                  DATA.CHARS[char] = {
                      ...existing,
                      ...this.normalizeCharRecord(char, record, { metaOnly: true }),
                      hook: existing.hook || record.hook || ''
                  };
              });
              this.applyStoredUserHooks();
              return DATA.CHARS;
          })
          .catch(error => {
              this._characterMetaPromise = null;
              throw error;
          });

      return this._characterMetaPromise;
  },

  async loadCharacterChunkMap() {
      if (this._characterChunkMap) return this._characterChunkMap;
      if (!this._characterChunkMapPromise) {
          this._characterChunkMapPromise = this.fetchJSON('data/chars/chunk-map.json')
              .then(map => {
                  this._characterChunkMap = map || {};
                  return this._characterChunkMap;
              })
              .catch(error => {
                  this._characterChunkMapPromise = null;
                  throw error;
              });
      }
      return this._characterChunkMapPromise;
  },

  async loadCharacterComponentIndex() {
      if (this._componentIndex) return this._componentIndex;
      if (!this._componentIndexPromise) {
          this._componentIndexPromise = this.fetchJSON('data/chars/component-index.json')
              .then(index => {
                  this._componentIndex = index || {};
                  return this._componentIndex;
              })
              .catch(error => {
                  this._componentIndexPromise = null;
                  throw error;
              });
      }
      return this._componentIndexPromise;
  },

  async loadCharacterFallbackTreeIndex() {
      if (this._fallbackTreeIndex) return this._fallbackTreeIndex;
      if (!this._fallbackTreeIndexPromise) {
          this._fallbackTreeIndexPromise = this.fetchJSON('data/chars/fallback-tree-index.json')
              .then(index => {
                  this._fallbackTreeIndex = index || {};
                  return this._fallbackTreeIndex;
              })
              .catch(error => {
                  this._fallbackTreeIndexPromise = null;
                  throw error;
              });
      }
      return this._fallbackTreeIndexPromise;
  },

  async ensureCharDataLoaded(chars, options = {}) {
      const uniqueChars = [...new Set((Array.isArray(chars) ? chars : [chars])
          .map(char => String(char || '').trim())
          .filter(char => char && /[\u4e00-\u9fff]/.test(char))
      )];

      if (!uniqueChars.length) return DATA.CHARS;

      await this.loadCharacterChunkMap();

      const pendingByChunk = new Map();
      uniqueChars.forEach(char => {
          const existing = DATA.CHARS[char];
          if (existing && existing.deconstruction_tree && !existing.isMetaOnly) return;
          const chunkId = this._characterChunkMap ? this._characterChunkMap[char] : '';
          if (!chunkId) return;
          if (!pendingByChunk.has(chunkId)) pendingByChunk.set(chunkId, []);
          pendingByChunk.get(chunkId).push(char);
      });

      if (!pendingByChunk.size) return DATA.CHARS;

      if (!this._characterChunkPromises) this._characterChunkPromises = {};

      await Promise.all([...pendingByChunk.keys()].map(chunkId => {
          if (!this._characterChunkPromises[chunkId]) {
              this._characterChunkPromises[chunkId] = this.fetchJSON(`data/chars/chunks/${chunkId}`)
                  .then(chunk => {
                      Object.entries(chunk || {}).forEach(([char, record]) => {
                          const existing = DATA.CHARS[char] || {};
                          DATA.CHARS[char] = {
                              ...existing,
                              ...this.normalizeCharRecord(char, record, { includeTree: true }),
                              hook: existing.hook || record.hook || ''
                          };
                          delete DATA.CHARS[char].isMetaOnly;
                      });
                      this.applyStoredUserHooks();
                      return chunk;
                  })
                  .catch(error => {
                      delete this._characterChunkPromises[chunkId];
                      throw error;
                  });
          }
          return this._characterChunkPromises[chunkId];
      }));

      return DATA.CHARS;
  },

  async buildCharacterIndices(options = {}) {
      const includeFallbackTree = options.includeFallbackTree === true;
      await this.loadCharacterComponentIndex();
      if (includeFallbackTree) {
          await this.loadCharacterFallbackTreeIndex();
      }
      return {
          componentIndex: this._componentIndex || {},
          fallbackTreeIndex: this._fallbackTreeIndex || {}
      };
  },

  prefetchCharDataForText(text, options = {}) {
      const chars = [...new Set((String(text || '').match(/[\u4e00-\u9fff]/g) || []))];
      if (!chars.length) return;

      const missing = chars.filter(char => {
          const record = DATA.CHARS[char];
          return !record || (!record.deconstruction_tree && record.isMetaOnly !== false);
      });
      if (!missing.length) return;

      const key = missing.join('');
      if (!this._prefetchingCharKeys) this._prefetchingCharKeys = new Set();
      if (this._prefetchingCharKeys.has(key)) return;
      this._prefetchingCharKeys.add(key);

      this.ensureCharDataLoaded(missing)
          .then(() => {
              if (!options.rerender) return;
              if (!window.UI || typeof UI.render !== 'function') return;
              if (options.mode && this.state.mode !== options.mode) return;
              if (options.itemId && this.getItemId(this.state.activeList[this.state.currentIndex]) !== options.itemId) return;
              UI.render();
          })
          .catch(error => {
              console.error('Failed to prefetch character data', error);
          })
          .finally(() => {
              this._prefetchingCharKeys.delete(key);
          });
  },

  normalizeBookId(value) {
      const raw = String(value || '').trim();
      if (!raw) return '1';
      if (raw.toLowerCase() === 'all') return 'All';
      const match = raw.match(/\d+/);
      return match ? String(Number.parseInt(match[0], 10)) : raw;
  },

  normalizeLessonId(value) {
      const raw = String(value || '').trim();
      if (!raw) return '0';
      if (raw.toLowerCase() === 'all') return 'All';
      const match = raw.match(/\d+/);
      return match ? String(Number.parseInt(match[0], 10)) : raw;
  },

  async loadVocabCatalog() {
      if (this._vocabCatalog) return this._vocabCatalog;
      if (!this._vocabCatalogPromise) {
          this._vocabCatalogPromise = this.fetchJSON('data/vocab/catalog.json')
              .then(catalog => {
                  this._vocabCatalog = catalog || { books: [], lessonsByBook: {}, dialoguesByBookLesson: {} };
                  return this._vocabCatalog;
              })
              .catch(error => {
                  this._vocabCatalogPromise = null;
                  throw error;
              });
      }
      return this._vocabCatalogPromise;
  },

  async loadSentenceCatalog() {
      if (this._sentenceCatalog) return this._sentenceCatalog;
      if (!this._sentenceCatalogPromise) {
          this._sentenceCatalogPromise = this.fetchJSON('data/sentences/catalog.json')
              .then(catalog => {
                  this._sentenceCatalog = catalog || { books: [], lessonsByBook: {}, dialoguesByBookLesson: {} };
                  return this._sentenceCatalog;
              })
              .catch(error => {
                  this._sentenceCatalogPromise = null;
                  throw error;
              });
      }
      return this._sentenceCatalogPromise;
  },

  getCatalogForSource(source = 'vocab') {
      return source === 'sentences'
          ? (this._sentenceCatalog || { books: [], lessonsByBook: {}, dialoguesByBookLesson: {} })
          : (this._vocabCatalog || { books: [], lessonsByBook: {}, dialoguesByBookLesson: {} });
  },

  getAvailableBooks(source = 'vocab') {
      const catalog = this.getCatalogForSource(source);
      return Array.isArray(catalog.books) ? [...catalog.books] : [];
  },

  getSelectedBookIds() {
      const raw = Array.isArray(this.state.bookFilter) ? this.state.bookFilter : [this.state.bookFilter || '1'];
      const normalized = raw.map(value => this.normalizeBookId(value));
      if (normalized.includes('All')) return this.getAvailableBooks('vocab');
      return [...new Set(normalized.filter(Boolean))];
  },

  getAvailableLessonsForBooks(books, source = 'vocab') {
      const catalog = this.getCatalogForSource(source);
      const lessonSet = new Set();
      (books || []).forEach(book => {
          const key = this.normalizeBookId(book);
          (catalog.lessonsByBook?.[key] || []).forEach(lesson => lessonSet.add(String(lesson)));
      });
      return [...lessonSet].sort((a, b) => Number(a) - Number(b));
  },

  getAvailableDialoguesForLesson(books, lesson, source = 'vocab') {
      const catalog = this.getCatalogForSource(source);
      const lessonId = this.normalizeLessonId(lesson);
      const dialogueSet = new Set();
      (books || []).forEach(book => {
          const key = `${this.normalizeBookId(book)}-${lessonId}`;
          (catalog.dialoguesByBookLesson?.[key] || []).forEach(dialogue => {
              if (String(dialogue) !== '0') dialogueSet.add(String(dialogue));
          });
      });
      return [...dialogueSet].sort((a, b) => Number(a) - Number(b));
  },

  normalizeVocabEntry(entry = {}) {
      const hanzi = entry.word || entry.hanzi;
      if (!hanzi) return null;
      const book = this.normalizeBookId(entry.book_id || entry.book || '1');
      const lesson = this.normalizeLessonId(entry.lesson_id || entry.lesson || '0');
      const dialogue = this.normalizeLessonId(entry.dialogue_id || entry.dialogue || '0');
      const key = entry.id || `${book}-${lesson}-${hanzi}`;
      const safePinyin = typeof entry.pinyin === 'string' ? entry.pinyin.trim() : '';
      const safeDef = this.sanitizeDefinition(entry.definition ?? entry.def ?? '');
      return {
          ...entry,
          id: key,
          hanzi,
          pinyin: safePinyin,
          def: safeDef,
          lesson,
          book,
          dialogue,
          searchKey: Utils.normalizeSearch(`${hanzi}${safePinyin}${safeDef}`)
      };
  },

  ingestVocabEntries(entries = []) {
      if (!(this._vocabItemMap instanceof Map)) this._vocabItemMap = new Map();
      let added = 0;

      entries.forEach(entry => {
          const normalized = this.normalizeVocabEntry(entry);
          if (!normalized || this._vocabItemMap.has(normalized.id)) return;
          this._vocabItemMap.set(normalized.id, normalized);
          DATA.VOCAB.push(normalized);
          added += 1;

          if (!DATA.VOCAB_EXACT_MATCH[normalized.hanzi]) DATA.VOCAB_EXACT_MATCH[normalized.hanzi] = [];
          DATA.VOCAB_EXACT_MATCH[normalized.hanzi].push(normalized);

          [...new Set(normalized.hanzi.split(''))].forEach(char => {
              if (!DATA.VOCAB_BY_CHAR[char]) DATA.VOCAB_BY_CHAR[char] = [];
              DATA.VOCAB_BY_CHAR[char].push(normalized);
          });
      });

      if (added > 0) {
          if (Utils && Object.prototype.hasOwnProperty.call(Utils, '_vocabSet')) Utils._vocabSet = null;
          this.applyTemporaryVocabHooks();
      }
  },

  normalizeSentenceEntry(entry = {}) {
      const book = this.normalizeBookId(entry.book_id || entry.book || '1');
      const lesson = this.normalizeLessonId(entry.lesson_id || entry.lesson || '0');
      const dialogue = this.normalizeLessonId(entry.dialogue_id || entry.dialogue || '0');
      const zh = entry.sentence ? String(entry.sentence).replace(/<br\s*\/?>/gi, ' ') : String(entry.zh || '').replace(/<br\s*\/?>/gi, ' ');
      if (!zh) return null;
      const py = entry.pinyin ? String(entry.pinyin).replace(/<br\s*\/?>/gi, ' ') : String(entry.py || '');
      const en = entry.english ? String(entry.english).replace(/<br\s*\/?>/gi, ' ') : String(entry.en || '');
      return {
          id: entry.source_id || entry.id,
          zh,
          py,
          en,
          book,
          lesson,
          dialogue,
          seq: Number.parseInt(String(entry.sentence_id || entry.seq || 0), 10) || 0,
          searchKey: Utils.normalizeSearch(`${zh}${py}${en}`)
      };
  },

  ingestSentenceEntries(entries = []) {
      if (!(this._sentenceTextSet instanceof Set)) this._sentenceTextSet = new Set();
      let added = 0;

      entries.forEach(entry => {
          const normalized = this.normalizeSentenceEntry(entry);
          if (!normalized || this._sentenceTextSet.has(normalized.zh)) return;
          this._sentenceTextSet.add(normalized.zh);
          DATA.SENTENCES.push(normalized);
          added += 1;

          const lessonKey = `${normalized.book}-${normalized.lesson}`;
          if (!DATA.SENTENCES_BY_LESSON[lessonKey]) DATA.SENTENCES_BY_LESSON[lessonKey] = [];
          DATA.SENTENCES_BY_LESSON[lessonKey].push(normalized);

          [...new Set(normalized.zh.split(''))].forEach(char => {
              if (!DATA.SENTENCES_BY_CHAR[char]) DATA.SENTENCES_BY_CHAR[char] = [];
              DATA.SENTENCES_BY_CHAR[char].push(normalized);
          });
      });

      if (added > 0) {
          this._dialoguePlayerTranslationIndex = null;
      }
  },

  async loadVocabBook(book) {
      const bookId = this.normalizeBookId(book);
      if (!this._loadedVocabBooks) this._loadedVocabBooks = new Set();
      if (this._loadedVocabBooks.has(bookId)) return;
      if (!this._vocabBookPromises) this._vocabBookPromises = {};
      if (!this._vocabBookPromises[bookId]) {
          this._vocabBookPromises[bookId] = this.fetchJSON(`data/vocab/books/book-${bookId}.json`)
              .then(entries => {
                  this.ingestVocabEntries(entries);
                  this._loadedVocabBooks.add(bookId);
                  return true;
              })
              .catch(error => {
                  delete this._vocabBookPromises[bookId];
                  throw error;
              });
      }
      return this._vocabBookPromises[bookId];
  },

  async loadSentenceBook(book) {
      const bookId = this.normalizeBookId(book);
      if (!this._loadedSentenceBooks) this._loadedSentenceBooks = new Set();
      if (this._loadedSentenceBooks.has(bookId)) return;
      if (!this._sentenceBookPromises) this._sentenceBookPromises = {};
      if (!this._sentenceBookPromises[bookId]) {
          this._sentenceBookPromises[bookId] = this.fetchJSON(`data/sentences/books/book-${bookId}.json`)
              .then(entries => {
                  this.ingestSentenceEntries(entries);
                  this._loadedSentenceBooks.add(bookId);
                  return true;
              })
              .catch(error => {
                  delete this._sentenceBookPromises[bookId];
                  throw error;
              });
      }
      return this._sentenceBookPromises[bookId];
  },

  async ensureDatasetBooksLoaded(books, options = {}) {
      const targetBooks = [...new Set((books || []).map(book => this.normalizeBookId(book)).filter(book => book && book !== 'All'))];
      if (!targetBooks.length) return;

      const tasks = [];
      if (options.vocab !== false) {
          targetBooks.forEach(book => tasks.push(this.loadVocabBook(book)));
      }
      if (options.sentences !== false) {
          targetBooks.forEach(book => tasks.push(this.loadSentenceBook(book)));
      }
      await Promise.all(tasks);
  },

  async ensureDataLoadedForCurrentState(options = {}) {
      await Promise.all([
          this.loadVocabCatalog(),
          this.loadSentenceCatalog()
      ]);

      const selectedBooks = this.getSelectedBookIds();
      await this.ensureDatasetBooksLoaded(selectedBooks, {
          vocab: options.vocab !== false,
          sentences: options.sentences !== false
      });
  },

  writingService: {
      preloaded: new Set(),
      preload(chars) {
          if (typeof HanziWriter === 'undefined' || !HanziWriter.loadCharacterData) return;
          const unique = [...new Set(chars)].filter(c => /[\u4e00-\u9fa5]/.test(c) && !this.preloaded.has(c));
          unique.forEach(c => {
              this.preloaded.add(c);
              // Use requestIdleCallback if available for background loading, else setTimeout
              const run = window.requestIdleCallback || window.setTimeout;
              run(() => {
                  HanziWriter.loadCharacterData(c).catch(() => this.preloaded.delete(c));
              });
          });
      }
  },

  preloadUpcomingChars() {
      if (!this.state.activeList || this.state.activeList.length === 0) return;
      
      // Prevent aggressive background downloading of HanziWriter data unless in writing mode
      if (this.state.mode !== 'writing') return;
      this.loadHanziWriter();

      const chars = [];
      // Aggressively preload current and next 5 items
      for (let i = 0; i < 6; i++) {
          const idx = (this.state.currentIndex + i) % this.state.activeList.length;
          const item = this.state.activeList[idx];
          if (item) {
              const str = item.hanzi || item.zh || '';
              for (const c of str) chars.push(c);
          }
      }
      this.writingService.preload(chars);
  },

  normalizeHookLookupValue(text) {
    if (!text) return '';
    const cleaned = String(text)
      .normalize('NFKC')
      .replace(/[（(][^）)]*[）)]/g, '')
      .replace(/[／]/g, '/')
      .replace(/\s+/g, '')
      .trim();
    return Utils.normalizeSearch(cleaned.replace(/\//g, ''));
  },

  sanitizeDefinition(text) {
    if (text == null) return '';
    const cleaned = String(text).trim();
    return cleaned && cleaned.toLowerCase() !== 'undefined' ? cleaned : '';
  },

  compactDefinition(text, options = {}) {
    const fallback = options.fallback ?? '';
    const maxLength = options.maxLength ?? 56;
    let cleaned = this.sanitizeDefinition(text)
      .replace(/\[[^\]]*\]/g, '')
      .replace(/[（(][^）)]*[）)]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleaned) return fallback;
    if (/^abbr\.\s+for\b/i.test(cleaned)) return fallback;

    cleaned = cleaned
      .replace(/^(variant of|see also|classifier for)\s+/i, '')
      .trim();

    let compact = cleaned
      .split(/[;；/]/)
      .map(part => part.trim())
      .find(Boolean) || cleaned;

    const commaParts = compact.split(/,\s*/).map(part => part.trim()).filter(Boolean);
    if (compact.length > maxLength && commaParts.length > 1) {
      compact = commaParts.slice(0, 2).join(', ');
    }

    if (compact.length > maxLength) {
      compact = `${compact.slice(0, maxLength - 1).trim()}…`;
    }

    return compact || fallback;
  },

  setTtsVoice(lang, voiceName) {
      if (lang === 'zh') {
          this.state.ttsVoiceZh = voiceName;
          this._cachedVoice = null;
          this._cachedVoiceKey = '';
      } else {
          this.state.ttsVoiceEn = voiceName;
          this._cachedEnVoice = null;
          this._cachedEnVoiceKey = '';
      }
      this.saveSettings();
  },

  getItemId(item) {
    if (!item) return '';
    return item.id || item.hanzi || item.zh || '';
  },

  getFilterKey() {
    return JSON.stringify({
      b: this.state.bookFilter,
      l: this.state.lessonFilter,
      d: this.state.dialogueFilter,
      h: this.state.hideLearned,
      s: this.state.separateMode,
      sh: this.state.shuffle,
      qt: this.state.quizType,
      lh: this.state.listeningHard
    });
  },

  getAcceptedPinyinTargets(item) {
    const answers = [];
    const addValue = (value) => {
      if (!value) return;
      String(value)
        .split(/[\/／,，;|]/)
        .map(part => part.replace(/[（(].*?[）)]/g, '').trim())
        .filter(Boolean)
        .forEach(part => {
          const formatted = Utils.formatNumberedPinyin(part);
          if (formatted && !answers.includes(formatted)) answers.push(formatted);
        });
    };

    addValue(item?._cleanPy || item?.pinyin || item?.py);

    const cleanHanzi = String(item?.hanzi || '').replace(/[（(].*?[）)]/g, '').replace(/[^\u4e00-\u9fa5]/g, '');
    if (cleanHanzi.length === 1) {
      const charData = DATA.CHARS && DATA.CHARS[cleanHanzi];
      if (charData) {
        const variations = charData.chameleon_alert?.pinyin_variations;
        if (Array.isArray(variations) && variations.length) {
          variations.forEach(addValue);
        } else {
          addValue(charData.pinyin);
        }
      }
    }

    return answers;
  },

  getHookWordVariants(word) {
    if (!word) return [];
    const raw = String(word).normalize('NFKC').replace(/[／]/g, '/');
    const parts = raw.split('/').map(part => part.trim()).filter(Boolean);
    const source = [raw.trim(), ...parts];
    return [...new Set(source.map(part => this.normalizeHookLookupValue(part)).filter(Boolean))];
  },

  applyTemporaryVocabHooks() {
    const fallbackHooks = typeof vocabularyHooks !== 'undefined'
      ? vocabularyHooks
      : typeof vocabularyHooksBatch1 !== 'undefined'
        ? vocabularyHooksBatch1
        : [];

    const rawHooks = Array.isArray(window.vocabularyHooks) ? window.vocabularyHooks
      : Array.isArray(window.vocabularyHooksBatch1) ? window.vocabularyHooksBatch1
      : Array.isArray(fallbackHooks) ? fallbackHooks
      : [];

    if (!rawHooks.length || !DATA.VOCAB.length) return;

    const hookMap = new Map();
    rawHooks.forEach((entry, index) => {
      if (!entry || !entry.word || !entry.hook) return;

      const payload = {
        ...entry,
        _normalizedMeaning: this.normalizeHookLookupValue(entry.meaning || entry.def || ''),
        _order: index
      };

      this.getHookWordVariants(entry.word).forEach(variant => {
        if (!hookMap.has(variant)) hookMap.set(variant, []);
        hookMap.get(variant).push(payload);
      });
    });

    DATA.VOCAB.forEach(item => {
      if (String(item.book) !== '2') return;

      const lessonNum = Number(item.lesson);
      if (!Number.isFinite(lessonNum) || lessonNum < 11 || lessonNum > 16) return;
      if (item.hook) return;

      const candidates = this.getHookWordVariants(item.hanzi)
        .flatMap(variant => hookMap.get(variant) || []);
      if (!candidates.length) return;

      const itemMeaning = this.normalizeHookLookupValue(item.def);
      const bestMatch = candidates.find(candidate => (
        candidate._normalizedMeaning
        && itemMeaning
        && (itemMeaning.includes(candidate._normalizedMeaning) || candidate._normalizedMeaning.includes(itemMeaning))
      )) || candidates[0];

      item.hook = bestMatch.hook.trim();
      item.hookBreakdown = bestMatch.breakdown ? bestMatch.breakdown.trim() : '';
    });
  },

  async importData() {
    // Dynamically load massive data files so they don't block the UI from rendering
    const scripts = ['memory.js'];
    const fill = document.getElementById('hqProgressFill');
    let loaded = 0;

    await Promise.all([
        this.loadCharacterMeta(),
        this.loadVocabCatalog(),
        this.loadSentenceCatalog()
    ]);
    if (fill) fill.style.width = '35%';

    for (const src of scripts) {
        await this.loadScript(src);
        loaded++;
        if (fill) fill.style.width = `${35 + (loaded / scripts.length) * 20}%`;
    }

    this.applyStoredUserHooks();
  },

  loadSettings() {
    const s = localStorage.getItem('fc_settings');
    if (s) {
      try {
        const parsed = JSON.parse(s);
        const rawBookFilter = Array.isArray(parsed.bookFilter) ? parsed.bookFilter : [parsed.bookFilter || '1'];
        const normalizedBooks = [...new Set(rawBookFilter
          .map(value => this.normalizeBookId(value))
          .filter(Boolean))];
        this.state.bookFilter = normalizedBooks.length ? normalizedBooks : ['1'];

        const rawLessonFilter = Array.isArray(parsed.lessonFilter) ? parsed.lessonFilter : [parsed.lessonFilter || 'All'];
        const normalizedLessons = [...new Set(rawLessonFilter
          .map(value => this.normalizeLessonId(value))
          .filter(Boolean))];
        this.state.lessonFilter = normalizedLessons.length ? normalizedLessons : ['All'];

        const rawDialogueFilter = parsed.dialogueFilter && typeof parsed.dialogueFilter === 'object' && !Array.isArray(parsed.dialogueFilter)
          ? parsed.dialogueFilter
          : {};
        this.state.dialogueFilter = Object.fromEntries(
          Object.entries(rawDialogueFilter).map(([lesson, dialogues]) => {
            const normalizedLesson = this.normalizeLessonId(lesson);
            const normalizedDialogues = [...new Set((Array.isArray(dialogues) ? dialogues : [dialogues])
              .map(value => this.normalizeLessonId(value))
              .filter(value => value && value !== '0'))];
            return [normalizedLesson, normalizedDialogues];
          }).filter(([lesson, dialogues]) => lesson && lesson !== 'All' && dialogues.length > 0)
        );
        this.state.shuffle = parsed.shuffle || false;
        this.state.ttsRate = parsed.ttsRate || 0.85;
        this.state.quizType = parsed.quizType === 'translate' ? 'translate' : 'vocab';
        this.state.quizDefOnly = parsed.quizDefOnly || false;
        this.state.noPinyin = parsed.noPinyin || false;
                if (!parsed._colorForced) {
                    this.state.noHanziColor = true;
                } else {
                    this.state.noHanziColor = (parsed.noHanziColor !== undefined) ? parsed.noHanziColor : true;
                }
        this.state.noTranslation = parsed.noTranslation || false;
        this.state.noExamplePinyin = parsed.noExamplePinyin !== undefined ? parsed.noExamplePinyin : true;
        this.state.separateMode = parsed.separateMode || 'off';
        this.state.fastNext = parsed.fastNext ?? true;
        this.state.listeningHard = parsed.listeningHard || false;
        this.state.listeningToneTest = parsed.listeningToneTest || false;
        this.state.listeningMode = ['def', 'hz', 'py', 'dialogue'].includes(parsed.listeningMode)
          ? parsed.listeningMode
          : this.state.listeningToneTest
            ? 'py'
            : 'def';
        this.state.dialoguePlayerText = parsed.dialoguePlayerText || '';
        this.state.dialoguePlayerActiveLineIndex = parsed.dialoguePlayerActiveLineIndex || 0;
        this.state.dialoguePlayerCurrentTimeMs = parsed.dialoguePlayerCurrentTimeMs || 0;
        this.state.dialoguePlayerVoiceMode = ['auto', 'zh', 'en'].includes(parsed.dialoguePlayerVoiceMode)
          ? parsed.dialoguePlayerVoiceMode
          : 'auto';
        this.state.dialoguePlayerContentType = ['conversation', 'narration', 'shadowing'].includes(parsed.dialoguePlayerContentType)
          ? parsed.dialoguePlayerContentType
          : 'conversation';
        this.state.dialoguePlayerPacing = ['steady', 'relaxed', 'slow'].includes(parsed.dialoguePlayerPacing)
          ? parsed.dialoguePlayerPacing
          : 'relaxed';
        this.state.dialoguePlayerSpeed = Math.max(0.5, Math.min(2, Number(parsed.dialoguePlayerSpeed) || 1));
        this.state.listeningHard = false;
        this.state.writingShowOutline = parsed.writingShowOutline ?? false;
        this.state.writingHideDrawing = parsed.writingHideDrawing || false;
        this.state.showHooks = parsed.showHooks ?? true;
        this.state.streak = parsed.streak || 0;
        this.state.hideLearned = parsed.hideLearned !== undefined ? parsed.hideLearned : true;
        this.state.hideDock = parsed.hideDock || false;
        this.state.autoPlay = parsed.autoPlay || false;
        this.state.ttsReadWord = parsed.ttsReadWord !== undefined ? parsed.ttsReadWord : true;
        this.state.ttsReadMeaning = parsed.ttsReadMeaning !== undefined ? parsed.ttsReadMeaning : true;
        this.state.ttsReadExample = parsed.ttsReadExample !== undefined ? parsed.ttsReadExample : false;
        this.state.ttsReadExampleEn = parsed.ttsReadExampleEn !== undefined ? parsed.ttsReadExampleEn : false;
        this.state.ttsItemInterval = parsed.ttsItemInterval !== undefined ? parsed.ttsItemInterval : 1.0;
        this.state.ttsCardInterval = parsed.ttsCardInterval !== undefined ? parsed.ttsCardInterval : 2.0;
        this.state.quizPrompt = parsed.quizPrompt || 'hz';
        this.state.quizAnswer = parsed.quizAnswer || 'py';
        this.state.mcPrompt = parsed.mcPrompt || 'hz';
        this.state.mcAnswer = parsed.mcAnswer || 'def';
        this.state.ttsVoiceZh = parsed.ttsVoiceZh || '';
        this.state.ttsVoiceEn = parsed.ttsVoiceEn || '';
        
        // 🌟 NEW: Restore exact session location
        this.state.mode = parsed.mode || 'study';
        this.state.currentIndex = parsed.currentIndex || 0;
        this.state.isFinished = parsed.isFinished || false;
        this.state.sessionMistakes = parsed.sessionMistakes || [];
        this.state.modeCache = {}; // Start fresh to avoid memory issues and stale caches across reloads
        this._restoredActiveListOrder = Array.isArray(parsed.activeListOrder) ? parsed.activeListOrder : null;
        this._restoredCurrentItemId = parsed.currentItemId || '';
        this._restoredFilterKey = parsed.activeListFilterKey || '';
      } catch (e) {
        localStorage.removeItem('fc_settings');
      }
    }
  },

  saveSettings(options = {}) {
    const { defer = false, delay = 180 } = options || {};
    if (defer) {
      if (this._saveSettingsTimer) clearTimeout(this._saveSettingsTimer);
      this._saveSettingsTimer = setTimeout(() => {
        this._saveSettingsTimer = null;
        this.saveSettings();
      }, Math.max(0, delay));
      return;
    }

    if (this._saveSettingsTimer) {
      clearTimeout(this._saveSettingsTimer);
      this._saveSettingsTimer = null;
    }

    const currentItem = this.state.activeList[this.state.currentIndex];
    const shouldPersistOrder = Array.isArray(this.state.activeList) && this.state.activeList.length > 0 && this.state.activeList.length <= 1500;
    const payload = {
      bookFilter: this.state.bookFilter,
      lessonFilter: this.state.lessonFilter,
      dialogueFilter: this.state.dialogueFilter,
      shuffle: this.state.shuffle,
      ttsRate: this.state.ttsRate,
      quizType: this.state.quizType,
      quizDefOnly: this.state.quizDefOnly,
      noPinyin: this.state.noPinyin,
      noHanziColor: this.state.noHanziColor,
              _colorForced: true,
      noTranslation: this.state.noTranslation,
      noExamplePinyin: this.state.noExamplePinyin,
      separateMode: this.state.separateMode,
      fastNext: this.state.fastNext,
      listeningHard: this.state.listeningHard,
      listeningToneTest: this.state.listeningToneTest,
      listeningMode: this.state.listeningMode,
      dialoguePlayerText: this.state.dialoguePlayerText,
      dialoguePlayerActiveLineIndex: this.state.dialoguePlayerActiveLineIndex,
      dialoguePlayerCurrentTimeMs: this.state.dialoguePlayerCurrentTimeMs,
      dialoguePlayerVoiceMode: this.state.dialoguePlayerVoiceMode,
      dialoguePlayerContentType: this.state.dialoguePlayerContentType,
      dialoguePlayerPacing: this.state.dialoguePlayerPacing,
      dialoguePlayerSpeed: this.getDialoguePlayerSpeed(),
      writingShowOutline: this.state.writingShowOutline,
      writingHideDrawing: this.state.writingHideDrawing,
      showHooks: this.state.showHooks,
      streak: this.state.streak,
      hideLearned: this.state.hideLearned,
      hideDock: this.state.hideDock,
      autoPlay: this.state.autoPlay,
      ttsReadWord: this.state.ttsReadWord,
      ttsReadMeaning: this.state.ttsReadMeaning,
      ttsReadExample: this.state.ttsReadExample,
      ttsReadExampleEn: this.state.ttsReadExampleEn,
      ttsItemInterval: this.state.ttsItemInterval,
      ttsCardInterval: this.state.ttsCardInterval,
      quizPrompt: this.state.quizPrompt,
      quizAnswer: this.state.quizAnswer,
      mcPrompt: this.state.mcPrompt,
      mcAnswer: this.state.mcAnswer,
      ttsVoiceZh: this.state.ttsVoiceZh,
      ttsVoiceEn: this.state.ttsVoiceEn,
      
      // 🌟 NEW: Save exact session location
      mode: this.state.mode,
      currentIndex: this.state.currentIndex,
      isFinished: this.state.isFinished,
      sessionMistakes: this.state.sessionMistakes,
      currentItemId: this.getItemId(currentItem),
      activeListFilterKey: this.getFilterKey(),
      activeListOrder: shouldPersistOrder ? this.state.activeList.map(item => this.getItemId(item)) : null
      // DO NOT save modeCache to localStorage, as it contains large arrays that freeze the UI
    };

    try {
      localStorage.setItem('fc_settings', JSON.stringify(payload));
    } catch (err) {
      try {
        delete payload.activeListOrder;
        localStorage.setItem('fc_settings', JSON.stringify(payload));
      } catch (finalErr) {}
    }
  },

  saveUserHook(char, text) {
    const userHooks = JSON.parse(localStorage.getItem('fc_user_hooks') || '{}');
    if (text && text.trim()) userHooks[char] = text.trim();
    else delete userHooks[char];
    localStorage.setItem('fc_user_hooks', JSON.stringify(userHooks));
    if (!DATA.CHARS[char]) DATA.CHARS[char] = { hanzi: char };
    DATA.CHARS[char].hook = text ? text.trim() : '';
  },

  saveLearned() {
    localStorage.setItem('fc_learned_items', JSON.stringify(Array.from(this.state.learnedItems)));
  },

  getSmartExamples(item) {
      if (!item) return [];
      const targetText = item.hanzi || item.zh || '';
      let allSentences = [];
      
      if (targetText) {
          const exactMatches = DATA.SENTENCES.filter(s => s.zh.includes(targetText));
          if (exactMatches.length > 0) {
              allSentences = exactMatches;
          } else {
              // Fallback to searching by individual characters if no exact word matches
              const chars = targetText.split('');
              chars.forEach(c => {
                  if (DATA.SENTENCES_BY_CHAR[c]) allSentences.push(...DATA.SENTENCES_BY_CHAR[c]);
              });
              allSentences = [...new Set(allSentences)]; // Remove duplicates
          }
      }

      if (allSentences.length === 0) return [];

      const activeBooks = Array.isArray(this.state.bookFilter) ? this.state.bookFilter : [this.state.bookFilter];
      const activeLessons = Array.isArray(this.state.lessonFilter) ? this.state.lessonFilter : [this.state.lessonFilter];
      const bookFilterAll = activeBooks.includes('All') || activeBooks.length === 0;
      const lessonFilterAll = activeLessons.includes('All') || activeLessons.length === 0;

      const sorted = allSentences.map(s => {
          let score = 0;
          if (s.zh.includes(targetText)) score += 100; // Exact vocab match priority
          if (!bookFilterAll && activeBooks.includes(s.book)) score += 50; // Active Book priority
          if (!lessonFilterAll && activeLessons.includes(s.lesson)) score += 30; // Active Lesson priority
          score -= s.zh.length; // Tie-breaker: shorter sentences are easier to read and score higher
          return { ...s, _score: score };
      }).sort((a, b) => b._score - a._score).slice(0, 4); // Only return top 4 matches
      
      if (sorted.length > 0) this.state.currentExample = sorted[0];
      return sorted;
  },

  _getFilteredItems(source) {
      // FIX: Force filters to be arrays to prevent crash if UI accidentally sets them as strings
      if (!Array.isArray(this.state.bookFilter)) {
          this.state.bookFilter = [this.state.bookFilter || 'All'];
      }
      if (!Array.isArray(this.state.lessonFilter)) {
          this.state.lessonFilter = [this.state.lessonFilter || 'All'];
      }

      const bookFilterAll = this.state.bookFilter.some(b => String(b).toLowerCase() === 'all');
      const validBooks = new Set(this.state.bookFilter.map(b => {
          if (String(b).toLowerCase() === 'all') return 'All';
          const m = String(b).match(/\d+/);
          return m ? String(parseInt(m[0], 10)) : String(b);
      }));

      const lessonFilterAll = this.state.lessonFilter.some(l => String(l).toLowerCase() === 'all');
      const validLessons = new Set();
      const validBookLessons = new Set();

      if (!lessonFilterAll) {
          this.state.lessonFilter.forEach(l => {
              const str = String(l);
              const nums = str.match(/\d+/g);
              if (nums && nums.length === 1) {
                  validLessons.add(String(parseInt(nums[0], 10)));
              } else if (nums && nums.length >= 2) {
                  const b = String(parseInt(nums[0], 10));
                  const lesson = String(parseInt(nums[nums.length - 1], 10));
                  validBookLessons.add(`${b}-${lesson}`);
              }
          });
      }

      const dialogueFilterObj = this.state.dialogueFilter || {};
      
      // 🚀 PERFORMANCE FIX: Pre-calculate valid dialogues outside the massive filter loop
      const parsedDialogues = {};
      for (const [lKey, dFilters] of Object.entries(dialogueFilterObj)) {
          if (Array.isArray(dFilters) && dFilters.length > 0) {
              parsedDialogues[lKey] = new Set(dFilters.map(d => {
                  const m = String(d).match(/\d+/g);
                  return m ? String(parseInt(m[m.length - 1], 10)) : '0';
              }));
          }
      }

      return source.filter(i => {
          // Normalize source book/lesson to strict integer strings (e.g. "01" -> "1")
          const iBook = String(parseInt(String(i.book).match(/\d+/)?.[0] || '1', 10));
          const iLesson = String(parseInt(String(i.lesson).match(/\d+/)?.[0] || '0', 10));
          const iBookLesson = `${iBook}-${iLesson}`;

          if (!bookFilterAll && !validBooks.has(iBook)) return false;
          
          if (!lessonFilterAll) {
              if (!validLessons.has(iLesson) && !validBookLessons.has(iBookLesson)) {
                  return false;
              }
          }
          
          const lKeyPadded = iLesson.padStart(2, '0');
          const validSet = parsedDialogues[iLesson] || 
                           parsedDialogues[lKeyPadded] || 
                           parsedDialogues[`B${iBook}L${iLesson}`] || 
                           parsedDialogues[`B${iBook}L${lKeyPadded}`] ||
                           parsedDialogues[iBookLesson];
          
          if (validSet) {
              const currentDialogue = String(parseInt(String(i.dialogue).match(/\d+/)?.[0] || '0', 10));
              if (!validSet.has(currentDialogue)) return false;
          }
          
          return true;
      });
  },

updateActiveList(preserveState = false) {
    const isSentencesSource = ['sentences', 'builder'].includes(this.state.mode) ||
                              (['quiz', 'quiz-mc'].includes(this.state.mode) && this.state.quizType === 'translate');
                              
    const source = isSentencesSource ? DATA.SENTENCES : DATA.VOCAB;
    const fromVocab = !isSentencesSource;

    let filtered = this._getFilteredItems(source);

    if (this.state.hideLearned && this.state.mode !== 'list') {
        filtered = filtered.filter(i => {
            const id = i.id || i.hanzi || i.zh;
            return !this.state.learnedItems.has(id);
        });
    }
    
    if (fromVocab) {
        if (this.state.separateMode === 'all') {
            filtered = Utils.expandVocabToChars(filtered, { includeSingles: true });
        } else if (this.state.separateMode === 'multiOnly') {
            filtered = Utils.expandVocabToChars(filtered, { includeSingles: false });
        }
    }
    
    if (this.state.shuffle) {
        for (let i = filtered.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [filtered[i], filtered[j]] = [filtered[j], filtered[i]];
        }
    } else {
        filtered.sort((a, b) => {
            if (a.book !== b.book) return a.book.localeCompare(b.book);
            const aL = parseInt(a.lesson, 10) || 0;
            const bL = parseInt(b.lesson, 10) || 0;
            if (aL !== bL) return aL - bL;
            return (a.seq || 0) - (b.seq || 0);
        });
    }

    if (
        preserveState &&
        Array.isArray(this._restoredActiveListOrder) &&
        this._restoredActiveListOrder.length > 0 &&
        (!this._restoredFilterKey || this._restoredFilterKey === this.getFilterKey())
    ) {
        const byId = new Map(filtered.map(item => [this.getItemId(item), item]));
        const restored = [];
        const used = new Set();

        this._restoredActiveListOrder.forEach(id => {
            if (!id || used.has(id) || !byId.has(id)) return;
            restored.push(byId.get(id));
            used.add(id);
        });

        filtered.forEach(item => {
            const id = this.getItemId(item);
            if (!used.has(id)) restored.push(item);
        });

        filtered = restored;

        if (this._restoredCurrentItemId) {
            const restoredIndex = filtered.findIndex(item => this.getItemId(item) === this._restoredCurrentItemId);
            if (restoredIndex !== -1) this.state.currentIndex = restoredIndex;
        }

        this._restoredActiveListOrder = null;
        this._restoredCurrentItemId = '';
        this._restoredFilterKey = '';
    }

    this.state.activeList = filtered;
    
    // 🌟 FIX: Only reset progress if preserveState is false
    if (!preserveState) {
        this.state.isFinished = false;
        this.state.currentIndex = 0;
        this.state.sessionMistakes = []; 
        this.state.isFlipped = false;
        this.state.isStudyBreakdownOpen = false;
    } else {
        // Ensure index doesn't accidentally point past the end of the list
        if (this.state.currentIndex >= this.state.activeList.length) {
            this.state.currentIndex = Math.max(0, this.state.activeList.length - 1);
        }
    }
    
    this.state.quizStats = { correct: 0, total: filtered.length };
    this.state.builderTokens = [];
    this.state.builderAnswer = [];
    this.preloadUpcomingChars();
  },

  cycleSeparateMode() {
      this.state.separateMode = this.state.separateMode === 'off' ? 'all' : 'off';
      this.state.modeCache = {};
      this.saveSettings();
      this.updateActiveList();
      if (typeof UI !== 'undefined') {
          UI.render();
          UI.showToast(`Split characters ${this.state.separateMode === 'off' ? 'off' : 'on'}`);
      }
  },

  clearReviewList() {
      this.state.learnedItems.clear();
      this.saveLearned();
      this.state.sessionMistakes = [];
      this.state.modeCache = {}; // Clear caches so lists rebuild cleanly
      this.saveSettings();
      this.updateActiveList();
      if (typeof UI !== 'undefined') { UI.render(); UI.showToast("Review list reset", { variant: 'strong', duration: 1800 }); }
  },

  animateAndRender(direction) {
      const skipAnimationModes = ['writing', 'list', 'sentences']; 
      if (skipAnimationModes.includes(this.state.mode)) {
          if (this.state.mode === 'sentences') {
              const carousel = document.getElementById('readerCarousel');
              if (carousel) {
                  const node = carousel.querySelector(`[data-reader-index="${this.state.currentIndex}"]`);
                  if (node) {
                      const top = node.offsetTop - (carousel.clientHeight / 2) + (node.offsetHeight / 2);
                      carousel.scrollTo({ top, behavior: 'smooth' });
                      carousel.querySelectorAll('.reader-entry').forEach(n => {
                          const isCurrent = Number(n.dataset.readerIndex) === this.state.currentIndex;
                          n.classList.toggle('is-current', isCurrent);
                          if (isCurrent) n.setAttribute('aria-current', 'true');
                          else n.removeAttribute('aria-current');
                      });
                      return;
                  }
              }
          }
          return UI.render();
      }
      if (this.state.skipSwipeAnimationOnce) {
          this.state.skipSwipeAnimationOnce = false;
          return UI.render();
      }

      // Inject the smooth pop animation styles if they don't exist
      if (!document.getElementById('fast-pop-styles')) {
          const style = document.createElement('style');
          style.id = 'fast-pop-styles';
          style.innerHTML = `
              .pop-in-next { animation: fastPopNext 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
              .pop-in-prev { animation: fastPopPrev 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
              @keyframes fastPopNext { 0% { opacity: 0; transform: scale(0.92) translateX(15px); } 100% { opacity: 1; transform: scale(1) translateX(0); } }
              @keyframes fastPopPrev { 0% { opacity: 0; transform: scale(0.92) translateX(-15px); } 100% { opacity: 1; transform: scale(1) translateX(0); } }
          `;
          document.head.appendChild(style);
      }

      const container = document.getElementById('mainContainer');
      
      // 🌟 ULTIMATE LOCK
      document.documentElement.classList.add('is-animating');

      // Render instantly without the 200ms artificial animation delay
      UI.render(); 
      
      const newWrapper = container ? container.firstElementChild : null;
      if (newWrapper) {
          // REMOVE ALL previous animation classes so the browser re-triggers the animation
          newWrapper.classList.remove('fade-in', 'pop-in-next', 'pop-in-prev', 'view-enter-right', 'view-enter-left');
          void newWrapper.offsetWidth; 
          newWrapper.classList.add(direction === 'next' ? 'pop-in-next' : 'pop-in-prev');
      }
      
      // Release lock extremely fast to allow rapid tapping
      setTimeout(() => {
          document.documentElement.classList.remove('is-animating');
      }, 150);
  },

  markLearned(isLearned) {
    const item = this.state.activeList[this.state.currentIndex];
    if (!item) return;
    const id = item.id || item.hanzi || item.zh;
    if (!id) return;

    // Play the audio for the card as you swipe it
    this.speakCurrent();

    if (isLearned) {
        this.state.learnedItems.add(id);
    } else {
        this.state.learnedItems.delete(id);
    }
    this.showSwipeFeedback(isLearned);
    this.saveLearned();

    const alreadySwiped = this.state.skipSwipeAnimationOnce;
    if (alreadySwiped) {
        const currentItem = this.state.activeList?.[this.state.currentIndex];
      if (!currentItem) return;
      const currentItem = this.state.activeList?.[this.state.currentIndex];
      if (!currentItem) return;
      this.next(false);
        return;
    }

    if (this.state.mode === 'study') {
        const cardContainer = document.querySelector('.study-card-container .card-container');
        if (cardContainer) {
            const dir = isLearned ? 1 : -1;
            const maxDrag = Math.min(Math.max(window.innerWidth * 0.35, 120), 200);
            const throwX = dir * (maxDrag + 40);
            const throwRot = dir * 6;

            cardContainer.classList.remove('swipe-dragging');
            cardContainer.classList.add('swipe-throw');
            cardContainer.style.willChange = 'transform, opacity';
            cardContainer.style.transform = `translate3d(${throwX}px, 0, 0) rotate(${throwRot}deg)`;
            cardContainer.style.opacity = '0';

            this.state.skipSwipeAnimationOnce = true;
            this.state.skipFadeInOnce = true;

            clearTimeout(this._markLearnedAnimTimer);
            this._markLearnedAnimTimer = setTimeout(() => this.next(false), 80);
            return;
        }
    }

    this.next(false);
  },

  showSwipeFeedback(isLearned) {
    if (this.state.mode !== 'study') return;
    let popup = document.getElementById('learnedPopup');
    if (!popup) {
        popup = document.createElement('div');
        popup.id = 'learnedPopup';
        popup.className = 'learned-popup-floating';
        document.body.appendChild(popup);
    }

    popup.innerHTML = isLearned
        ? '<span class="learned-popup-icon" aria-hidden="true">✓</span><span class="learned-popup-label">Learned</span>'
        : '<span class="learned-popup-icon" aria-hidden="true">↺</span><span class="learned-popup-label">Not learned</span>';
    popup.classList.toggle('is-learned', isLearned);
    popup.classList.toggle('is-unlearned', !isLearned);

    const studyCard = document.querySelector('.study-card-container .card');
    if (studyCard) {
        const rect = studyCard.getBoundingClientRect();
        popup.style.left = `${Math.round(rect.right - 8)}px`;
        popup.style.top = `${Math.max(10, Math.round(rect.top - 8))}px`;
        popup.style.bottom = 'auto';
    } else {
        popup.style.left = 'calc(100% - 28px)';
        popup.style.top = '68px';
        popup.style.bottom = 'auto';
    }

    popup.classList.remove('show');
    void popup.offsetWidth;
    popup.classList.add('show');

    clearTimeout(this._swipeFeedbackTimer);
    this._swipeFeedbackTimer = setTimeout(() => {
        popup.classList.remove('show');
    }, 520);
  },

  reviewMistakes() {
      if (!this.state.sessionMistakes || this.state.sessionMistakes.length === 0) return;
      
      const mistakeItems = this.state.activeList.filter(item => {
          const key = item.hanzi || item.zh;
          return this.state.sessionMistakes.includes(key);
      });
      
      if (mistakeItems.length > 0) {
          this.state.activeList = mistakeItems;
          this.state.currentIndex = 0;
          this.state.isFlipped = false;
          this.state.isStudyBreakdownOpen = false;
          this.state.isFinished = false;
          this.state.streak = 0;
          this.state.sessionMistakes = [];
          UI.render();
      }
  },

  next(autoLearn = false) {
    // Safety check: ensure autoLearn is boolean. 
    // If passed from an event handler, it might be an Event object (truthy).
    if (typeof autoLearn !== 'boolean') autoLearn = false;

    if(this.state.activeList.length === 0) return;
    
    if (autoLearn) {
        const item = this.state.activeList[this.state.currentIndex];
        if (item) {
            const id = item.id || item.hanzi || item.zh;
            if (id) {
                this.state.learnedItems.add(id);
                this.saveLearned();
            }
        }
    }

    const nextIndex = this.state.currentIndex + 1;
    if (nextIndex >= this.state.activeList.length) {
        this.state.isFinished = true;
        this.saveSettings();
        
        if (this.state.mode === 'study' && this.state.autoPlay) {
            this.stopAutoPlay();
            this.renderSessionComplete();
            clearTimeout(this._autoRestartTimer);
            this._autoRestartTimer = setTimeout(() => {
                this.restartSession();
                this.startAutoPlay();
            }, 900);
        } else {
            this.renderSessionComplete();
        }
        return;
    } else {
        this.state.currentIndex = nextIndex;
    }
    this.saveSettings();
    this.state.isFlipped = false;
    this.state.isStudyBreakdownOpen = false;
    this.state.readExpandedIndex = null;
    this.state.skipFlipAnimationOnce = true;
    this.state.builderTokens = [];
    this.state.builderAnswer = [];
    setTimeout(() => this.preloadUpcomingChars(), 280);
    this.animateAndRender('next'); 
  },

  jumpToIndex(index, options = {}) {
    if (!this.state.activeList.length) return;

    const targetIndex = Math.max(0, Math.min(index, this.state.activeList.length - 1));
    if (targetIndex === this.state.currentIndex) return;

    const openReader = !!options.openReader;
    const direction = targetIndex > this.state.currentIndex ? 'next' : 'prev';
    this.state.currentIndex = targetIndex;
    this.state.isFlipped = false;
    this.state.isStudyBreakdownOpen = false;
    this.state.readExpandedIndex = openReader ? targetIndex : null;
    this.state.skipFlipAnimationOnce = true;
    this.state.builderTokens = [];
    this.state.builderAnswer = [];
    this.saveSettings();
    setTimeout(() => this.preloadUpcomingChars(), 280);
    this.animateAndRender(direction);
  },

  toggleReaderEntry(index) {
    if (!this.state.activeList.length) return;

    const targetIndex = Math.max(0, Math.min(index, this.state.activeList.length - 1));
    if (targetIndex !== this.state.currentIndex) {
      this.jumpToIndex(targetIndex, { openReader: true });
      return;
    }

    const nextOpen = this.state.readExpandedIndex === targetIndex ? null : targetIndex;
    this.state.readExpandedIndex = nextOpen;
    const entry = document.querySelector(`.reader-entry[data-reader-index="${targetIndex}"]`);
    if (entry) {
      entry.classList.toggle('is-open', nextOpen === targetIndex);
      entry.setAttribute('aria-expanded', nextOpen === targetIndex ? 'true' : 'false');
    } else if (typeof UI !== 'undefined') {
      UI.render();
    }
  },

  renderSessionComplete() {
      const container = document.getElementById('mainContainer');
      const isGame = ['quiz', 'quiz-mc', 'listening', 'writing', 'builder'].includes(this.state.mode);
      
      let message = "Keep it up!";
      let actionHtml = '';
      let statsHtml = '';
      let percent = 100;

      if (isGame) {
          const mistakes = this.state.sessionMistakes.length;
          const total = this.state.activeList.length;
          const correctCount = Math.max(0, total - mistakes);
          percent = total > 0 ? Math.round((correctCount / total) * 100) : 100;
          
          if (percent === 100) message = "Perfect Score!";
          else if (percent >= 80) message = "Great Job!";
          else message = "Good Practice!";
          
          statsHtml = `
            <div class="sc-stat-card sc-anim-stat1">
                <div class="sc-stat-num">${correctCount}</div>
                <div class="sc-stat-label">Correct</div>
            </div>
            <div class="sc-stat-card sc-anim-stat2">
                <div class="sc-stat-num">${mistakes}</div>
                <div class="sc-stat-label">Mistakes</div>
            </div>
          `;
          
          if (mistakes > 0) {
              actionHtml = `
                <button class="btn-main sc-btn sc-btn-primary" onclick="App.reviewMistakes()">
                    Review ${mistakes} Mistakes
                </button>
                <button class="btn-sec sc-btn sc-btn-secondary" onclick="App.skipMistakesReview()">
                    Skip Review
                </button>
                <button class="btn-sec sc-btn sc-btn-secondary" onclick="App.restartSession()">
                    Start Over
                </button>
              `;
          } else {
              actionHtml = `
                <button class="btn-main sc-btn sc-btn-primary" onclick="App.restartSession()">
                    Start Over
                </button>
              `;
          }
      } else {
          const unlearned = this.state.activeList.filter(i => {
              const id = i.id || i.hanzi || i.zh;
              return !this.state.learnedItems.has(id);
          });
          const total = this.state.activeList.length;
          const learnedCount = total - unlearned.length;
          percent = total > 0 ? Math.round((learnedCount / total) * 100) : 0;
          
          if (percent === 100) message = "Perfect Mastery!";
          else if (percent >= 80) message = "Almost There!";
          else if (percent >= 50) message = "Good Progress!";
          
          statsHtml = `
            <div class="sc-stat-card sc-anim-stat1">
                <div class="sc-stat-num">${learnedCount}</div>
                <div class="sc-stat-label">Learned</div>
            </div>
            <div class="sc-stat-card sc-anim-stat2">
                <div class="sc-stat-num">${unlearned.length}</div>
                <div class="sc-stat-label">To Review</div>
            </div>
          `;
          
          if (unlearned.length > 0) {
              actionHtml = `
                <button class="btn-main sc-btn sc-btn-primary" onclick="App.startReview(${unlearned.length})">
                    Review ${unlearned.length} Remaining
                </button>
                <button class="btn-sec sc-btn sc-btn-secondary" onclick="App.skipReview()">
                    Skip Review
                </button>
                <button class="btn-sec sc-btn sc-btn-secondary" onclick="App.restartSession()">
                    Start Over
                </button>
              `;
          } else {
              actionHtml = `
                <button class="btn-main sc-btn sc-btn-primary" onclick="App.restartSession()">
                    Start New Session
                </button>
              `;
          }
      }
      
      if (!document.getElementById('session-complete-styles')) {
          const style = document.createElement('style');
          style.id = 'session-complete-styles';
          style.innerHTML = `
            .sc-wrapper{height:100%;width:100%;display:flex;align-items:center;justify-content:center;padding:20px 16px 28px;box-sizing:border-box;overflow:hidden}
            .sc-panel{width:min(100%,500px);max-height:min(100%,calc(100svh - 48px));margin:auto;background:linear-gradient(180deg,rgba(255,252,253,.92),rgba(255,255,255,.86));border:1px solid rgba(255,255,255,.7);border-radius:30px;box-shadow:0 10px 24px rgba(216,180,193,.12),0 4px 10px rgba(148,163,184,.07);padding:20px 18px 16px;position:relative;overflow:hidden;display:flex;flex-direction:column;justify-content:center;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
            .sc-panel:before{content:'';position:absolute;inset:auto -10% 80% -10%;height:110px;background:radial-gradient(circle at top,rgba(255,238,244,.62),rgba(255,255,255,0) 72%);pointer-events:none}
            .sc-header{position:relative;text-align:center;animation:slideDownFade .45s cubic-bezier(.16,1,.3,1) both;margin-bottom:14px}
            .sc-kicker{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;background:rgba(248,250,252,.86);color:#a295a5;font-size:.68rem;font-weight:800;letter-spacing:1px;text-transform:uppercase;margin-bottom:10px;border:1px solid rgba(226,232,240,.8)}
            .sc-kicker-dot{width:7px;height:7px;border-radius:999px;background:linear-gradient(135deg,#f6b7c9,#e9c4d6);box-shadow:0 0 0 4px rgba(246,183,201,.12)}
            .sc-header h2{margin:0;color:#7c6f7f;font-size:clamp(1.4rem,4.8vw,1.85rem);font-weight:800;letter-spacing:-.03em}
            .sc-header p{margin:6px auto 0;max-width:280px;color:#978a98;font-size:.93rem;font-weight:700;line-height:1.42}
            .sc-ring-row{display:flex;justify-content:center;animation:scaleInFade .6s cubic-bezier(.34,1.56,.64,1) .05s both;margin-bottom:14px}
            .sc-ring-wrapper{position:relative;width:120px;height:120px;flex-shrink:0}
            .sc-ring-glass{position:absolute;inset:0;border-radius:50%;background:linear-gradient(180deg,rgba(255,255,255,.8),rgba(249,247,250,.88));box-shadow:inset 0 1px 4px rgba(255,255,255,.7),0 8px 16px rgba(216,180,193,.09)}
            .sc-ring-svg{position:relative;width:100%;height:100%;transform:rotate(-90deg);z-index:2}
            .progress-ring-mastery{transition:stroke-dashoffset 1s cubic-bezier(.16,1,.3,1) .2s}
            .sc-ring-content{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:3}
            .sc-percent{font-size:1.95rem;font-weight:800;color:#7c6f7f;line-height:.9}
            .sc-percent span{font-size:.9rem;color:#b1a5b2;vertical-align:super;font-weight:700}
            .sc-stats-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;width:100%;margin-bottom:14px;animation:slideUpFade .45s cubic-bezier(.16,1,.3,1) .12s both}
            .sc-stat-card{background:rgba(255,255,255,.72);border:1px solid rgba(232,236,241,.95);border-radius:18px;padding:11px 10px;text-align:center;box-shadow:0 2px 8px rgba(148,163,184,.05)}
            .sc-stat-num{font-size:1.4rem;font-weight:800;color:#7c6f7f;line-height:1;margin-bottom:4px}
            .sc-stat-label{font-size:.67rem;color:#b1a5b2;font-weight:800;text-transform:uppercase;letter-spacing:.9px}
            .sc-actions{width:100%;display:flex;flex-direction:column;gap:10px;animation:slideUpFade .45s cubic-bezier(.16,1,.3,1) .18s both}
            .sc-btn{width:100%;padding:13px 18px;font-size:.92rem;font-weight:800;letter-spacing:.01em;line-height:1.2;border-radius:18px;cursor:pointer;font-family:'Nunito',system-ui,sans-serif;box-shadow:none;transition:background-color .18s ease,border-color .18s ease,color .18s ease,transform .18s ease}
            .sc-btn-primary{background:rgba(255,255,255,.76);color:#7f7481;border:1px solid rgba(232,197,210,.9)}
            .sc-btn-primary:hover{transform:translateY(-1px);background:rgba(255,255,255,.9);border-color:rgba(223,179,195,.95);color:#756877}
            .sc-btn-secondary{background:rgba(248,250,252,.7);color:#938795;border:1px solid rgba(226,232,240,.96)}
            .sc-btn-secondary:hover{transform:translateY(-1px);background:rgba(255,255,255,.84);border-color:rgba(203,213,225,.98);color:#7d7280}
            @media(min-width:768px){.sc-panel{padding:22px 22px 18px}.sc-header p{max-width:320px}.sc-ring-wrapper{width:132px;height:132px}.sc-stats-grid{gap:12px}.sc-stat-card{padding:12px 10px}}
            @media(max-height:760px){.sc-wrapper{padding:14px 14px 20px}.sc-panel{border-radius:26px;padding:16px 16px 14px}.sc-header{margin-bottom:12px}.sc-kicker{margin-bottom:8px}.sc-header h2{font-size:clamp(1.25rem,4.5vw,1.6rem)}.sc-header p{font-size:.88rem}.sc-ring-row{margin-bottom:12px}.sc-ring-wrapper{width:102px;height:102px}.sc-percent{font-size:1.7rem}.sc-percent span{font-size:.8rem}.sc-stats-grid{margin-bottom:12px;gap:8px}.sc-stat-card{padding:9px 8px}.sc-stat-num{font-size:1.2rem}.sc-stat-label{font-size:.62rem}.sc-actions{gap:8px}.sc-btn{padding:11px 16px;font-size:.88rem}}
            @keyframes slideDownFade{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}
            @keyframes slideUpFade{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
            @keyframes scaleInFade{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:scale(1)}}
          `;
          document.head.appendChild(style);
      }

      const html = `
        <div class="sc-wrapper">
            <div class="sc-panel">
                <div class="sc-header">
                    <div class="sc-kicker"><span class="sc-kicker-dot"></span><span>Session Complete</span></div>
                    <h2>${isGame ? 'Nice work' : 'Study complete'}</h2>
                    <p>${message}</p>
                </div>

                <div class="sc-ring-row">
                    <div class="sc-ring-wrapper">
                        <div class="sc-ring-glass"></div>
                        <svg viewBox="0 0 100 100" class="sc-ring-svg" aria-hidden="true">
                            <circle cx="50" cy="50" r="42" fill="none" stroke="#f1f5f9" stroke-width="7"></circle>
                            <circle class="progress-ring-mastery" cx="50" cy="50" r="42" fill="none" stroke="var(--primary)" stroke-width="7" stroke-linecap="round" stroke-dasharray="263.89" stroke-dashoffset="263.89"></circle>
                        </svg>
                        <div class="sc-ring-content">
                            <div class="sc-percent">${percent}<span>%</span></div>
                        </div>
                    </div>
                </div>

                <div class="sc-stats-grid">
                    ${statsHtml}
                </div>

                <div class="sc-actions">
                    ${actionHtml}
                </div>
            </div>
        </div>
      `;
      
      container.innerHTML = html;
      
      // -- Animate the progress ring --
      setTimeout(() => {
          const ring = container.querySelector('.progress-ring-mastery');
          if (ring) {
              const ringLength = 263.89; // 2 * PI * 42 (radius)
              const targetOffset = ringLength * (1 - (percent / 100));
              ring.style.strokeDashoffset = targetOffset;
          }
      }, 50);

      // Stay on stats screen until the user chooses an action.
  },

  startReview(count) {
      const unlearned = this.state.activeList.filter(i => {
          const id = i.id || i.hanzi || i.zh;
          return !this.state.learnedItems.has(id);
      });
      this.state.activeList = unlearned;
      this.state.currentIndex = 0;
      this.state.isFlipped = false;
      this.state.isStudyBreakdownOpen = false;
      this.state.readExpandedIndex = null;
      this.state.isFinished = false; // FIX: Ensure finished state is reset
      this.state.streak = 0; // FIX: Reset streak for the review
      UI.render();
      UI.showToast(`Reviewing ${count} items`);
  },

  skipReview() {
      this.state.activeList.forEach(i => {
          const id = i.id || i.hanzi || i.zh;
          if (id) this.state.learnedItems.add(id);
      });
      this.saveLearned();
      this.restartSession();
      if (typeof UI !== 'undefined' && UI.showToast) UI.showToast("Review skipped", { variant: 'strong', duration: 1800 });
  },

  skipMistakesReview() {
      this.state.sessionMistakes = [];
      this.saveSettings();
      this.restartSession();
      if (typeof UI !== 'undefined' && UI.showToast) UI.showToast("Review skipped", { variant: 'strong', duration: 1800 });
  },

  restartSession() {
      // FIX: Grab the full dataset so we unlearn everything in the current filter,
      // not just the shrunk down activeList.
      const isSentencesSource = ['sentences', 'builder'].includes(this.state.mode) ||
                                (['quiz', 'quiz-mc'].includes(this.state.mode) && this.state.quizType === 'translate');
      const source = isSentencesSource ? DATA.SENTENCES : DATA.VOCAB;

      const filteredSource = this._getFilteredItems(source);

      // ONLY unlearn items if we are in study mode! Quiz mode should just restart the list.
      if (this.state.mode === 'study') {
          filteredSource.forEach(item => {
              const id = item.id || item.hanzi || item.zh;
              if (id) this.state.learnedItems.delete(id);
          });
          this.saveLearned();
      }

      // Hard reset all session trackers
      this.state.streak = 0;
      this.state.isFinished = false;
      this.saveSettings();
      
      this.updateActiveList();
      this.state.currentIndex = 0;
      this.state.isFlipped = false;
      this.state.isStudyBreakdownOpen = false;
      this.state.readExpandedIndex = null;
      
      UI.render();
      UI.showToast("Session restarted");
  },

  prev() {
    if(this.state.activeList.length === 0) return;
    this.state.currentIndex = (this.state.currentIndex - 1 + this.state.activeList.length) % this.state.activeList.length;
    this.state.isFlipped = false;
    this.state.isStudyBreakdownOpen = false;
    this.state.readExpandedIndex = null;
    this.state.skipFlipAnimationOnce = true;
    this.state.builderTokens = [];
    this.state.builderAnswer = [];
    setTimeout(() => this.preloadUpcomingChars(), 280);
    this.animateAndRender('prev'); 
  },

  toggleFlip(suppressSpeak = false) {
    // Prevent ghost clicks after swiping from accidentally toggling the flip state
    if (this._lastSwipeTime && Date.now() - this._lastSwipeTime < 600) return;
    
    this.state.isFlipped = !this.state.isFlipped;
    if (!this.state.isFlipped) this.state.isStudyBreakdownOpen = false;
    if(this.state.isFlipped && !suppressSpeak) {
        this.speakCurrent();
    }
    UI.updateFlipState();
  },

  cleanDefinitionForTTS(defText) {
      let cleaned = this.sanitizeDefinition(defText);
      if (!cleaned) return '';
      cleaned = cleaned.replace(/\b(?:m|mw|measure word)\s*[:：]\s*[^;|/,\uFF0C\uFF1B]+/gi, '');
      cleaned = cleaned.replace(/\b(measure word|mw)\b\s*[:：]?\s*/gi, '');
      cleaned = cleaned.replace(/\s{2,}/g, ' ').replace(/^[,;/\s]+|[,;/\s]+$/g, '');
      return cleaned.trim();
  },

  releaseVolatileResources({ aggressive = false } = {}) {
      if (window.speechSynthesis) window.speechSynthesis.cancel();

      if (typeof UI !== 'undefined' && UI._currentWriter) {
          try { UI._currentWriter.cancelQuiz(); } catch (e) {}
          try { if (typeof UI._currentWriter.destroy === 'function') UI._currentWriter.destroy(); } catch (e) {}
          UI._currentWriter = null;
      }

      if (this.state.currentWriter) {
          try { this.state.currentWriter.cancelQuiz(); } catch (e) {}
          try { if (typeof this.state.currentWriter.destroy === 'function') this.state.currentWriter.destroy(); } catch (e) {}
          this.state.currentWriter = null;
      }

      if (aggressive) {
          if (Utils._hzCache?.clear) Utils._hzCache.clear();
          if (typeof UI !== 'undefined' && UI._exampleCache?.clear) UI._exampleCache.clear();
      }
  },

  async requestWakeLock() {
      if ('wakeLock' in navigator) {
          try {
              this._wakeLock = await navigator.wakeLock.request('screen');
          } catch (err) {
              console.log('Wake lock failed:', err);
          }
      }
  },

  releaseWakeLock() {
      if (this._wakeLock) {
          this._wakeLock.release().then(() => { this._wakeLock = null; }).catch(() => {});
      }
  },

  startAutoPlay() {
      if (this.state.autoPlay) return;
      this.state.autoPlay = true;
      this._autoPlayToken = (this._autoPlayToken || 0) + 1;
      this._autoPlayJustStarted = true;
      this.saveSettings();
      this.requestWakeLock();
      this.runAutoPlayStep();
  },

  stopAutoPlay() {
      if (!this.state.autoPlay) return;
      this.state.autoPlay = false;
      this._autoPlayToken = (this._autoPlayToken || 0) + 1;
      if (this._autoPlayTimer) {
          clearTimeout(this._autoPlayTimer);
          this._autoPlayTimer = null;
      }
      if (this._autoRestartTimer) {
          clearTimeout(this._autoRestartTimer);
          this._autoRestartTimer = null;
      }
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      this.saveSettings();
      this.releaseWakeLock();
  },

  async runAutoPlayStep() {
      if (!this.state.autoPlay) return;
      if (!['study', 'sentences'].includes(this.state.mode)) {
          this.stopAutoPlay();
          return;
      }
      if (this.state.isFinished) {
          this.stopAutoPlay();
          return;
      }

      if (this.state.mode === 'study' && !this.state.isFlipped) this.toggleFlip(true);

      const token = this._autoPlayToken || 0;
      const checkToken = () => this.state.autoPlay && token === this._autoPlayToken;
      const currentIndex = this.state.currentIndex;

      // Give the card a moment to settle before reading starts
      await new Promise(r => setTimeout(r, 600));
      if (!checkToken()) return;

      const resolveCurrentItem = () => this.state.activeList[currentIndex];

      const syncSentenceCard = (sentenceItem) => {
          if (this.state.mode !== 'sentences' || !sentenceItem) return;
          if (this.state.readExpandedIndex !== currentIndex) {
              this.state.readExpandedIndex = currentIndex;
          }

          const carousel = document.getElementById('readerCarousel');
          if (!carousel) return;

          const node = carousel.querySelector(`[data-reader-index="${currentIndex}"]`);
          if (!node) return;

          if (!node.classList.contains('is-open')) {
              node.classList.add('is-open');
              node.setAttribute('aria-expanded', 'true');
          }

          if (node.dataset.readerPending === 'true') {
              sentenceItem._zhHTML = sentenceItem._zhHTML || (window.Utils && typeof window.Utils.createInteractiveSentence === 'function'
                ? window.Utils.createInteractiveSentence(sentenceItem.zh)
                : sentenceItem.zh);
              const sentenceNode = node.querySelector('.reader-entry-sentence');
              if (sentenceNode) sentenceNode.innerHTML = sentenceItem._zhHTML;
              node.removeAttribute('data-reader-pending');
          }
      };

      const item = resolveCurrentItem();
      if (!item) return;

      if (this.state.mode === 'sentences') {
          syncSentenceCard(item);
      }

      const currentItem = () => resolveCurrentItem();

      if (this.state.ttsReadWord) {
          const wordItem = currentItem();
          const text = wordItem?.hanzi || wordItem?.zh || '';
          if (text) {
              await this.speakText(text, 'zh-TW');
          }
          if (!checkToken()) return;
          await new Promise(r => setTimeout(r, this.state.ttsItemInterval * 1000));
          if (!checkToken()) return;
      }

      if (this.state.ttsReadMeaning) {
          const meaningItem = currentItem();
          const rawDef = meaningItem?.def || meaningItem?.en || '';
          const defText = this.cleanDefinitionForTTS(rawDef);
          if (defText) {
              await this.speakText(defText, 'en-US');
              if (!checkToken()) return;
              await new Promise(r => setTimeout(r, this.state.ttsItemInterval * 1000));
              if (!checkToken()) return;
          }
      }

      if (this.state.mode === 'sentences') {
          const sentenceItem = currentItem();
          if (sentenceItem?.zh && this.state.ttsReadExample) {
              await this.speakText(sentenceItem.zh, 'zh-TW');
              if (!checkToken()) return;
              await new Promise(r => setTimeout(r, this.state.ttsItemInterval * 1000));
              if (!checkToken()) return;
          }

          if (sentenceItem?.en && this.state.ttsReadExampleEn) {
              await this.speakText(sentenceItem.en, 'en-US');
              if (!checkToken()) return;
              await new Promise(r => setTimeout(r, this.state.ttsItemInterval * 1000));
              if (!checkToken()) return;
          }
      } else {
          const item = currentItem();
          if (this.state.ttsReadExample && !item.zh) {
              const exNode = document.querySelector('.example-item .example-zh') || document.querySelector('.smart-example-item .example-zh');
              if (exNode && exNode.textContent) {
                  await this.speakText(exNode.textContent, 'zh-TW');
                  if (!checkToken()) return;
                  await new Promise(r => setTimeout(r, this.state.ttsItemInterval * 1000));
                  if (!checkToken()) return;
              }
          }
          
          if (this.state.ttsReadExampleEn && !item.zh) {
              const exEnNode = document.querySelector('.example-item.is-primary .example-en') || document.querySelector('.example-item .example-en') || document.querySelector('.smart-example-item .example-en');
              if (exEnNode && exEnNode.textContent) {
                  await this.speakText(exEnNode.textContent, 'en-US');
                  if (!checkToken()) return;
                  await new Promise(r => setTimeout(r, this.state.ttsItemInterval * 1000));
                  if (!checkToken()) return;
              }
          }
      }

      // Final pause before jumping to the next card
      await new Promise(r => setTimeout(r, this.state.ttsCardInterval * 1000));
      if (!checkToken()) return;

      const currentItem = this.state.activeList?.[this.state.currentIndex];
      if (!currentItem) return;
      this.next(false);
      this._autoPlayTimer = setTimeout(() => this.runAutoPlayStep(), 50);
  },

  speakCurrent() {
    const item = this.state.activeList[this.state.currentIndex];
    if(!item) return;

    const card = document.querySelector('.card');
    const isShowingExample = card && card.classList.contains('showing-example');
    
    if (isShowingExample && this.state.currentExample) {
        this.speakText(this.state.currentExample.zh);
    } else {
        // Always use speakText (TTS) to ensure consistent performance and avoid network lag from audio files
        this.speakText(item.hanzi || item.zh);
    }
  },

  speakText(text, lang = 'zh-TW', options = {}) {
      return new Promise(resolve => {
          if (!text || !window.speechSynthesis) return resolve();
          window.speechSynthesis.cancel();

          const u = new SpeechSynthesisUtterance(text);
          const voiceOptions = {
            ...options,
            context: this.getTtsPriorityContext(options)
          };
          const baseRate = lang.startsWith('en') ? 1.0 : Math.max(this.state.ttsRate, 0.75);
          const requestedRate = typeof options.rate === 'number'
            ? options.rate
            : typeof options.rateMultiplier === 'number'
              ? baseRate * options.rateMultiplier
              : baseRate;
          u.rate = Math.max(0.55, Math.min(1.15, requestedRate)); // Prevent glitching Natural voices
          u.lang = lang;
          
          if (lang.startsWith('zh')) {
              this.ensureCachedVoice(voiceOptions);
              if (this._cachedVoice) u.voice = this._cachedVoice;
          } else if (lang.startsWith('en')) {
              this.ensureEnglishVoice(voiceOptions);
              if (this._cachedEnVoice) u.voice = this._cachedEnVoice;
          }
          
          window._tts_utterances = window._tts_utterances || [];
          window._tts_utterances.push(u);
          const cleanup = () => { 
              window._tts_utterances = window._tts_utterances.filter(x => x !== u); 
          };
          u.onend = () => { cleanup(); resolve(); };
          u.onerror = () => { cleanup(); resolve(); };
          
          // Slight delay ensures the 3D flip animation starts BEFORE the audio engine hogs the CPU
          setTimeout(() => window.speechSynthesis.speak(u), 50);
      });
  },

  ensureCachedVoice(options = {}) {
      if (!window.speechSynthesis) return;
      const cacheKey = this.getVoiceSelectionKey('zh-TW', options);
      if (this._cachedVoice && this._cachedVoiceKey === cacheKey) return;

      const voices = window.speechSynthesis.getVoices();
      const zhVoices = voices.filter(v => v.lang.toLowerCase().includes('zh'));
      const prioritizeEdge = this.shouldPrioritizeEdgeVoice(options);

      if (this.state.ttsVoiceZh && !prioritizeEdge) {
          const userVoice = zhVoices.find(v => v.name === this.state.ttsVoiceZh);
          if (userVoice) {
              this._cachedVoice = userVoice;
              this._cachedVoiceKey = cacheKey;
              return;
          }
      }

      if (zhVoices.length > 0) {
          this._cachedVoice =
              (prioritizeEdge
                ? zhVoices.find(v => /microsoft/i.test(v.name) && /natural/i.test(v.name) && /yunjhe|hsiaochen|tw|taiwan|hant/i.test(`${v.name} ${v.lang}`))
                  || zhVoices.find(v => /microsoft/i.test(v.name) && /natural/i.test(v.name))
                  || zhVoices.find(v => /natural/i.test(v.name) && /tw|taiwan|hant/i.test(`${v.name} ${v.lang}`))
                : null) ||
              zhVoices.find(v => v.name.includes('YunJhe') && v.name.includes('Natural')) ||
              zhVoices.find(v => v.name.includes('HsiaoChen') && v.name.includes('Natural')) ||
              zhVoices.find(v => v.name.includes('Natural') && (v.lang.includes('TW') || v.name.includes('Taiwan'))) ||
              zhVoices.find(v => (v.name.includes('Siri') || v.name.includes('Apple') || v.name.includes('Google')) && (v.lang.includes('TW') || v.name.includes('Taiwan'))) ||
              zhVoices.find(v => v.lang.includes('TW') || v.lang.includes('Hant') || v.name.includes('Taiwan')) ||
              zhVoices[0];
          this._cachedVoiceKey = cacheKey;
      }
  },

  ensureEnglishVoice(options = {}) {
      if (!window.speechSynthesis) return;
      const cacheKey = this.getVoiceSelectionKey('en-US', options);
      if (this._cachedEnVoice && this._cachedEnVoiceKey === cacheKey) return;

      const voices = window.speechSynthesis.getVoices();
      const enVoices = voices.filter(v => v.lang.toLowerCase().replace('_', '-').includes('en'));
      const prioritizeEdge = this.shouldPrioritizeEdgeVoice(options);

      if (this.state.ttsVoiceEn && !prioritizeEdge) {
          const userVoice = enVoices.find(v => v.name === this.state.ttsVoiceEn);
          if (userVoice) {
              this._cachedEnVoice = userVoice;
              this._cachedEnVoiceKey = cacheKey;
              return;
          }
      }

      if (enVoices.length > 0) {
          this._cachedEnVoice = 
              (prioritizeEdge
                ? enVoices.find(v => /microsoft/i.test(v.name) && /natural/i.test(v.name) && /us|american/i.test(`${v.name} ${v.lang}`))
                  || enVoices.find(v => /microsoft/i.test(v.name) && /natural/i.test(v.name))
                  || enVoices.find(v => /natural/i.test(v.name) && /us|american/i.test(`${v.name} ${v.lang}`))
                : null) ||
              enVoices.find(v => v.name.includes('Natural') && (v.lang.includes('US') || v.name.includes('American'))) ||
              enVoices.find(v => v.name.includes('Natural')) ||
              // 2. Fallbacks
              enVoices.find(v => (v.lang.includes('US') || v.name.includes('US') || v.name.includes('American')) && (v.name.includes('Google') || v.name.includes('Microsoft') || v.name.includes('Siri'))) || 
              enVoices.find(v => v.lang.includes('US')) || enVoices[0];
          this._cachedEnVoiceKey = cacheKey;
      }
  },

  async copyCurrent(e) {
    if (e) e.stopPropagation();
    const item = this.state.activeList[this.state.currentIndex];
    if (!item) return;

    if (this.state.mode === 'list') {
      const text = this.getCopyTextForItem(item);
      if (!text) return;
      try { await Utils.copyToClipboard(text); UI.showCopyFeedback(); } catch (err) { console.error('Copy failed', err); }
      return;
    }

    const card = document.querySelector('.card');
    const isShowingExample = card && card.classList.contains('showing-example');
    let text = isShowingExample && this.state.currentExample ? this.state.currentExample.zh : (item.hanzi || item.zh || item.def || '').replace(/[()]/g, '').trim();
    if (!text) return;
    try { await Utils.copyToClipboard(text); UI.showCopyFeedback(); } catch (err) { console.error('Copy failed', err); }
  },

  getCopyTextForItem(item) {
    if (!item) return '';
    const chars = (item.hanzi || item.zh || '').replace(/[()]/g, '').trim();
    const meaning = this.sanitizeDefinition(item.def || item.en || item.meaning || item.definition || '').trim();
    return [chars, meaning].filter(Boolean).join(' - ');
  },

  toggleListSelectionMode(force) {
    const nextValue = typeof force === 'boolean' ? force : !this.state.listSelectionMode;
    this.state.listSelectionMode = nextValue;
    if (!nextValue) this.state.listSelectedIds = new Set();
    if (window.UI && typeof UI.render === 'function') UI.render();
  },

  toggleListItemSelection(itemOrId) {
    const id = typeof itemOrId === 'string' ? itemOrId : this.getItemId(itemOrId);
    if (!id) return;
    if (!(this.state.listSelectedIds instanceof Set)) this.state.listSelectedIds = new Set();
    if (this.state.listSelectedIds.has(id)) this.state.listSelectedIds.delete(id);
    else this.state.listSelectedIds.add(id);
    if (window.UI && typeof UI.render === 'function') UI.render();
  },

  getListCopyText(items = []) {
    return (items || [])
      .map(item => this.getCopyTextForItem(item))
      .filter(Boolean)
      .join('\n');
  },

  async copyVisibleListItems() {
    const text = this.getListCopyText(this.state.listVisibleItems || []);
    if (!text) return;
    try {
      await Utils.copyToClipboard(text);
      if (typeof UI !== 'undefined') UI.showToast(`Copied ${(this.state.listVisibleItems || []).length} items`);
    } catch (err) {
      console.error('Copy failed', err);
    }
  },

  async copySelectedListItems() {
    const selectedIds = this.state.listSelectedIds instanceof Set ? this.state.listSelectedIds : new Set();
    const items = (this.state.listVisibleItems || []).filter(item => selectedIds.has(this.getItemId(item)));
    const text = this.getListCopyText(items);
    if (!text) {
      if (typeof UI !== 'undefined') UI.showToast('No items selected');
      return;
    }
    try {
      await Utils.copyToClipboard(text);
      if (typeof UI !== 'undefined') UI.showToast(`Copied ${items.length} items`);
    } catch (err) {
      console.error('Copy failed', err);
    }
  },

  setupInteraction() {
      if (this._interactionsSetup) return;
      this._interactionsSetup = true;
      const persistSessionState = () => {
          if (this !== window.App) return;
          this.saveSettings();
      };

      // 🌟 FIX: Auto-save the exact millisecond the user switches apps or minimizes the browser
      document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'hidden') {
              persistSessionState();
              this.releaseVolatileResources({ aggressive: true });
              
              // Stop active background progress loops to prevent battery drain
              if (this._dialoguePlayerRuntime && this._dialoguePlayerRuntime.isPlaying) {
                  this.pauseDialoguePlayer({ persist: true, updateUI: false });
              }
          } else if (document.visibilityState === 'visible') {
              // Re-acquire the wake lock if returning to the app and autoplay is still running
              if (this.state.autoPlay) this.requestWakeLock();
              if (this.state.mode === 'writing' && typeof UI !== 'undefined') UI.render();
          }
      });
      window.addEventListener('pagehide', persistSessionState);
      window.addEventListener('beforeunload', persistSessionState);

      if (!document.getElementById('tap-ripple-styles')) {
          const style = document.createElement('style');
          style.id = 'tap-ripple-styles';
          style.innerHTML = `.tap-ripple{position:fixed;width:20px;height:20px;background:rgba(255, 158, 181, 0.12);border-radius:50%;transform:translate(-50%,-50%);pointer-events:none;animation:ripple-anim .4s ease-out forwards;z-index:9999}body.dark-mode .tap-ripple{background:rgba(255,255,255,0.15)}@keyframes ripple-anim{0%{width:10px;height:10px;opacity:.6}100%{width:200px;height:200px;opacity:0}}`;
          document.head.appendChild(style);
      }

      const container = document.getElementById('mainContainer');
      if (!container) return;

      let touchStartX = 0;
      let touchStartY = 0;
      let lastSwipeTime = 0;
      let swipeCard = null;
      let swipeContainer = null;
      let isSwiping = false;
      let swipeDx = 0;
      let isMouseDown = false;
      let prevUserSelect = '';
      let swipeCandidate = null;
      let prevBodyOverflowX = null;
      let swipeRaf = null;

      const ensureSwipeOverlays = (cardEl) => {
          if (!cardEl || cardEl.querySelector('.swipe-overlay')) return;
          const left = document.createElement('div');
          left.className = 'swipe-overlay swipe-left';
          const right = document.createElement('div');
          right.className = 'swipe-overlay swipe-right';
          cardEl.appendChild(left);
          cardEl.appendChild(right);
      };

      const getSwipeContainer = (cardEl) => cardEl.closest('.card-container') || cardEl;

      const doResetSwipe = (snapBack = false) => {
          if (swipeRaf) {
              cancelAnimationFrame(swipeRaf);
              swipeRaf = null;
          }
          if (swipeContainer) {
              if (snapBack) swipeContainer.classList.add('swipe-dragging');
              swipeContainer.classList.remove('swipe-throw', 'swipe-float');
              swipeContainer.style.transform = '';
              swipeContainer.style.opacity = '';
              swipeContainer.style.willChange = '';
              swipeContainer.classList.remove('swipe-dragging');
          }
          if (swipeCard) {
              const left = swipeCard.querySelector('.swipe-overlay.swipe-left');
              const right = swipeCard.querySelector('.swipe-overlay.swipe-right');
              if (left) left.style.opacity = '0';
              if (right) right.style.opacity = '0';
          }
          if (prevBodyOverflowX !== null) {
              document.body.style.overflowX = prevBodyOverflowX;
              prevBodyOverflowX = null;
          }
          swipeCard = null;
          swipeContainer = null;
          swipeCandidate = null;
          isSwiping = false;
          swipeDx = 0;
      };
      const resetSwipe = (delayMs = 0, snapBack = false) => {
          if (delayMs > 0) {
              setTimeout(() => doResetSwipe(snapBack), delayMs);
          } else {
              doResetSwipe(snapBack);
          }
      };

      const beginSwipe = () => {
          if (!swipeCandidate) return false;
          const card = swipeCandidate;
          swipeCandidate = null;
          ensureSwipeOverlays(card);
          swipeCard = card;
          swipeContainer = getSwipeContainer(card);
          swipeContainer.classList.add('swipe-float');
          return true;
      };

      const getMaxDrag = () => {
          const base = window.innerWidth * 0.35;
          return Math.min(Math.max(base, 120), 200);
      };

      const getCommitThreshold = (maxDrag) => Math.min(140, Math.max(90, maxDrag * 0.65));

      const handleSwipeMove = (dx, dy, preventDefault) => {
          swipeDx = dx;

          if (!isSwiping) {
              if (Math.abs(dx) > 16 && Math.abs(dx) > Math.abs(dy) * 1.5) {
                  isSwiping = true;
                  if (!beginSwipe()) return;
                  swipeContainer.classList.add('swipe-dragging');
                  swipeContainer.style.willChange = 'transform, opacity';
                  if (prevBodyOverflowX === null) {
                      prevBodyOverflowX = document.body.style.overflowX;
                      document.body.style.overflowX = 'hidden';
                  }
              } else if (Math.abs(dy) > 12) {
                  resetSwipe();
                  return;
              } else {
                  return;
              }
          }

          if (!swipeContainer) return;
          if (preventDefault) preventDefault();

          if (swipeRaf) cancelAnimationFrame(swipeRaf);
          swipeRaf = requestAnimationFrame(() => {
              const maxDrag = getMaxDrag();
              const clampedDx = Math.max(-maxDrag, Math.min(maxDrag, swipeDx));
              const rotate = clampedDx / 70;
              const progress = Math.min(Math.abs(clampedDx) / maxDrag, 1);
              const fade = 1 - progress * 0.35;

              swipeContainer.style.transform = `translate3d(${clampedDx}px, 0, 0) rotate(${rotate}deg)`;
              swipeContainer.style.opacity = String(fade);

              const left = swipeCard.querySelector('.swipe-overlay.swipe-left');
              const right = swipeCard.querySelector('.swipe-overlay.swipe-right');
              if (left) left.style.opacity = clampedDx < 0 ? String(progress) : '0';
              if (right) right.style.opacity = clampedDx > 0 ? String(progress) : '0';
          });
      };

      const handleSwipeEnd = () => {
          if (swipeRaf) { cancelAnimationFrame(swipeRaf); swipeRaf = null; }
          if (this.state.mode !== 'study') {
              resetSwipe();
              return;
          }
          if (!isSwiping || !swipeContainer || !swipeCard) {
              resetSwipe();
              return;
          }

          this._lastSwipeTime = Date.now();
          lastSwipeTime = Date.now();

          const maxDrag = getMaxDrag();
          const absDx = Math.abs(swipeDx);
          const commitThreshold = getCommitThreshold(maxDrag);
          if (absDx < commitThreshold) {
              resetSwipe();
              return;
          }

          const dir = swipeDx > 0 ? 1 : -1;
          const throwX = dir * (maxDrag + 40);
          const throwRot = dir * 6;
          swipeContainer.classList.remove('swipe-dragging');
          swipeContainer.classList.add('swipe-throw');
          swipeContainer.style.transform = `translate3d(${throwX}px, 0, 0) rotate(${throwRot}deg)`;
          swipeContainer.style.opacity = '0';

          const left = swipeCard.querySelector('.swipe-overlay.swipe-left');
          const right = swipeCard.querySelector('.swipe-overlay.swipe-right');
          if (left) left.style.opacity = dir < 0 ? '1' : '0';
          if (right) right.style.opacity = dir > 0 ? '1' : '0';

          setTimeout(() => {
              this.state.skipSwipeAnimationOnce = true;
              this.state.skipFadeInOnce = true;
              this.markLearned(dir > 0);
          }, 100);
          resetSwipe(260, true);
      };

      // Helper to prevent zombie listeners from reacting if App is re-initialized
      const isCurrentApp = () => this === window.App;

      container.addEventListener('touchstart', (e) => {
          if (!isCurrentApp()) return;
          touchStartX = e.changedTouches[0].screenX;
          touchStartY = e.changedTouches[0].screenY;
          swipeDx = 0;
          isSwiping = false;
          if (this.state.mode !== 'study') {
              swipeCard = null;
              swipeContainer = null;
              return;
          }
          const card = e.target.closest('.study-card-container .card');
          if (!card) {
              swipeCard = null;
              swipeContainer = null;
              return;
          }
          swipeCandidate = card;
      }, {passive: true});

      container.addEventListener('touchmove', (e) => {
          if (!isCurrentApp()) return;
          const touch = e.changedTouches[0];
          const dx = touch.screenX - touchStartX;
          const dy = touch.screenY - touchStartY;
          handleSwipeMove(dx, dy, () => e.preventDefault());
      }, {passive: false});

      container.addEventListener('touchend', (e) => {
          if (!isCurrentApp()) return;
          handleSwipeEnd();
      }, {passive: true});

      container.addEventListener('mousedown', (e) => {
          if (!isCurrentApp()) return;
          if (e.button !== 0) return;
          touchStartX = e.screenX;
          touchStartY = e.screenY;
          swipeDx = 0;
          isSwiping = false;
          isMouseDown = true;
          if (this.state.mode !== 'study') {
              swipeCard = null;
              swipeContainer = null;
              return;
          }
          const card = e.target.closest('.study-card-container .card');
          if (!card) {
              swipeCard = null;
              swipeContainer = null;
              return;
          }
          swipeCandidate = card;
      });

      document.addEventListener('mousemove', (e) => {
          if (!isCurrentApp()) return;
          if (!isMouseDown) return;
          const dx = e.screenX - touchStartX;
          const dy = e.screenY - touchStartY;
          if (swipeCard && swipeContainer && !prevUserSelect) {
              prevUserSelect = document.body.style.userSelect;
              document.body.style.userSelect = 'none';
          }
          handleSwipeMove(dx, dy, () => e.preventDefault());
      });

      document.addEventListener('mouseup', (e) => {
          if (!isCurrentApp()) return;
          if (!isMouseDown) return;
          isMouseDown = false;
          if (prevUserSelect !== '') {
              document.body.style.userSelect = prevUserSelect;
              prevUserSelect = '';
          }
          handleSwipeEnd();
      });

      container.addEventListener('click', (e) => {
          if (!isCurrentApp()) return;
          if (e.target.closest('button, a, input, textarea, details, summary, .interactive-char, .hook-edit-btn, [data-action], canvas, svg, .writing-target-inner, .study-mini-breakdown')) return;
          if (!['study', 'writing'].includes(this.state.mode)) return;

          // Prevent ghost clicks after a swipe
          if (Date.now() - lastSwipeTime < 400) return;

          const width = window.innerWidth;
          const x = e.clientX;
          
          this.createTapAnimation(e.clientX, e.clientY);

          if (x < width * 0.3) {
              if (this.state.mode === 'writing') {
                  this.state.writingCharIndex = 0;
                  this.state.lastSwipe = 'left';
              }
              this.prev();
          } else if (x > width * 0.7) {
              if (this.state.mode === 'writing') {
                  this.state.writingCharIndex = 0;
                  this.state.lastSwipe = 'right';
              }
              this.next(false);
          } else {
              if (this.state.mode !== 'writing') {
                  this.toggleFlip();
              }
          }
      });

      document.addEventListener('keydown', (e) => {
          if (!isCurrentApp()) return;
          if (!['study', 'sentences', 'writing'].includes(this.state.mode)) return;
          if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

          if (e.key === 'ArrowRight') {
              if (this.state.mode === 'sentences') return;
              if (this.state.mode === 'writing') {
                  this.state.writingCharIndex = 0;
                  this.state.lastSwipe = 'right';
              }
              this.next(false);
          } else if (e.key === 'ArrowLeft') {
              if (this.state.mode === 'sentences') return;
              if (this.state.mode === 'writing') {
                  this.state.writingCharIndex = 0;
                  this.state.lastSwipe = 'left';
              }
              this.prev();
          } else if (e.key === ' ' || e.code === 'Space' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key.toLowerCase() === 'f') {
              e.preventDefault();
              if (this.state.mode === 'sentences') {
                  if (e.key === ' ' || e.code === 'Space') {
                      this.toggleReaderEntry(this.state.currentIndex);
                      const item = this.state.activeList[this.state.currentIndex];
                      if (item && item.zh) {
                          this.speakText(item.zh, 'zh-TW');
                      }
                  }
              } else if (this.state.mode !== 'writing') {
                  this.toggleFlip();
              }
          }
      });
  },

    haptic(style = 'light') {
        if (!navigator.vibrate) return;
        try {
            if (style === 'light') navigator.vibrate(10);
            else if (style === 'medium') navigator.vibrate(15);
            else navigator.vibrate([20, 10, 20]);
        } catch(e) {}
    },

  createTapAnimation(x, y) {
        this.haptic('light');
      const ripple = document.createElement('div');
      ripple.className = 'tap-ripple';
      ripple.style.left = `${x}px`;
      ripple.style.top = `${y}px`;
      document.body.appendChild(ripple);
      setTimeout(() => ripple.remove(), 400);
  },

 setMode(newMode) {
    if (this.state.mode === newMode) return; 

    // 🌟 Clear all pending timers before mode change to prevent iOS crashes from stale callbacks
    if (this._autoPlayTimer) { clearTimeout(this._autoPlayTimer); this._autoPlayTimer = null; }
    if (this._markLearnedAnimTimer) { clearTimeout(this._markLearnedAnimTimer); this._markLearnedAnimTimer = null; }
    if (this._swipeFeedbackTimer) { clearTimeout(this._swipeFeedbackTimer); this._swipeFeedbackTimer = null; }
    if (this._autoRestartTimer) { clearTimeout(this._autoRestartTimer); this._autoRestartTimer = null; }
    if (this._dialoguePlayerProgressRafId) { cancelAnimationFrame(this._dialoguePlayerProgressRafId); this._dialoguePlayerProgressRafId = null; }
    if (this._dialoguePlayerRafId) { cancelAnimationFrame(this._dialoguePlayerRafId); this._dialoguePlayerRafId = null; }

    this.state.previousMode = this.state.mode;

    if (this.state.mode === 'listening' && this.state.listeningMode === 'dialogue') {
      this.pauseDialoguePlayer({ persist: false, updateUI: false });
    }
    
    // Create a filter key so we can check if filters changed while we were away
    const filterKey = this.getFilterKey();

    this.state.modeCache[this.state.mode] = {
        list: this.state.activeList, 
        index: this.state.currentIndex,
        isFinished: this.state.isFinished, 
        sessionMistakes: this.state.sessionMistakes,
        filterKey: filterKey
    };

    const container = document.getElementById('mainContainer');
    const innerWrapper = container.firstElementChild; 
    const writingDock = document.getElementById('writingBottomDock');
    
    const modeOrder = { 'list': 0, 'study': 1, 'sentences': 2, 'builder': 3, 'writing': 4, 'quiz': 5, 'quiz-mc': 6, 'listening': 7 };
    const isGoingRight = (modeOrder[newMode] || 0) > (modeOrder[this.state.mode] || 0);

    // 🌟 ULTIMATE LOCK: Freeze the entire document
    document.documentElement.classList.add('is-animating');
    container.style.pointerEvents = 'none'; 
    
    this.state.mode = newMode; 
    document.body.dataset.mode = newMode;
    document.body.classList.toggle('mode-quiz', newMode === 'quiz');
    document.body.classList.toggle('mode-quiz-mc', newMode === 'quiz-mc');
    if (!['study', 'sentences'].includes(newMode)) this.stopAutoPlay();
    if (typeof UI.updateNavHighlight === 'function') UI.updateNavHighlight(); 

    if (innerWrapper) {
        innerWrapper.classList.remove('view-enter-left', 'view-enter-right');
        innerWrapper.classList.add(isGoingRight ? 'view-leave-left' : 'view-leave-right');
    }

    if (writingDock) {
        writingDock.style.transition = '';
        writingDock.style.opacity = '';
        writingDock.style.transform = '';
        writingDock.classList.remove('dock-enter');
        writingDock.classList.add('dock-exit');
    }

    setTimeout(async () => {
      try {
        // Snap the layout changes while invisible
        if (newMode === 'writing') {
            document.body.classList.add('focus-mode');
        } else {
            document.body.classList.remove('focus-mode');
        }

        const currentFilterKey = this.getFilterKey();

        if (this.state.modeCache[newMode] && this.state.modeCache[newMode].filterKey === currentFilterKey && this.state.modeCache[newMode].list) {
            this.state.activeList = this.state.modeCache[newMode].list;
            this.state.currentIndex = this.state.modeCache[newMode].index;
            this.state.isFinished = this.state.modeCache[newMode].isFinished || false;
            this.state.sessionMistakes = this.state.modeCache[newMode].sessionMistakes || [];
            this.state.isFlipped = false;
            this.state.isStudyBreakdownOpen = false;
        } else {
            await this.ensureDataLoadedForCurrentState();
            this.updateActiveList(false);
        }
        
        this.saveSettings(); 
        UI.render(); 
        if (typeof UI.updateStreak === 'function') UI.updateStreak();
        setTimeout(() => this.preloadUpcomingChars(), 100);

        const newWrapper = container.firstElementChild;
        if (newWrapper) {
            newWrapper.classList.remove('fade-in', 'view-leave-left', 'view-leave-right');
            void newWrapper.offsetWidth; 
            newWrapper.classList.add(isGoingRight ? 'view-enter-right' : 'view-enter-left');
        }

      } catch (e) {
        console.error(e);
      } finally {
        setTimeout(() => {
            // 🌟 RELEASE LOCK: Unfreeze the document
            document.documentElement.classList.remove('is-animating');
            container.style.pointerEvents = 'auto';
        }, 200);
      }
    }, 50); 
  },
  
  findRelatedCharacters(char) {
      if (!this._componentIndex) {
          this.buildCharacterIndices().catch(error => {
              console.error('Character index load failed', error);
          });
          return [];
      }

      return ((this._componentIndex && this._componentIndex[char]) || [])
          .map(targetChar => DATA.CHARS[targetChar] || { hanzi: targetChar })
          .filter(Boolean);
  },

  getVocabHint(hz) {
      if (!hz) return null;

      // 🚀 O(1) Cache lookup to prevent freezing on repeated clicks
      if (this._vocabHintCache && this._vocabHintCache[hz] !== undefined) {
          return this._vocabHintCache[hz];
      }
      if (!this._vocabHintCache) this._vocabHintCache = {};

      const exact = (DATA.VOCAB_EXACT_MATCH[hz] || []);
      const any = (DATA.VOCAB_BY_CHAR[hz] || []);
      const list = exact.length ? exact : any;
      
      if (!list.length) {
          this._vocabHintCache[hz] = null;
          return null;
      }

      // 🚀 O(N) single pass to find the minimum book/lesson instead of heavy sorting
      let best = list[0];
      let bestScore = (Number(best.book) || 99) * 1000 + (Number(best.lesson) || 99);

      for (let i = 1; i < list.length; i++) {
          const v = list[i];
          if (!v) continue;
          const score = (Number(v.book) || 99) * 1000 + (Number(v.lesson) || 99);
          if (score < bestScore) {
              best = v;
              bestScore = score;
          }
      }

      const hint = {
          book: best.book,
          lesson: best.lesson,
          color: window.Utils && window.Utils.getBookColor ? Utils.getBookColor(best.book) : '#ec4899',
          bg: window.Utils && window.Utils.getBookBg ? Utils.getBookBg(best.book) : '#fce7f3',
          isExact: exact.length > 0
      };

      this._vocabHintCache[hz] = hint;
      return hint;
  },

  updateAppearsIn(e, searchChar, rowId, heroChar, mainComponent) {
      if (e) e.stopPropagation(); 
      
      const row = document.getElementById(rowId);
      if (!row) return;

      const bentoNode = row.closest('.bento-node');
      let targetChar = searchChar;

      if (e && e.currentTarget && e.currentTarget.classList.contains('active-preview') && searchChar !== mainComponent) {
          targetChar = mainComponent;
      }

      const relatedChars = this.findRelatedCharacters(targetChar)
          .filter(c => c.hanzi !== heroChar)
          .map(c => c.hanzi).slice(0, 5);

      let interactive = `<span style="color:var(--text-muted); font-size: 0.85rem;">None</span>`;
      if (relatedChars.length > 0) {
          interactive = relatedChars.map(c => {
              const hint = this.getVocabHint(c);
              const tag = hint ? `<span class="appears-tag" style="background:${hint.bg}; color:${hint.color}; border-color:${hint.color};">B${hint.book} L${hint.lesson}</span>` : '';
              return `<span class="appears-node-wrap"><span class="interactive-char appears-node" onclick="App.handleCharClick(event, '${c}')">${c}</span>${tag}</span>`;
          }).join('');
      }
      const appearsHint = this.getVocabHint(targetChar);
      const appearsTag = appearsHint ? `<span class="appears-tag" style="background:${appearsHint.bg}; color:${appearsHint.color}; border-color:${appearsHint.color};">B${appearsHint.book} L${appearsHint.lesson}</span>` : '';

      row.innerHTML = `
          <span class="appears-label interactive-char" onclick="App.handleCharClick(event, '${targetChar}')" title="Explore ${targetChar}">
              in ${targetChar} 
              <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
              ${appearsTag}
          </span> 
          <div class="appears-list">${interactive}</div>
      `;
      row.setAttribute('onclick', `App.handleCharClick(event, '${targetChar}')`);

      if (bentoNode) {
          bentoNode.classList.add('expanded'); 
          bentoNode.querySelectorAll('.sub-component-item, .bento-icon-hz').forEach(el => {
              el.classList.remove('active-preview');
          });
          
          if (targetChar !== mainComponent && e && e.currentTarget) {
              e.currentTarget.classList.add('active-preview');
          }
      }
  },

  toggleLookupNode(e, node) {
      if (e) {
          const blockedTarget = e.target.closest('.interactive-char, .interactive-word, button, a, .sub-component-item, .appears-in-row');
          if (blockedTarget) return;
          e.preventDefault();
      }
      if (!node || node.dataset.lookupAnimating === '1') return;

      const body = node.querySelector('.bento-body-wrapper');
      if (!body) return;

      const isOpening = !node.classList.contains('expanded');
      const onTransitionEnd = event => {
          if (event.target !== body || event.propertyName !== 'height') return;
          if (isOpening) body.style.height = 'auto';
          node.dataset.lookupAnimating = '';
          body.style.willChange = '';
          body.style.overflow = '';
          body.removeEventListener('transitionend', onTransitionEnd);
      };

      node.dataset.lookupAnimating = '1';
      body.style.overflow = 'hidden';
      body.style.willChange = 'height, opacity';
      body.removeEventListener('transitionend', onTransitionEnd);

      if (isOpening) {
          node.classList.add('expanded');
          body.style.height = '0px';
          body.style.opacity = '0';
          void body.offsetHeight;
          const targetHeight = body.scrollHeight;
          requestAnimationFrame(() => {
              body.style.height = `${targetHeight}px`;
              body.style.opacity = '1';
          });
      } else {
          const startHeight = body.scrollHeight;
          body.style.height = `${startHeight}px`;
          body.style.opacity = '1';
          void body.offsetHeight;
          node.classList.remove('expanded');
          requestAnimationFrame(() => {
              body.style.height = '0px';
              body.style.opacity = '0';
          });
      }

      body.addEventListener('transitionend', onTransitionEnd);
  },

  _generateWordHTML(char, vocabMatch, fallbackPy, fallbackDef) {
      const pinyin = vocabMatch ? vocabMatch.pinyin : fallbackPy || '---';
      const def = this.compactDefinition(vocabMatch ? vocabMatch.def : fallbackDef, { fallback: '' });
      
      let html = `<div class="anatomy-master-container is-word">`;
      
      // Hero Section
      html += `
          <div class="anatomy-hero-section">
              <div class="static-fallback-char" style="font-size: clamp(3rem, 12vw, 4.5rem); letter-spacing: 8px; text-align: center; margin-bottom: 16px;">${char}</div>
              <div class="hero-py">${pinyin}</div>
              ${def ? `<div class="hero-def">${def}</div>` : ''}
          </div>
      `;

      // Book/Lesson Banner
	      if (vocabMatch) {
	          const bColor = window.Utils && window.Utils.getBookColor ? Utils.getBookColor(vocabMatch.book) : '#ec4899';
	          const bBg = window.Utils && window.Utils.getBookBg ? Utils.getBookBg(vocabMatch.book) : '#fce7f3';
            const detailDef = this.compactDefinition(vocabMatch.def, { fallback: '' });
	          html += `
	              <div class="standalone-banner" style="border-left: 4px solid ${bColor}; background: ${bBg}60; border-radius: 0 12px 12px 0; padding: 10px 16px; margin: 0 0 20px 0; display: flex; align-items: center; justify-content: space-between; gap: 12px;">
	                  <div style="display: flex; flex-direction: column; text-align: left; flex: 1; min-width: 0;">
	                      <span style="font-family: 'Nunito', sans-serif; font-size: 0.65rem; font-weight: 800; color: ${bColor}; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 2px;">Word Details</span>
	                      ${detailDef ? `<span style="font-family: 'Nunito', sans-serif; font-size: 0.95rem; font-weight: 700; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${detailDef}</span>` : ''}
	                  </div>
	                  <div style="background: white; border: 1px solid ${bColor}40; color: ${bColor}; padding: 4px 8px; border-radius: 8px; font-family: 'Nunito', sans-serif; font-weight: 800; font-size: 0.75rem; white-space: nowrap; box-shadow: 0 2px 4px rgba(255, 158, 181, 0.12);">
	                      B${vocabMatch.book} L${vocabMatch.lesson}
                  </div>
              </div>
          `;
      }

      // Sub-Characters Grid
      html += `<div class="dna-section-title" style="margin-top:20px;">Characters in this word</div>`;
      html += `<div class="ios17-component-grid">`;
      
	      const hanziChars = char.match(/[\u4e00-\u9fa5]/g) || [];
	      hanziChars.forEach(c => {
	          const charData = DATA.CHARS[c];
	          const cPy = charData ? Utils.formatNumberedPinyin(Array.isArray(charData.pinyin) ? charData.pinyin[0] : (charData.pinyin || '')) : '---';
	          const cDef = charData ? this.compactDefinition(charData.def, { fallback: '' }) : '';
	          
	          html += `
	              <div class="ios17-grid-card interactive-char" onclick="App.handleCharClick(event, '${c}')" title="Explore ${c}">
	                  <div class="grid-py">${cPy}</div>
	                  <div class="grid-hz">${c}</div>
	                  ${cDef ? `<div class="grid-def">${cDef}</div>` : ''}
	              </div>
	          `;
	      });
      
      html += `</div>`;
      return html;
  },

  _generateCharHeroHTML(char, charData) {
      let displayPinyin = Utils.formatNumberedPinyin(Array.isArray(charData.pinyin) ? charData.pinyin[0] : (charData.pinyin || '')) || '---';
      if (charData.chameleon_alert && charData.chameleon_alert.is_polyphone && Array.isArray(charData.chameleon_alert.pinyin_variations)) {
          const variations = charData.chameleon_alert.pinyin_variations
              .map(p => Utils.formatNumberedPinyin(p))
              .filter(p => p !== displayPinyin);
          if (variations.length > 0) {
              displayPinyin += ` <span style="color:var(--text-muted); font-size:0.95rem; font-weight:600;">(also: ${variations.join(', ')})</span>`;
          }
      }

      let soundHintHTML = '';
      if (charData.phonetic_clue && charData.phonetic_clue.has_clue) {
          const clueChar = charData.phonetic_clue.indicator_component;
          const cluePy = Utils.formatNumberedPinyin(charData.phonetic_clue.indicator_pinyin);
          soundHintHTML = `
              <div class="lookup-sound-hint">
                  Sound hint:
                  <span class="interactive-char lookup-sound-char" onclick="App.handleCharClick(event, '${clueChar}')">${clueChar}</span>
                  (${cluePy})
              </div>
          `;
      }

      const compactDef = this.compactDefinition(charData.def, { fallback: '' });

      return `
          <div class="anatomy-hero-section">
              <div class="hero-py">${displayPinyin}</div>
              ${soundHintHTML}
              ${compactDef ? `<div class="hero-def">${compactDef}</div>` : ''}
          </div>
      `;
  },

  _generateVocabBannersHTML(char) {
      // Spread into a new array to prevent .sort() from mutating our cached index
      const standaloneVocabs = [...(DATA.VOCAB_EXACT_MATCH[char] || [])].sort((a, b) => {
          const aBook = parseInt(a.book, 10) || 1;
          const bBook = parseInt(b.book, 10) || 1;
          if (aBook !== bBook) return aBook - bBook;
          return (parseInt(a.lesson, 10) || 0) - (parseInt(b.lesson, 10) || 0);
      });

      if (standaloneVocabs.length === 0) return '';

	      const primaryVocab = standaloneVocabs[0];
	      const bColor = window.Utils && window.Utils.getBookColor ? Utils.getBookColor(primaryVocab.book) : '#ec4899';
	      const bBg = window.Utils && window.Utils.getBookBg ? Utils.getBookBg(primaryVocab.book) : '#fce7f3';
        const primaryDef = this.compactDefinition(primaryVocab.def, { fallback: '' });

	      if (standaloneVocabs.length === 1) {
	          return `
	              <div class="standalone-banner" style="border-left: 4px solid ${bColor}; background: ${bBg}60; border-radius: 0 12px 12px 0; padding: 10px 16px; margin: 0 0 20px 0; display: flex; align-items: center; justify-content: space-between; gap: 12px;">
	                  <div style="display: flex; flex-direction: column; text-align: left; flex: 1; min-width: 0;">
	                      <span style="font-family: 'Nunito', sans-serif; font-size: 0.65rem; font-weight: 800; color: ${bColor}; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 2px;">Book Vocab</span>
	                      <div style="display: flex; align-items: baseline; gap: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
	                          ${primaryDef ? `<span style="font-family: 'Nunito', sans-serif; font-size: 0.95rem; font-weight: 700; color: var(--text-main);">${primaryDef}</span>` : ''}
	                          <span style="font-family: 'Nunito', sans-serif; font-size: 0.85rem; font-weight: 600; color: var(--text-muted);">${primaryVocab.pinyin}</span>
	                      </div>
	                  </div>
                  <div style="background: white; border: 1px solid ${bColor}40; color: ${bColor}; padding: 4px 8px; border-radius: 8px; font-family: 'Nunito', sans-serif; font-weight: 800; font-size: 0.75rem; white-space: nowrap; box-shadow: 0 2px 4px rgba(255, 158, 181, 0.12);">
                      B${primaryVocab.book} L${primaryVocab.lesson}
                  </div>
              </div>
          `;
      } else {
          return `
              <div class="standalone-banner-wrapper" onclick="this.classList.toggle('expanded')" style="border-left: 4px solid ${bColor}; background: ${bBg}60; border-radius: 0 12px 12px 0; margin: 0 0 20px 0; overflow: hidden;">
                  <div style="padding: 10px 16px; display: flex; align-items: center; justify-content: space-between; gap: 12px;">
	                      <div style="display: flex; flex-direction: column; text-align: left; flex: 1; min-width: 0;">
	                          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 2px;">
	                              <span style="font-family: 'Nunito', sans-serif; font-size: 0.65rem; font-weight: 800; color: ${bColor}; text-transform: uppercase; letter-spacing: 1px;">Book Vocab</span>
	                              <span style="font-family: 'Nunito', sans-serif; font-size: 0.65rem; font-weight: 800; color: ${bColor}; background: white; padding: 2px 6px; border-radius: 6px; box-shadow: 0 1px 3px rgba(255, 158, 181, 0.12); margin-left: 4px;">${standaloneVocabs.length} Meanings</span>
	                          </div>
	                          <div style="display: flex; align-items: baseline; gap: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
	                              ${primaryDef ? `<span style="font-family: 'Nunito', sans-serif; font-size: 0.95rem; font-weight: 700; color: var(--text-main);">${primaryDef}</span>` : ''}
	                              <span style="font-family: 'Nunito', sans-serif; font-size: 0.85rem; font-weight: 600; color: var(--text-muted);">${primaryVocab.pinyin}</span>
	                          </div>
	                      </div>
                      <div style="display: flex; align-items: center; gap: 6px;">
                          <div style="background: white; border: 1px solid ${bColor}40; color: ${bColor}; padding: 4px 8px; border-radius: 8px; font-family: 'Nunito', sans-serif; font-weight: 800; font-size: 0.75rem; white-space: nowrap; box-shadow: 0 2px 4px rgba(255, 158, 181, 0.12);">
                              B${primaryVocab.book} L${primaryVocab.lesson}
                          </div>
                          <svg class="sb-chevron" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style="color: ${bColor};"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/></svg>
                      </div>
                  </div>
                  
                  <div class="sb-body-wrapper">
                      <div style="overflow: hidden;">
                          <div style="padding: 0 16px 12px 16px; border-top: 1px dashed ${bColor}50; margin-top: 2px; display: flex; flex-direction: column; gap: 8px; padding-top: 12px;">
	                              ${standaloneVocabs.slice(1).map(v => {
	                                  const subBColor = window.Utils && window.Utils.getBookColor ? Utils.getBookColor(v.book) : '#94a3b8';
                                    const compactDef = this.compactDefinition(v.def, { fallback: '' });
	                                  return `
	                                  <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px;">
	                                      <div style="display: flex; flex-direction: column; flex: 1; min-width: 0;">
	                                          ${compactDef ? `<span style="font-family: 'Nunito', sans-serif; font-size: 0.9rem; font-weight: 700; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${compactDef}</span>` : ''}
	                                          <span style="font-family: 'Nunito', sans-serif; font-size: 0.8rem; font-weight: 600; color: var(--text-muted);">${v.pinyin}</span>
	                                      </div>
	                                      <div style="font-family: 'Nunito', sans-serif; font-size: 0.7rem; font-weight: 800; color: ${subBColor}; background: white; border: 1px solid ${subBColor}40; padding: 3px 6px; border-radius: 6px; box-shadow: 0 1px 3px rgba(255, 158, 181, 0.12);">
                                          B${v.book} L${v.lesson}
                                      </div>
                                  </div>
                                  `
                              }).join('')}
                          </div>
                      </div>
                  </div>
              </div>
          `;
      }
  },

  _generateDeconstructionHTML(char, charData) {
      if (!charData.deconstruction_tree || !charData.deconstruction_tree.children || charData.deconstruction_tree.children.length === 0) {
          if (charData.isGeneratedFallback) {
              return `<div style="text-align:center; padding: 30px 20px; background: rgba(255,255,255,0.5); border-radius: 20px; border: 1px dashed rgba(255,158,181,0.4); color: #64748b; font-weight: 600; font-size: 0.95rem; margin-bottom: 24px;">No structural breakdown available for this component yet.</div>`;
          }
          return '';
      }

      let html = `<div class="anatomy-bento-grid">`;
      charData.deconstruction_tree.children.forEach((child, idx) => {
          const charStr = child.component || '?';
          const py = Utils.formatNumberedPinyin(Array.isArray(child.pinyin) ? child.pinyin[0] : (child.pinyin || ''));
          const def = (child.meaning || '').split(/[,;]/)[0]; 
          const safeDef = def.replace(/'/g, "&#39;").replace(/"/g, "&quot;");
          const safePy = py.replace(/'/g, "&#39;").replace(/"/g, "&quot;");
          
          const rowId = `appears-row-${char}-${idx}`;

          let subCharsHTML = '';
          if (child.children && child.children.length > 0) {
              const lis = child.children.map(c => {
                  const subC = c.component || '?';
                  const subPy = Utils.formatNumberedPinyin(Array.isArray(c.pinyin) ? c.pinyin[0] : (c.pinyin || ''));
                  const subDef = (c.meaning || '').split(/[,;]/)[0];
                  const sDef = subDef.replace(/'/g, "&#39;").replace(/"/g, "&quot;");
                  const sPy = subPy.replace(/'/g, "&#39;").replace(/"/g, "&quot;");
                  
                  const classSub = subC !== '?' ? 'sub-hz interactive-char' : 'sub-hz';
                  const clickSubIcon = subC !== '?' ? `onclick="App.handleCharClick(event, '${subC}', '${sPy}', '${sDef}')"` : '';
                  const clickSubRow = subC !== '?' ? `onclick="App.updateAppearsIn(event, '${subC}', '${rowId}', '${char}', '${charStr}')"` : '';

                  const subHint = this.getVocabHint(subC);
                  const subHintStyle = subHint ? `style="--accent:${subHint.color}; --accent-bg:${subHint.bg};"` : '';
                  const subHintClass = subHint ? 'has-vocab' : '';
                  const subHintTag = subHint ? `<span class="vocab-suggest-tag" ${subHintStyle}>B${subHint.book} L${subHint.lesson}</span>` : '';
                  
                  return `
                      <li class="sub-component-item ${subHintClass}" ${clickSubRow} ${subHintStyle}>
                          <span class="${classSub}" ${clickSubIcon} style="position:relative; z-index:5;">${subC}</span> 
                          <span class="sub-def">${subDef}</span>
                          ${subHintTag}
                      </li>
                  `;
              }).join('');
              subCharsHTML = `<ul class="sub-component-list">${lis}</ul>`;
          }

          const initialRelatedChars = charStr !== '?' ? this.findRelatedCharacters(charStr)
              .filter(c => c.hanzi !== char)
              .map(c => c.hanzi).slice(0, 5) : [];

          const hasExpandedContent = (child.children && child.children.length > 0) || initialRelatedChars.length > 0;
          
          let appearsInHTML = '';
          if (hasExpandedContent) {
              let interactive = `<span style="color:var(--text-muted); font-size: 0.85rem;">None</span>`;
              if (initialRelatedChars.length > 0) {
                  interactive = initialRelatedChars.map(c => {
                      const hint = this.getVocabHint(c);
                      const tag = hint ? `<span class="appears-tag" style="background:${hint.bg}; color:${hint.color}; border-color:${hint.color};">B${hint.book} L${hint.lesson}</span>` : '';
                      return `<span class="appears-node-wrap"><span class="interactive-char appears-node" onclick="App.handleCharClick(event, '${c}')">${c}</span>${tag}</span>`;
                  }).join('');
              }
              const appearsHint = this.getVocabHint(charStr);
              const appearsTag = appearsHint ? `<span class="appears-tag" style="background:${appearsHint.bg}; color:${appearsHint.color}; border-color:${appearsHint.color};">B${appearsHint.book} L${appearsHint.lesson}</span>` : '';
              
              appearsInHTML = `
                  <div class="appears-in-row" id="${rowId}" onclick="App.handleCharClick(event, '${charStr}', '${safePy}', '${safeDef}')">
                      <span class="appears-label interactive-char" onclick="App.handleCharClick(event, '${charStr}', '${safePy}', '${safeDef}')" title="Explore ${charStr}">
                          in ${charStr} 
                          <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
                          ${appearsTag}
                      </span> 
                      <div class="appears-list">${interactive}</div>
                  </div>
              `;
          }

          const clickAttr = hasExpandedContent ? `onclick="App.toggleLookupNode(event, this)"` : '';
          
          let expandedBodyHTML = '';
          if (hasExpandedContent) {
              expandedBodyHTML = `
                  <div class="bento-body-wrapper">
                      <div class="bento-body-inner">
                          ${subCharsHTML}
                          ${appearsInHTML}
                      </div>
                  </div>`;
          }

          const clickMainIcon = charStr !== '?' ? `onclick="App.handleCharClick(event, '${charStr}', '${safePy}', '${safeDef}')"` : '';
          const classMain = charStr !== '?' ? 'bento-icon-hz interactive-char' : 'bento-icon-hz'; 
          const mainHint = this.getVocabHint(charStr);
          const mainHintStyle = mainHint ? `style="--accent:${mainHint.color}; --accent-bg:${mainHint.bg};"` : '';
          const mainHintClass = mainHint ? 'has-vocab' : '';
          const mainHintTag = mainHint ? `<span class="vocab-suggest-tag" ${mainHintStyle}>B${mainHint.book} L${mainHint.lesson}</span>` : '';

          html += `
              <div class="bento-node ${mainHintClass}" ${clickAttr} style="${hasExpandedContent ? 'cursor:pointer' : ''}" ${mainHintStyle}>
                  <div class="bento-header">
                      <div class="${classMain}" ${clickMainIcon} style="transition:all 0.2s; position:relative; z-index:5;">${charStr}</div>
                      <div class="bento-meta">
                          <span class="bento-py">${py}</span>
                          <span class="bento-def">${def}</span>
                      </div>
                      ${mainHintTag}
                      ${hasExpandedContent ? `<div class="bento-chevron"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/></svg></div>` : '<div style="width:20px;"></div>'}
                  </div>
                  ${expandedBodyHTML}
              </div>
          `;
      });
      html += `</div>`; 
      return html;
  },

  _generateHookHTML(char, charData) {
      let activeHook = charData ? charData.hook : '';
      return `
        <div class="network-accordion" style="margin-top: 24px;">
            <div class="network-accordion-header" onclick="this.parentElement.classList.toggle('expanded')">
                <span style="display:flex; align-items:center; gap:6px;">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14a5.99 5.99 0 00-6 6c0 2.22 1.21 4.15 3 5.19V19a1 1 0 001 1h4a1 1 0 001-1v-1.81c1.79-1.04 3-2.97 3-5.19a5.99 5.99 0 00-6-6zm2 9.45V18h-4v-2.55C8.83 14.88 8 13.53 8 12a4 4 0 118 0c0 1.53-.83 2.88-2 3.45z"/></svg>
                    Your Mnemonics
                </span>
                <svg class="network-chevron" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/></svg>
            </div>
            <div class="network-accordion-body">
                <div class="network-accordion-inner">
                    <div class="hook-card" style="margin-top: 0;">
                        <div id="hook-display-${char}" class="hook-text">
                            ${activeHook ? Utils.createBreakdown(activeHook) : '<span style="color:#cbd5e1;">Tap edit to add a memory hook...</span>'}
                        </div>
                        <button class="hook-edit-btn" data-action="edit-hook" data-char="${char}">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                        </button>
                        <div id="hook-editor-${char}" style="display:none; width:100%;">
                            <textarea id="hook-input-${char}" class="hook-textarea" placeholder="Enter memory hook...">${activeHook || ''}</textarea>
                            <div class="hook-actions">
                                <button class="btn-sec" data-action="cancel-edit-hook" data-char="${char}" style="padding:6px 12px; font-size:0.8rem;">Cancel</button>
                                <button class="btn-main" data-action="save-hook" data-char="${char}" style="padding:6px 16px; font-size:0.8rem;">Save</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      `;
  },

  _generateNetworkHTML(char) {
      let html = [];
      const buildsChars = this.findRelatedCharacters(char);

      if (buildsChars.length > 0) {
          const totalBuilds = buildsChars.length;
          const grouped = {};

          // 🚀 PERFORMANCE FIX: Limit to 60 items to prevent the browser DOM from freezing on common radicals!
          const processedBuilds = buildsChars.map(c => {
              return { c: c, hint: this.getVocabHint(c.hanzi) };
          }).sort((a, b) => {
              if (a.hint && b.hint) {
                  const bDiff = (Number(a.hint.book) || 99) - (Number(b.hint.book) || 99);
                  if (bDiff !== 0) return bDiff;
                  return (Number(a.hint.lesson) || 99) - (Number(b.hint.lesson) || 99);
              }
              if (a.hint) return -1;
              if (b.hint) return 1;
              return 0;
          }).slice(0, 60);

          processedBuilds.forEach(({c, hint}) => {
              const key = hint ? `B${hint.book}` : 'Other';
              if (!grouped[key]) grouped[key] = { hint, items: [] };
              grouped[key].items.push({ c: c, hint: hint });
          });

          const groups = Object.entries(grouped).map(([key, value]) => {
              return { key, hint: value.hint, items: value.items };
          }).sort((a, b) => {
              if (a.hint && b.hint) return Number(a.hint.book) - Number(b.hint.book);
              if (a.hint) return -1;
              if (b.hint) return 1;
              return a.key.localeCompare(b.key);
          });

          const groupHTML = groups.map((group) => {
              const hint = group.hint;
              const title = hint ? `Book ${hint.book}` : 'Other';
              const headerStyle = hint ? `style="--group-color:${hint.color}; --group-bg:${hint.bg};"` : '';

              const itemsHTML = group.items
                  .sort((a, b) => {
                      if (a.hint && b.hint) {
                          const lessonDiff = Number(a.hint.lesson) - Number(b.hint.lesson);
                          if (lessonDiff !== 0) return lessonDiff;
                      }
                      return a.c.hanzi.localeCompare(b.c.hanzi);
                  })
                  .map(({ c, hint }) => {
                      const py = Utils.formatNumberedPinyin(Array.isArray(c.pinyin) ? c.pinyin[0] : (c.pinyin || ''));
                      const def = (c.def || c.meaning || '').split(/[,;，\/]/)[0].trim(); 
                      const tag = hint ? `<span class="component-vocab-tag" style="background:${hint.bg}; color:${hint.color}; border-color:${hint.color};">B${hint.book} L${hint.lesson}</span>` : '';
                      return `
                          <div class="component-tile interactive-char" onclick="App.handleCharClick(event, '${c.hanzi}')" title="${c.def || ''}">
                              <div class="component-stack">
                                  <div class="component-py">${py}</div>
                                  <div class="component-hz">${c.hanzi}</div>
                                  <div class="component-def">${def}</div>
                              </div>
                              ${tag}
                          </div>
                      `;
                  }).join('');

              return `
                 <div class="component-group" ${headerStyle}>
                      <div class="component-group-header" onclick="this.parentElement.classList.toggle('collapsed')">
                          <div class="cg-badge">${title}</div>
                          <div class="cg-line"></div>
                          <svg class="component-group-chevron" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/></svg>
                      </div>
                      <div class="component-grid">
                          ${itemsHTML}
                      </div>
                  </div>
              `;
          }).join('');

          html.push(`
              <div class="network-accordion">
                  <div class="network-accordion-header" onclick="this.parentElement.classList.toggle('expanded')">
                      <span>Acts as a component (${totalBuilds > 60 ? 'Top 60 of ' + totalBuilds : totalBuilds})</span>
                      <svg class="network-chevron" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/></svg>
                  </div>
                  <div class="network-accordion-body">
                      <div class="network-accordion-inner">
                          <div class="component-group-list">
                              ${groupHTML}
                          </div>
                      </div>
                  </div>
              </div>
          `);
      }

      const relatedVocab = (DATA.VOCAB_BY_CHAR[char] || [])
          .filter(v => v.hanzi !== char)
          .slice(0, 8);
      
      if (relatedVocab.length > 0) {
          html.push(`
              <div class="network-accordion expanded">
                  <div class="network-accordion-header" onclick="this.parentElement.classList.toggle('expanded')">
                      <span>Appears in Vocab</span>
                      <svg class="network-chevron" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/></svg>
                  </div>
                  <div class="network-accordion-body">
                      <div class="network-accordion-inner">
                          <div class="clean-vocab-list">
          `);
          
          relatedVocab.forEach((v) => {
              const interactiveHanzi = v.hanzi.split('').map(c => {
                  if (/[\u4e00-\u9fa5]/.test(c)) {
                      const isTarget = c === char;
                      const colorStyle = isTarget ? 'color: var(--primary);' : 'color: var(--text-main);';
                      return `<span class="interactive-char" onclick="App.handleCharClick(event, '${c}')" style="${colorStyle}">${c}</span>`;
                  }
                  return c;
              }).join('');
              
              const def = (v.def || '').split(/[,;，\/]/)[0].trim();
              const bColor = window.Utils && window.Utils.getBookColor ? Utils.getBookColor(v.book) : '#ec4899';
              const bBg = window.Utils && window.Utils.getBookBg ? Utils.getBookBg(v.book) : '#fce7f3';

              html.push(`
                  <div class="clean-vocab-item">
                      <div class="cv-left">
                          <div class="cv-hz">${interactiveHanzi}</div>
                          <div class="cv-tag" style="color: ${bColor}; background: ${bBg}; border: 1px solid ${bColor}40;">
                              <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor" style="margin-right: 3px; opacity: 0.8;"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z"/></svg>
                              B${v.book} <span style="opacity: 0.3; margin: 0 3px;">|</span> L${v.lesson}
                          </div>
                      </div>
                      <div class="cv-right">
                          <div class="cv-py">${v.pinyin}</div>
                          <div class="cv-def">${def}</div>
                      </div>
                  </div>
              `);
          });
          html.push(`</div></div></div>`);
      }
      return html.join('');
  },

  goBackChar(e) {
      if (e) e.stopPropagation();
      if (this.state.charHistory.length > 0) {
          const prevChar = this.state.charHistory.pop();
          // Call the click handler with the 'isBackNavigation' flag set to true
          this.handleCharClick(null, prevChar, '', '', true);
      }
  },

  async handleCharClick(e, char, fallbackPy = '', fallbackDef = '', isBackNavigation = false) {
      if (e) {
          e.preventDefault();
          e.stopPropagation(); 
      }
      if (!char) return;

      try {
          const modal = document.getElementById('charModal');
          if (!modal) return console.error("Modal #charModal missing!");

          const wasOpen = modal.classList.contains('open');
          
          if (!wasOpen) {
              this.state.charHistory = [];
          } else if (!isBackNavigation && this.state.currentCharModal && this.state.currentCharModal !== char) {
              this.state.charHistory.push(this.state.currentCharModal);
          }
          this.state.currentCharModal = char;

          modal.classList.add('open'); 

          modal.onclick = (evt) => {
              if (evt.target === modal) {
                  modal.classList.remove('open');
              }
          };
          
          const sheet = modal.querySelector('.modal-sheet') || modal.firstElementChild;

          let modalContent = document.getElementById('charModalContent');
          if (!modalContent && sheet) {
              modalContent = document.createElement('div');
              modalContent.id = 'charModalContent';
              while (sheet.firstChild) {
                  modalContent.appendChild(sheet.firstChild);
              }
              sheet.appendChild(modalContent);
          }
          if (modalContent) modalContent.scrollTop = 0;
          
          if (modalContent) {
              let modalHeader = modalContent.querySelector('.modal-header-nav');
              if (!modalHeader) {
                  const oldH3 = modalContent.querySelector('h3');
                  if (oldH3) oldH3.remove();
                  modalHeader = document.createElement('div');
                  modalHeader.className = 'modal-header-nav';
                  modalContent.insertBefore(modalHeader, modalContent.firstChild);
              }
              
              if (this.state.charHistory.length > 0) {
                  modalHeader.innerHTML = `
                      <div class="modal-top-bar">
                          <button class="modal-back-btn" onclick="App.goBackChar(event)">
                              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z"/></svg> Back
                          </button>
                      </div>
                      <button class="modal-close-btn" onclick="document.getElementById('charModal').classList.remove('open');">
                          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                      </button>
                  `;
              } else {
                  modalHeader.innerHTML = `
                      <button class="modal-close-btn" onclick="document.getElementById('charModal').classList.remove('open');">
                          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                      </button>
                  `;
              }
          }

          const display = document.getElementById('charDisplay');
          let detail = document.getElementById('charDetail');
          
          if (!detail && modalContent) {
              detail = document.createElement('div');
              detail.id = 'charDetail';
              modalContent.appendChild(detail);
          }

          const relatedContainer = document.getElementById('charRelated');
          const link = document.getElementById('charLink');
          const strokeOrderContainer = document.getElementById('strokeOrderContainer');
          const strokeOrderFallback = document.getElementById('strokeOrderFallback');
          const strokeOrderSpinner = document.getElementById('strokeOrderSpinner');
          
          if (display) display.style.display = 'none'; 
          if (relatedContainer) relatedContainer.innerHTML = '';

          const hanziChars = char.match(/[\u4e00-\u9fa5]/g) || [];
          
          if (hanziChars.length > 1) {
              const vocabMatch = (DATA.VOCAB_EXACT_MATCH[char] || [])[0];
              try {
                  if (detail && modalContent) {
                      if (strokeOrderContainer) modalContent.appendChild(strokeOrderContainer);
                      if (strokeOrderFallback) modalContent.appendChild(strokeOrderFallback);
                      if (strokeOrderSpinner) modalContent.appendChild(strokeOrderSpinner);
                      detail.innerHTML = this._generateWordHTML(char, vocabMatch, fallbackPy, fallbackDef);
                  }
              } catch(e) { console.error('Word HTML Gen Error:', e); }
              if (link) link.href = `https://hanzicraft.com/character/${char}`;
              
              if(strokeOrderContainer) strokeOrderContainer.style.display = 'none';
              if(strokeOrderSpinner) strokeOrderSpinner.classList.add('hidden');
              if(strokeOrderFallback) strokeOrderFallback.classList.add('hidden');
              return; 
          }

          await this.ensureCharDataLoaded(char);
          await this.buildCharacterIndices();
          let charData = DATA.CHARS[char];

          if (!charData) {
              await this.buildCharacterIndices({ includeFallbackTree: true });
              let foundTree = this._fallbackTreeIndex ? this._fallbackTreeIndex[char] : null;

              let finalPy = fallbackPy;
              let finalDef = fallbackDef;
              
              if (foundTree && (!finalPy || finalPy === '---')) {
                  finalPy = Utils.formatNumberedPinyin(Array.isArray(foundTree.pinyin) ? foundTree.pinyin[0] : (foundTree.pinyin || ''));
              }
              if (foundTree && (!finalDef || finalDef === '---')) {
                  finalDef = (foundTree.meaning || '').split(/[,;]/)[0];
              }

              const vocabMatch = (DATA.VOCAB_EXACT_MATCH[char] || [])[0];
              charData = {
                  hanzi: char,
                  pinyin: vocabMatch ? vocabMatch.pinyin : (finalPy || '---'),
                  def: vocabMatch ? vocabMatch.def : (finalDef || DATA.FALLBACK_DEFS[char] || "Component / Radical"),
                  isGeneratedFallback: true,
                  deconstruction_tree: foundTree
              };
          }

          if (detail && modalContent) {
              if (strokeOrderContainer) modalContent.appendChild(strokeOrderContainer);
              if (strokeOrderFallback) modalContent.appendChild(strokeOrderFallback);
              if (strokeOrderSpinner) modalContent.appendChild(strokeOrderSpinner);
          }
          
          let html = `<div class="anatomy-master-container">`;

          html += `<div class="anatomy-left-col">`;
          try { html += this._generateCharHeroHTML(char, charData); } catch(e) { console.error('Hero:', e); }
          try { html += this._generateDeconstructionHTML(char, charData); } catch(e) { console.error('Deconst:', e); }
          html += `</div><div class="anatomy-right-col">`;
          
          try { html += this._generateVocabBannersHTML(char); } catch(e) { console.error('Banners:', e); }
          try { html += this._generateNetworkHTML(char); } catch(e) { console.error('Network:', e); }
          
          html += `</div></div>`; 
          
          if (detail) {
              detail.innerHTML = html;
              const heroSec = detail.querySelector('.anatomy-hero-section');
              if (heroSec) {
                  if (strokeOrderSpinner) heroSec.insertBefore(strokeOrderSpinner, heroSec.firstChild);
                  if (strokeOrderFallback) heroSec.insertBefore(strokeOrderFallback, heroSec.firstChild);
                  if (strokeOrderContainer) heroSec.insertBefore(strokeOrderContainer, heroSec.firstChild);
              }
          }
          if (link) link.href = `https://hanzicraft.com/character/${char}`;

          if (char.length === 1 && /[\u4e00-\u9fa5]/.test(char)) {
              const isCompactLandscapeLookup = window.matchMedia('(orientation: landscape) and (max-height: 500px) and (pointer: coarse)').matches;
              const writerSize = isCompactLandscapeLookup ? 112 : 150;
              if (strokeOrderContainer) strokeOrderContainer.style.display = 'none';
              if (strokeOrderFallback) strokeOrderFallback.classList.add('hidden');
              if (strokeOrderSpinner) strokeOrderSpinner.classList.remove('hidden');
              
              if (this.state.currentWriter) {
                  try { this.state.currentWriter.cancelQuiz(); } catch(e){}
                  try { this.state.currentWriter.hideCharacter(); } catch(e){}
                  try { 
                      if (typeof this.state.currentWriter.destroy === 'function') {
                          this.state.currentWriter.destroy(); 
                      }
                  } catch(e){}
                  this.state.currentWriter = null;
                  if (strokeOrderContainer) strokeOrderContainer.onclick = null;
              }

              if (this.animTimeout) clearTimeout(this.animTimeout);
              this.animTimeout = setTimeout(async () => {
                  await this.loadHanziWriter();
                  if (typeof HanziWriter === 'undefined') {
                      if (strokeOrderSpinner) strokeOrderSpinner.classList.add('hidden');
                      if (strokeOrderFallback) strokeOrderFallback.classList.remove('hidden');
                      return;
                  }
                  if (strokeOrderContainer) {
                      strokeOrderContainer.innerHTML = '';
                      strokeOrderContainer.style.display = 'block';
                      strokeOrderContainer.style.opacity = '0';
                      strokeOrderContainer.style.width = `${writerSize}px`;
                      strokeOrderContainer.style.height = `${writerSize}px`;
                  }
                  this.state.currentWriter = HanziWriter.create('strokeOrderContainer', char, {
                      renderer: 'svg',
                      width: writerSize, height: writerSize, padding: 5, showOutline: true,
                      strokeAnimationSpeed: 1, delayBetweenStrokes: 100,
                      strokeColor: '#ff9eb5', radicalColor: '#8b5cf6',
                      onLoadCharDataSuccess: () => {
                          if (strokeOrderSpinner) strokeOrderSpinner.classList.add('hidden');
                          if (strokeOrderContainer) {
                              strokeOrderContainer.style.opacity = '1';
                              strokeOrderContainer.onclick = () => { this.state.currentWriter.animateCharacter(); };
                          }
                          this.state.currentWriter.animateCharacter();
                      },
                      onLoadCharDataError: () => {
                          if(strokeOrderSpinner) strokeOrderSpinner.classList.add('hidden');
                          if(strokeOrderContainer) strokeOrderContainer.style.display = 'none';
                          if(strokeOrderFallback) {
                              strokeOrderFallback.classList.remove('hidden');
                              strokeOrderFallback.innerHTML = `<div class="static-fallback-char" style="font-size: ${isCompactLandscapeLookup ? '3.6rem' : '5rem'}; text-align: center; color: var(--text-main, #333);">${char}</div>`;
                          }
                      }
                  });
              }, 200);
          } else {
              if(strokeOrderSpinner) strokeOrderSpinner.classList.add('hidden');
              if(strokeOrderContainer) strokeOrderContainer.style.display = 'none';
              if(strokeOrderFallback) {
                  strokeOrderFallback.classList.remove('hidden');
                  const isCompactLandscapeLookup = window.matchMedia('(orientation: landscape) and (max-height: 500px) and (pointer: coarse)').matches;
                  strokeOrderFallback.innerHTML = `<div class="static-fallback-char" style="font-size: ${isCompactLandscapeLookup ? '3.6rem' : '5rem'}; text-align: center; color: var(--text-main, #333);">${char}</div>`;
              }
          }
      } catch (err) {
          console.error("FATAL ERROR IN handleCharClick:", err);
      }
  }
};
window.App = App;

const startApp = async () => {
    const loader = document.getElementById('hqLoader');
    const fill = document.getElementById('hqProgressFill');
    const text = document.getElementById('hqLoadingText');

    try {
        if (fill) fill.style.width = '10%'; // Starts low, importData will increment it
        
        // Allow browser a tiny fraction of a second to paint the loading screen before blocking JS thread
        await new Promise(r => setTimeout(r, 10));
        
        await App.init(); 
        
        if (fill) fill.style.width = '100%';
        if (text) text.textContent = "Ready!";

        setTimeout(() => {
            if (loader) {
                loader.classList.add('fade-out');
                setTimeout(() => loader.remove(), 400); // Quicker fade
            }
            
            // ---- THE TUTORIAL TRIGGER ----
            if (typeof Tutorial !== 'undefined') {
                Tutorial.forceShow();
            }
            // ------------------------------
        }, 100); // 🚀 Removed 1.4 seconds of artificial loading delay

    } catch (e) {
        console.error("App Init Failed:", e);
        if (text) text.textContent = `Initialization Failed: ${e?.message || 'Unknown error'}`;
        if (fill) fill.style.background = "#ef4444";
        
        const c = document.getElementById('mainContainer');
        if(c) {
            c.innerHTML = `<div style="padding:20px;text-align:center;position:relative;z-index:10000;">App failed to load.<br><small style="display:block;margin-top:8px;opacity:.75;">${String(e?.message || 'Unknown error')}</small><br><button class="btn-sec" onclick="localStorage.clear();location.reload()" style="margin-top:10px;">Reset Everything</button></div>`;
        }
    }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    const isLocalDevHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    if (isLocalDevHost) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(reg => reg.unregister()));
      } catch (error) {
        console.warn('Failed to unregister development service workers', error);
      }
      return;
    }

    try {
      await navigator.serviceWorker.register('sw.js');
    } catch (error) {
      console.warn('Service worker registration failed', error);
    }
  });
}
