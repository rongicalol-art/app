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
    skipFlipAnimationOnce: false,
    ttsRate: 0.45,
    quizType: 'vocab',
    quizDefOnly: false,
    noPinyin: false,
    noHanziColor: true,
    noTranslation: false,
    separateMode: 'off',
    fastNext: true,
    listeningHard: false,
    listeningToneTest: false,
    writingShowOutline: false,
    writingHideDrawing: false,
    writingFullscreen: true,
    activeList: [],
    showHooks: true,
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
  },
  
 async init() {
    await this.importData();
    this.loadSettings();
    
    if ((this.state.mode === 'sentences' || this.state.mode === 'builder') && DATA.SENTENCES.length === 0) {
      this.state.mode = 'study';
    }

    try {
        const learned = JSON.parse(localStorage.getItem('fc_learned_items') || '[]');
        this.state.learnedItems = new Set(learned);
    } catch (e) {
        console.error("Failed to load learned items", e);
    }

    // 🌟 FIX: Tell the list generator to preserve the exact state we just loaded
    this.updateActiveList(true); 
    
    if (this.state.activeList.length === 0 && DATA.VOCAB.length > 0 && !this.state.hideLearned) {
      this.state.lessonFilter = ['All'];
      this.state.bookFilter = ['All'];
      this.updateActiveList(false); // Reset only if the list is broken/empty
      this.saveSettings();
    }
    
    document.body.dataset.mode = this.state.mode;
    document.body.classList.toggle('mode-quiz', this.state.mode === 'quiz');
    document.body.classList.toggle('mode-quiz-mc', this.state.mode === 'quiz-mc');
    document.body.classList.toggle('focus-mode', this.state.mode === 'writing');
    UI.init();
    UI.render();
    this.setupInteraction();

    // 🌟 PRE-COMPUTE HEAVY INDICES IN THE BACKGROUND TO PREVENT UI JANK LATER
    const runBackground = window.requestIdleCallback || window.setTimeout;
    runBackground(() => this.buildCharacterIndices());
  },

  async loadScript(src) {
      if (!window._scriptPromises) window._scriptPromises = {};
      if (window._scriptPromises[src]) return window._scriptPromises[src];

      const p = new Promise((resolve, reject) => {
          if (document.querySelector(`script[src="${src}"]`)) return resolve();
          const script = document.createElement('script');
          script.src = src;
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
      });
      window._scriptPromises[src] = p;
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

  async importData() {
    // Dynamically load massive data files so they don't block the UI from rendering
    try {
        const scripts = ['chars.js', 'new_vocab.js', 'sentences.js'];
        let loaded = 0;
        const fill = document.getElementById('hqProgressFill');
        
        for (const src of scripts) {
            await this.loadScript(src);
            loaded++;
            // Advance the loading bar dynamically based on file downloads
            if (fill) fill.style.width = `${10 + (loaded / scripts.length) * 80}%`;
        }
    } catch (e) {}

    if (window.CHARS_DATA) {
        if (!Array.isArray(window.CHARS_DATA)) {
            for (const [hanzi, charData] of Object.entries(window.CHARS_DATA)) {
                DATA.CHARS[hanzi] = {
                    ...charData, 
                    hanzi: hanzi,
                    pinyin: Array.isArray(charData.pinyin) ? Utils.formatNumberedPinyin(charData.pinyin[0]) : charData.pinyin,
                    def: charData.meaning
                };
            }
        } else {
            window.CHARS_DATA.forEach(c => {
                DATA.CHARS[c.hanzi] = { ...c, def: c.meaning || c.definition, decomposition: c.components };
            });
        }
    }

    const vocabMap = new Map();
    (window.new_vocab || []).forEach(v => {
        const hanzi = v.word || v.hanzi;
        if (!hanzi) return;
        const key = v.id || `${v.book_id}-${v.lesson_id}-${hanzi}`;
        if (!vocabMap.has(key)) {
            vocabMap.set(key, {
                ...v,
                id: key,
                hanzi,
                pinyin: v.pinyin || '',
                def: v.definition || v.def || '',
                lesson: String(v.lesson_id || 0),
                book: String(v.book_id || 1),
                dialogue: String(v.dialogue_id || '0'),
                searchKey: Utils.normalizeSearch(`${hanzi}${v.pinyin}${v.definition}`)
            });
        }
    });
    DATA.VOCAB = Array.from(vocabMap.values());

    // 🌟 PRE-COMPUTE O(1) LOOKUP INDEXES TO AVOID MASSIVE ARRAY ITERATIONS LATER
    DATA.VOCAB_EXACT_MATCH = {};
    DATA.VOCAB_BY_CHAR = {};
    DATA.VOCAB.forEach(v => {
        if (!DATA.VOCAB_EXACT_MATCH[v.hanzi]) DATA.VOCAB_EXACT_MATCH[v.hanzi] = [];
        DATA.VOCAB_EXACT_MATCH[v.hanzi].push(v);
        
        const uniqueChars = new Set(v.hanzi.split(''));
        uniqueChars.forEach(c => {
            if (!DATA.VOCAB_BY_CHAR[c]) DATA.VOCAB_BY_CHAR[c] = [];
            DATA.VOCAB_BY_CHAR[c].push(v);
        });
    });

    DATA.SENTENCES = [];
    DATA.SENTENCES_BY_LESSON = {};
    DATA.SENTENCES_BY_CHAR = {};
    (window.sentences || []).forEach(s => {
        const book = String(s.book_id || '1').replace(/^[a-z]+/i, '');
        const lesson = String(parseInt(s.lesson_id || '0', 10));
        const entry = {
            id: s.source_id,
            zh: s.sentence || '',
            py: s.pinyin || '',
            en: s.english || '',
            book,
            lesson,
            dialogue: String(s.dialogue_id || '0'),
            seq: parseInt(s.sentence_id || 0, 10),
            searchKey: Utils.normalizeSearch(`${s.sentence}${s.pinyin}${s.english}`)
        };
        DATA.SENTENCES.push(entry);
        const key = `${book}-${lesson}`;
        if (!DATA.SENTENCES_BY_LESSON[key]) DATA.SENTENCES_BY_LESSON[key] = [];
        DATA.SENTENCES_BY_LESSON[key].push(entry);
        
        const chars = new Set(entry.zh.split(''));
        chars.forEach(c => {
            if (!DATA.SENTENCES_BY_CHAR[c]) DATA.SENTENCES_BY_CHAR[c] = [];
            DATA.SENTENCES_BY_CHAR[c].push(entry);
        });
    });

    const userHooks = JSON.parse(localStorage.getItem('fc_user_hooks') || '{}');
    Object.keys(userHooks).forEach(char => {
        if (DATA.CHARS[char]) {
            DATA.CHARS[char].hook = userHooks[char];
        } else {
            DATA.CHARS[char] = { hanzi: char, hook: userHooks[char] };
        }
    });
  },

  loadSettings() {
    const s = localStorage.getItem('fc_settings');
    if (s) {
      try {
        const parsed = JSON.parse(s);
        this.state.bookFilter = parsed.bookFilter || ['1'];
        if (!Array.isArray(this.state.bookFilter)) {
            this.state.bookFilter = this.state.bookFilter === 'All' ? ['All'] : [String(this.state.bookFilter)];
        }
        this.state.lessonFilter = parsed.lessonFilter || ['All'];
        if (!Array.isArray(this.state.lessonFilter)) this.state.lessonFilter = [this.state.lessonFilter];
        this.state.dialogueFilter = parsed.dialogueFilter || {};
        if (Array.isArray(this.state.dialogueFilter)) this.state.dialogueFilter = {};
        this.state.shuffle = parsed.shuffle || false;
        this.state.ttsRate = parsed.ttsRate || 0.45;
        this.state.quizType = (parsed.quizType === 'translate' && DATA.SENTENCES.length > 0) ? 'translate' : 'vocab';
        this.state.quizDefOnly = parsed.quizDefOnly || false;
        this.state.noPinyin = parsed.noPinyin || false;
                if (!parsed._colorForced) {
                    this.state.noHanziColor = true;
                } else {
                    this.state.noHanziColor = (parsed.noHanziColor !== undefined) ? parsed.noHanziColor : true;
                }
        this.state.noTranslation = parsed.noTranslation || false;
        this.state.separateMode = parsed.separateMode || 'off';
        this.state.fastNext = parsed.fastNext ?? true;
        this.state.listeningHard = parsed.listeningHard || false;
        this.state.listeningToneTest = parsed.listeningToneTest || false;
        this.state.writingShowOutline = parsed.writingShowOutline ?? false;
        this.state.writingHideDrawing = parsed.writingHideDrawing || false;
        this.state.showHooks = parsed.showHooks ?? true;
        this.state.streak = parsed.streak || 0;
        this.state.hideLearned = parsed.hideLearned !== undefined ? parsed.hideLearned : true;
        this.state.hideDock = parsed.hideDock || false;
        this.state.autoPlay = parsed.autoPlay || false;
        
        // 🌟 NEW: Restore exact session location
        this.state.mode = parsed.mode || 'study';
        this.state.currentIndex = parsed.currentIndex || 0;
        this.state.isFinished = parsed.isFinished || false;
        this.state.sessionMistakes = parsed.sessionMistakes || [];
        this.state.modeCache = {}; // Start fresh to avoid memory issues and stale caches across reloads
      } catch (e) {
        localStorage.removeItem('fc_settings');
      }
    }
  },

  saveSettings() {
    localStorage.setItem('fc_settings', JSON.stringify({
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
      separateMode: this.state.separateMode,
      fastNext: this.state.fastNext,
      listeningHard: this.state.listeningHard,
      listeningToneTest: this.state.listeningToneTest,
      writingShowOutline: this.state.writingShowOutline,
      writingHideDrawing: this.state.writingHideDrawing,
      showHooks: this.state.showHooks,
      streak: this.state.streak,
      hideLearned: this.state.hideLearned,
      hideDock: this.state.hideDock,
      autoPlay: this.state.autoPlay,
      
      // 🌟 NEW: Save exact session location
      mode: this.state.mode,
      currentIndex: this.state.currentIndex,
      isFinished: this.state.isFinished,
      sessionMistakes: this.state.sessionMistakes
      // DO NOT save modeCache to localStorage, as it contains large arrays that freeze the UI
    }));
  },

  saveUserHook(char, text) {
    const userHooks = JSON.parse(localStorage.getItem('fc_user_hooks') || '{}');
    if (text && text.trim()) userHooks[char] = text.trim();
    else delete userHooks[char];
    localStorage.setItem('fc_user_hooks', JSON.stringify(userHooks));
    if (!DATA.CHARS[char]) DATA.CHARS[char] = { hanzi: char };
    DATA.CHARS[char].hook = text ? text.trim() : '';
  },

  buildCharacterIndices() {
      if (this._componentIndex && this._fallbackTreeIndex) return;
      
      this._componentIndex = {};
      this._fallbackTreeIndex = {};
      
      const extractComponents = (node, set) => {
          if (!node) return;
          if (node.component && node.children && node.children.length > 0) {
              if (!this._fallbackTreeIndex[node.component]) {
                  this._fallbackTreeIndex[node.component] = node;
              }
          }
          if (node.component) set.add(node.component);
          if (Array.isArray(node.children)) {
              node.children.forEach(child => extractComponents(child, set));
          }
      };

      Object.values(DATA.CHARS).forEach(c => {
          if (c.deconstruction_tree) {
              const comps = new Set();
              extractComponents(c.deconstruction_tree, comps);
              comps.forEach(comp => {
                  if (comp !== c.hanzi) {
                      if (!this._componentIndex[comp]) this._componentIndex[comp] = [];
                      this._componentIndex[comp].push(c);
                  }
              });
          }
      });
  },

  saveLearned() {
    localStorage.setItem('fc_learned_items', JSON.stringify(Array.from(this.state.learnedItems)));
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
    const isSentencesSource = (this.state.mode === 'listening' && this.state.listeningHard) ||
                              ['sentences', 'builder'].includes(this.state.mode) ||
                              (['quiz', 'quiz-mc'].includes(this.state.mode) && this.state.quizType === 'translate');
                              
    const source = isSentencesSource ? DATA.SENTENCES : DATA.VOCAB;
    const fromVocab = !isSentencesSource;

    let filtered = this._getFilteredItems(source);

    if (this.state.hideLearned) {
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

    this.state.activeList = filtered;
    
    // 🌟 FIX: Only reset progress if preserveState is false
    if (!preserveState) {
        this.state.isFinished = false;
        this.state.currentIndex = 0;
        this.state.sessionMistakes = []; 
        this.state.isFlipped = false;
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

  animateAndRender(direction) {
      const skipAnimationModes = ['writing', 'list']; 
      if (skipAnimationModes.includes(this.state.mode)) {
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
          newWrapper.classList.remove('fade-in');
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

    popup.textContent = isLearned ? 'Learned' : 'Not learned';
    popup.classList.toggle('is-learned', isLearned);
    popup.classList.toggle('is-unlearned', !isLearned);

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
    this.state.skipFlipAnimationOnce = true;
    this.state.builderTokens = [];
    this.state.builderAnswer = [];
    setTimeout(() => this.preloadUpcomingChars(), 100);
    this.animateAndRender('next'); 
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
                <button class="btn-sec sc-btn sc-btn-secondary" onclick="App.restartSession()">
                    Restart Mode
                </button>
              `;
          } else {
              actionHtml = `
                <button class="btn-main sc-btn sc-btn-primary" onclick="App.restartSession()">
                    Restart Mode
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
                    Review ${unlearned.length} Unlearned
                </button>
                <button class="btn-sec sc-btn sc-btn-secondary" onclick="App.restartSession()">
                    Restart Session
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
            .sc-wrapper{height:100%;width:100%;display:flex;align-items:flex-start;justify-content:center;padding:40px 20px 80px 20px;box-sizing:border-box;position:relative;z-index:1;overflow-y:auto;-webkit-overflow-scrolling:touch}.sc-glow{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:clamp(250px,60vw,500px);height:clamp(250px,60vw,500px);background:radial-gradient(circle,var(--primary-soft) 0,rgba(255,255,255,0) 70%);border-radius:50%;z-index:-1}.sc-layout{display:flex;flex-direction:column;align-items:center;justify-content:flex-start;width:100%;height:auto;max-width:400px;gap:30px;margin:auto}.sc-col{display:flex;flex-direction:column;align-items:center;width:100%;box-sizing:border-box}.sc-header{text-align:center;animation:slideDownFade .6s cubic-bezier(0.16,1,0.3,1) both;margin-bottom:2vh}.sc-header h2{margin:0;color:var(--text-main);font-size:clamp(2.4rem,8vw,3.2rem);font-weight:900;letter-spacing:-1.5px;text-shadow:0 4px 15px rgba(255, 158, 181, 0.12)}.sc-header p{color:var(--primary-dark);margin:4px 0 0 0;font-size:clamp(.95rem,3vw,1.1rem);font-weight:800;letter-spacing:1.5px;text-transform:uppercase}.sc-ring-wrapper{position:relative;width:clamp(140px,30vh,200px);height:clamp(140px,30vh,200px);animation:scaleInFade .8s cubic-bezier(0.34,1.56,0.64,1) .1s both;flex-shrink:0;margin-bottom:2vh}.sc-ring-glass{position:absolute;inset:0;border-radius:50%;background:rgba(255,255,255,.9);box-shadow:inset 0 3px 8px rgba(255,255,255,.9),0 8px 18px rgba(255,158,181,.12)}.sc-ring-svg{position:relative;width:100%;height:100%;transform:rotate(-90deg);z-index:2;filter:drop-shadow(0 4px 6px rgba(255,158,181,.3))}.progress-ring-mastery{transition:stroke-dashoffset 1.2s cubic-bezier(0.16,1,0.3,1) .3s}.sc-ring-content{position:absolute;top:0;left:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;z-index:3}.sc-percent{font-size:clamp(2.6rem,8vw,3.8rem);font-weight:900;color:var(--text-main);line-height:.9}.sc-percent span{font-size:clamp(1.1rem,4vw,1.6rem);color:var(--primary-dark);vertical-align:super;font-weight:700}.sc-stats-grid{display:grid;grid-template-columns:1fr 1fr;gap:clamp(12px,3vw,24px);width:100%;margin-bottom:3vh}.sc-stat-card{background:rgba(255,255,255,.95);padding:clamp(16px,3vh,24px) 12px;border-radius:24px;text-align:center;border:2px solid rgba(255,255,255,.9);box-shadow:0 6px 14px rgba(255, 158, 181, 0.12)}.sc-anim-stat1{animation:slideUpFade .6s cubic-bezier(0.16,1,0.3,1) .2s both}.sc-anim-stat2{animation:slideUpFade .6s cubic-bezier(0.16,1,0.3,1) .3s both}.sc-stat-num{font-size:clamp(2rem,6vw,2.5rem);font-weight:800;color:var(--text-main);margin-bottom:4px;line-height:1}.sc-stat-label{font-size:clamp(.7rem,2.5vw,.8rem);color:var(--text-muted);font-weight:800;text-transform:uppercase;letter-spacing:1px}.sc-actions{width:100%;display:flex;flex-direction:column;gap:12px;animation:slideUpFade .6s cubic-bezier(0.16,1,0.3,1) .4s both}.sc-btn{width:100%;padding:14px 20px;font-size:1rem;font-weight:800;letter-spacing:.5px;border-radius:16px;cursor:pointer}.sc-btn-primary{box-shadow:0 8px 25px rgba(255,158,181,.4);transition:transform .2s cubic-bezier(0.25,0.8,0.25,1),box-shadow .2s;border:none}.sc-btn-primary:hover{transform:translateY(-2px);box-shadow:0 12px 30px rgba(255,158,181,.5)}.sc-btn-secondary{background:rgba(255,255,255,.95);border:2px solid rgba(255,255,255,.9);transition:background .2s}.sc-btn-secondary:hover{background:#fff}@media(min-width:768px){.sc-layout{flex-direction:row;justify-content:center;align-items:center;width:100%;max-width:820px;gap:0}.sc-col{flex:1 1 50%;max-width:50%}.sc-left{align-items:flex-end;padding-right:40px;border-right:2px solid rgba(255,255,255,.4)}.sc-right{align-items:flex-start;padding-left:40px}.sc-header{text-align:right;margin-bottom:30px}.sc-ring-wrapper{margin-bottom:0;width:220px;height:220px}.sc-stats-grid{margin-bottom:30px;gap:20px;width:100%;max-width:320px}.sc-actions{width:100%;max-width:320px}}@keyframes slideDownFade{from{opacity:0;transform:translateY(-20px)}to{opacity:1;transform:translateY(0)}}@keyframes slideUpFade{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}@keyframes scaleInFade{from{opacity:0;transform:scale(0.8)}to{opacity:1;transform:scale(1)}}
          `;
          document.head.appendChild(style);
      }

      const html = `
        <div class="sc-wrapper">
            <div class="sc-glow"></div>

            <div class="sc-layout">
                
                <div class="sc-col sc-left">
                    <div class="sc-header">
                        <h2>Complete</h2>
                        <p>${message}</p>
                    </div>
                    
                    <div class="sc-ring-wrapper">
                        <div class="sc-ring-glass"></div>
                        <svg viewBox="0 0 100 100" class="sc-ring-svg">
                            <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="8"></circle>
                            <circle class="progress-ring-mastery" cx="50" cy="50" r="42" fill="none" stroke="var(--primary)" stroke-width="8" stroke-linecap="round" stroke-dasharray="263.89" stroke-dashoffset="263.89"></circle>
                        </svg>
                        <div class="sc-ring-content">
                            <div class="sc-percent">${percent}<span>%</span></div>
                        </div>
                    </div>
                </div>

                <div class="sc-col sc-right">
                    <div class="sc-stats-grid">
                        ${statsHtml}
                    </div>
                    
                    <div class="sc-actions">
                        ${actionHtml}
                    </div>
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
      this.state.isFinished = false; // FIX: Ensure finished state is reset
      this.state.streak = 0; // FIX: Reset streak for the review
      UI.render();
      UI.showToast(`Reviewing ${count} items`);
  },

  restartSession() {
      // FIX: Grab the full dataset so we unlearn everything in the current filter,
      // not just the shrunk down activeList.
      const isSentencesSource = (this.state.mode === 'listening' && this.state.listeningHard) ||
                                ['sentences', 'builder'].includes(this.state.mode) ||
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
      
      UI.render();
      UI.showToast("Session restarted");
  },

  prev() {
    if(this.state.activeList.length === 0) return;
    this.state.currentIndex = (this.state.currentIndex - 1 + this.state.activeList.length) % this.state.activeList.length;
    this.state.isFlipped = false;
    this.state.skipFlipAnimationOnce = true;
    this.state.builderTokens = [];
    this.state.builderAnswer = [];
    setTimeout(() => this.preloadUpcomingChars(), 100);
    this.animateAndRender('prev'); 
  },

  toggleFlip(suppressSpeak = false) {
    // Prevent ghost clicks after swiping from accidentally toggling the flip state
    if (this._lastSwipeTime && Date.now() - this._lastSwipeTime < 600) return;
    
    this.state.isFlipped = !this.state.isFlipped;
    if(this.state.isFlipped && !suppressSpeak) {
        this.speakCurrent();
        setTimeout(() => this.updateCardScrollIndicator(), 200);
    }
    UI.updateFlipState();
  },

  speakSequence(parts, onDone) {
      if (!window.speechSynthesis) {
          if (onDone) onDone();
          return;
      }

      const token = this._autoPlayToken || 0;
      const next = (idx) => {
          if (!this.state.autoPlay || token !== this._autoPlayToken) return;
          if (idx >= parts.length) {
              if (onDone) onDone();
              return;
          }

          const part = parts[idx] || {};
          const text = (part.text || '').trim();
          if (!text) return next(idx + 1);

          const lang = part.lang || 'zh-TW';
          if (lang.startsWith('zh')) this.ensureCachedVoice();
          if (lang.startsWith('en')) this.ensureEnglishVoice();
          const u = new SpeechSynthesisUtterance(text);
          const isEnglish = lang.startsWith('en');
          u.rate = isEnglish ? 1.0 : this.state.ttsRate;
          u.lang = lang;
          if (u.lang.startsWith('zh') && this._cachedVoice) u.voice = this._cachedVoice;
          if (u.lang.startsWith('en') && this._cachedEnVoice) u.voice = this._cachedEnVoice;

          const advance = () => {
              if (!this.state.autoPlay || token !== this._autoPlayToken) return;
              const gap = Number(part.pauseMs) || 0;
              if (gap > 0) {
                  setTimeout(() => next(idx + 1), gap);
              } else {
                  next(idx + 1);
              }
          };

          u.onend = advance;
          u.onerror = advance;

          window.speechSynthesis.speak(u);
      };

      window.speechSynthesis.cancel();
      next(0);
  },

  cleanDefinitionForTTS(defText) {
      if (!defText) return '';
      let cleaned = String(defText);
      cleaned = cleaned.replace(/\b(?:m|mw|measure word)\s*[:：]\s*[^;|/,\uFF0C\uFF1B]+/gi, '');
      cleaned = cleaned.replace(/\b(measure word|mw)\b\s*[:：]?\s*/gi, '');
      cleaned = cleaned.replace(/\s{2,}/g, ' ').replace(/^[,;/\s]+|[,;/\s]+$/g, '');
      return cleaned.trim();
  },

  extractMeasureWords(defText) {
      if (!defText) return [];
      const text = String(defText);
      const matches = text.match(/\b(?:m|mw|measure word)\s*[:：]\s*[^;|/,\uFF0C\uFF1B]+/gi) || [];
      const words = [];
      matches.forEach(seg => {
          const raw = seg.replace(/^[;|/,\uFF0C\uFF1B]\s*/i, '').replace(/^(?:m|mw|measure word)\s*[:：]\s*/i, '');
          raw.split(/[,/;|\uFF0C\uFF1B\u3001]/g).forEach(part => {
              const hanzi = (part.match(/[\u4e00-\u9fa5]+/g) || []).join('');
              if (hanzi) words.push(hanzi);
          });
      });
      return words;
  },

  startAutoPlay() {
      if (this.state.autoPlay) return;
      this.state.autoPlay = true;
      this._autoPlayToken = (this._autoPlayToken || 0) + 1;
      this._autoPlayJustStarted = true;
      this.saveSettings();
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
  },

  runAutoPlayStep() {
      if (!this.state.autoPlay) return;
      if (!['study', 'sentences'].includes(this.state.mode)) {
          this.stopAutoPlay();
          return;
      }
      if (this.state.isFinished) {
          this.stopAutoPlay();
          return;
      }

      const item = this.state.activeList[this.state.currentIndex];
      if (!item) return;

      if (!this.state.isFlipped) this.toggleFlip(true);

      const hanziText = item.hanzi || item.zh || '';
      const rawDef = item.def || item.en || '';
      const defText = this.cleanDefinitionForTTS(rawDef);
      const measureWords = this.extractMeasureWords(rawDef);

      const gap = 700;
      const parts = [
          { text: hanziText, lang: 'zh-TW', pauseMs: gap }
      ];

      parts.push({ text: defText, lang: 'en-US', pauseMs: gap });

      measureWords.forEach(mw => {
          parts.push({ text: 'measure word', lang: 'en-US', pauseMs: 300 });
          parts.push({ text: mw, lang: 'zh-TW', pauseMs: gap });
      });

      const token = this._autoPlayToken || 0;
      const stepStart = Date.now();
      const isFirstStep = !!this._autoPlayJustStarted;
      this._autoPlayJustStarted = false;
      const minCycleMs = isFirstStep ? 900 : 450;

      this.speakSequence(parts, () => {
          if (!this.state.autoPlay || token !== this._autoPlayToken) return;
          const elapsed = Date.now() - stepStart;
          const waitMs = Math.max(0, minCycleMs - elapsed);
          this._autoPlayTimer = setTimeout(() => {
              if (!this.state.autoPlay || token !== this._autoPlayToken) return;
              this.next(false);
              this._autoPlayTimer = setTimeout(() => this.runAutoPlayStep(), 450);
          }, waitMs);
      });
  },

  updateCardScrollIndicator() {
      const card = document.querySelector('.card');
      if (!card) return;
      
      const back = card.querySelector('.back') || card.querySelector('.card-back') || card.querySelector('.card__face--back');
      if (!back) return;

      const content = back.querySelector('.face-content') || back;
      
      const existing = back.querySelector('.scroll-indicator');

      if (content.scrollHeight > content.clientHeight + 20) {
          if (existing) {
              if (content.scrollTop < 30) existing.classList.add('visible');
              return;
          }

          const indicator = document.createElement('div');
          indicator.className = 'scroll-indicator visible';
          indicator.innerHTML = `<span>Scroll for Examples</span><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/></svg>`;
          
          if (getComputedStyle(back).position === 'static') back.style.position = 'relative';
          back.appendChild(indicator);

          content.onscroll = () => {
              const isVis = indicator.classList.contains('visible');
              if (content.scrollTop > 30) {
                  if (isVis) indicator.classList.remove('visible');
              } else {
                  if (!isVis) indicator.classList.add('visible');
              }
          };
      } else if (existing) {
          existing.remove();
          content.onscroll = null;
      }
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

  speakText(text) {
      if (!text || !window.speechSynthesis) return;
      window.speechSynthesis.cancel();

      const u = new SpeechSynthesisUtterance(text);
      u.rate = this.state.ttsRate;
      u.lang = 'zh-TW';
      
      this.ensureCachedVoice();
      
      if (this._cachedVoice) u.voice = this._cachedVoice;
      
      window._tts_utterances = window._tts_utterances || [];
      window._tts_utterances.push(u);
      const cleanup = () => { window._tts_utterances = window._tts_utterances.filter(x => x !== u); };
      u.onend = cleanup;
      u.onerror = cleanup;
      
      // Slight delay ensures the 3D flip animation starts BEFORE the audio engine hogs the CPU
      setTimeout(() => window.speechSynthesis.speak(u), 50);
  },

  ensureCachedVoice() {
      if (this._cachedVoice || !window.speechSynthesis) return;
      const voices = window.speechSynthesis.getVoices();
      const zhVoices = voices.filter(v => v.lang.toLowerCase().replace('_', '-').includes('zh'));
      if (zhVoices.length > 0) {
          this._cachedVoice = zhVoices.find(v =>
              (v.lang.includes('TW') || v.lang.includes('Hant') || v.name.includes('Taiwan') || v.name.includes('臺灣')) &&
              (v.name.includes('Google') || v.name.includes('Microsoft') || v.name.includes('Siri'))
          ) || zhVoices.find(v => v.lang.includes('TW') || v.lang.includes('Hant') || v.name.includes('Taiwan') || v.name.includes('臺灣'));
      }
  },

  ensureEnglishVoice() {
      if (this._cachedEnVoice || !window.speechSynthesis) return;
      const voices = window.speechSynthesis.getVoices();
      const enVoices = voices.filter(v => v.lang.toLowerCase().replace('_', '-').includes('en'));
      if (enVoices.length > 0) {
          this._cachedEnVoice = enVoices.find(v =>
              (v.lang.includes('US') || v.name.includes('US') || v.name.includes('American')) &&
              (v.name.includes('Google') || v.name.includes('Microsoft') || v.name.includes('Siri'))
          ) || enVoices.find(v => v.lang.includes('US')) || enVoices[0];
      }
  },

  async copyCurrent(e) {
    if (e) e.stopPropagation();
    const item = this.state.activeList[this.state.currentIndex];
    if (!item) return;
    const card = document.querySelector('.card');
    const isShowingExample = card && card.classList.contains('showing-example');
    let text = isShowingExample && this.state.currentExample ? this.state.currentExample.zh : (item.hanzi || item.zh || item.def || '').replace(/[()]/g, '').trim();
    if (!text) return;
    try { await Utils.copyToClipboard(text); UI.showCopyFeedback(); } catch (err) { console.error('Copy failed', err); }
  },

  setupInteraction() {
      if (this._interactionsSetup) return;
      this._interactionsSetup = true;
      // 🌟 FIX: Auto-save the exact millisecond the user switches apps or minimizes the browser
      document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'hidden') {
              this.saveSettings();
          }
      });

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
          if (e.target.closest('button, a, input, textarea, .interactive-char, .hook-edit-btn, [data-action], canvas, svg, .writing-target-inner')) return;
          if (!['study', 'sentences', 'writing'].includes(this.state.mode)) return;

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
              if (this.state.mode === 'writing') {
                  this.state.writingCharIndex = 0;
                  this.state.lastSwipe = 'right';
              }
              this.next(false);
          } else if (e.key === 'ArrowLeft') {
              if (this.state.mode === 'writing') {
                  this.state.writingCharIndex = 0;
                  this.state.lastSwipe = 'left';
              }
              this.prev();
          } else if (e.key === ' ' || e.code === 'Space' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key.toLowerCase() === 'f') {
              e.preventDefault();
              if (this.state.mode !== 'writing') {
                  this.toggleFlip();
              }
          }
      });
  },

  createTapAnimation(x, y) {
      const ripple = document.createElement('div');
      ripple.className = 'tap-ripple';
      ripple.style.left = `${x}px`;
      ripple.style.top = `${y}px`;
      document.body.appendChild(ripple);
      setTimeout(() => ripple.remove(), 400);
  },

 setMode(newMode) {
    if (this.state.mode === newMode) return; 

    this.state.previousMode = this.state.mode;
    
    // Create a filter key so we can check if filters changed while we were away
    const filterKey = JSON.stringify({
        b: this.state.bookFilter,
        l: this.state.lessonFilter,
        d: this.state.dialogueFilter,
        h: this.state.hideLearned,
        s: this.state.separateMode,
        sh: this.state.shuffle
    });

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

    setTimeout(() => {
      try {
        // Snap the layout changes while invisible
        if (newMode === 'writing') {
            document.body.classList.add('focus-mode');
        } else {
            document.body.classList.remove('focus-mode');
        }

        const currentFilterKey = JSON.stringify({
            b: this.state.bookFilter,
            l: this.state.lessonFilter,
            d: this.state.dialogueFilter,
            h: this.state.hideLearned,
            s: this.state.separateMode,
            sh: this.state.shuffle
        });

        if (this.state.modeCache[newMode] && this.state.modeCache[newMode].filterKey === currentFilterKey && this.state.modeCache[newMode].list) {
            this.state.activeList = this.state.modeCache[newMode].list;
            this.state.currentIndex = this.state.modeCache[newMode].index;
            this.state.isFinished = this.state.modeCache[newMode].isFinished || false;
            this.state.sessionMistakes = this.state.modeCache[newMode].sessionMistakes || [];
            this.state.isFlipped = false;
        } else {
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
      // 🌟 PRE-COMPUTE O(1) INVERTED INDEX FOR ALL COMPONENTS THE FIRST TIME
      if (!this._componentIndex) {
          this._componentIndex = {};
          
          const extractComponents = (node, set) => {
              if (!node) return;
              if (node.component) set.add(node.component);
              if (Array.isArray(node.children)) {
                  node.children.forEach(child => extractComponents(child, set));
              }
          };

          Object.values(DATA.CHARS).forEach(c => {
              if (c.deconstruction_tree) {
                  const comps = new Set();
                  extractComponents(c.deconstruction_tree, comps);
                  comps.forEach(comp => {
                      if (comp !== c.hanzi) {
                          if (!this._componentIndex[comp]) this._componentIndex[comp] = [];
                          this._componentIndex[comp].push(c);
                      }
                  });
              }
          });
      }

      return this._componentIndex[char] || [];
  },

  getVocabHint(hz) {
      if (!hz) return null;
      const exact = (DATA.VOCAB_EXACT_MATCH[hz] || []);
      const any = (DATA.VOCAB_BY_CHAR[hz] || []);
      const list = exact.length ? exact : any;
      if (!list.length) return null;
      const sorted = list.slice().sort((a, b) => Number(a.book) - Number(b.book) || Number(a.lesson) - Number(b.lesson));
      const v = sorted[0];
      return {
          book: v.book,
          lesson: v.lesson,
          color: Utils.getBookColor(v.book),
          bg: Utils.getBookBg(v.book),
          isExact: exact.length > 0
      };
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
          <span class="appears-label interactive-char" onclick="App.handleCharClick(event, '${targetChar}')" style="cursor:pointer; display:flex; align-items:center; gap:6px; transition:0.2s;" title="Explore ${targetChar}">
              in ${targetChar} 
              <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
              ${appearsTag}
          </span> 
          <div class="appears-list">${interactive}</div>
      `;

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

  _generateWordHTML(char, vocabMatch, fallbackPy, fallbackDef) {
      const pinyin = vocabMatch ? vocabMatch.pinyin : fallbackPy || '---';
      const def = vocabMatch ? vocabMatch.def : fallbackDef || '---';
      
      let html = `<div class="anatomy-master-container">`;
      
      // Hero Section
      html += `
          <div class="anatomy-hero-section">
              <div class="hero-py">${pinyin}</div>
              <div class="hero-def">${def}</div>
          </div>
      `;

      // Book/Lesson Banner
      if (vocabMatch) {
          const bColor = window.Utils && window.Utils.getBookColor ? Utils.getBookColor(vocabMatch.book) : '#ec4899';
          const bBg = window.Utils && window.Utils.getBookBg ? Utils.getBookBg(vocabMatch.book) : '#fce7f3';
          html += `
              <div class="standalone-banner" style="border-left: 4px solid ${bColor}; background: ${bBg}60; border-radius: 0 12px 12px 0; padding: 10px 16px; margin: 0 0 20px 0; display: flex; align-items: center; justify-content: space-between; gap: 12px;">
                  <div style="display: flex; flex-direction: column; text-align: left; flex: 1; min-width: 0;">
                      <span style="font-family: 'Nunito', sans-serif; font-size: 0.65rem; font-weight: 800; color: ${bColor}; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 2px;">Word Details</span>
                      <span style="font-family: 'Nunito', sans-serif; font-size: 0.95rem; font-weight: 700; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${vocabMatch.def}</span>
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
          const cDef = charData ? (charData.def || '').split(/[,;]/)[0] : '---';
          
          html += `
              <div class="ios17-grid-card interactive-char" onclick="App.handleCharClick(event, '${c}')" title="Explore ${c}">
                  <div class="grid-py">${cPy}</div>
                  <div class="grid-hz">${c}</div>
                  <div class="grid-def">${cDef}</div>
              </div>
          `;
      });
      
      html += `</div></div>`;
      return html;
  },

  _generateCharHeroHTML(char, charData) {
      let displayPinyin = charData.pinyin || '---';
      if (charData.chameleon_alert && charData.chameleon_alert.is_polyphone) {
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
              <div style="font-family: 'Nunito', sans-serif; font-size: 0.9rem; color: var(--text-muted); font-weight: 600; margin-top: 4px;">
                  Sound hint: 
                  <span class="interactive-char" onclick="App.handleCharClick(event, '${clueChar}')" style="cursor: pointer; color: var(--primary); font-family: 'twkai', serif; font-size: 1.2rem; margin: 0 2px;">${clueChar}</span> 
                  (${cluePy})
              </div>
          `;
      }

      return `
          <div class="anatomy-hero-section">
              <div class="hero-py">${displayPinyin}</div>
              ${soundHintHTML}
              <div class="hero-def">${charData.def || ''}</div>
          </div>
      `;
  },

  _generateVocabBannersHTML(char) {
      // Spread into a new array to prevent .sort() from mutating our cached index
      const standaloneVocabs = [...(DATA.VOCAB_EXACT_MATCH[char] || [])].sort((a, b) => {
          if (a.book !== b.book) return parseInt(a.book || 1) - parseInt(b.book || 1);
          return parseInt(a.lesson || 0) - parseInt(b.lesson || 0);
      });

      if (standaloneVocabs.length === 0) return '';

      const primaryVocab = standaloneVocabs[0];
      const bColor = window.Utils && window.Utils.getBookColor ? Utils.getBookColor(primaryVocab.book) : '#ec4899';
      const bBg = window.Utils && window.Utils.getBookBg ? Utils.getBookBg(primaryVocab.book) : '#fce7f3';

      if (standaloneVocabs.length === 1) {
          return `
              <div class="standalone-banner" style="border-left: 4px solid ${bColor}; background: ${bBg}60; border-radius: 0 12px 12px 0; padding: 10px 16px; margin: 0 0 20px 0; display: flex; align-items: center; justify-content: space-between; gap: 12px;">
                  <div style="display: flex; flex-direction: column; text-align: left; flex: 1; min-width: 0;">
                      <span style="font-family: 'Nunito', sans-serif; font-size: 0.65rem; font-weight: 800; color: ${bColor}; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 2px;">Book Vocab</span>
                      <div style="display: flex; align-items: baseline; gap: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                          <span style="font-family: 'Nunito', sans-serif; font-size: 0.95rem; font-weight: 700; color: var(--text-main);">${primaryVocab.def}</span>
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
                              <span style="font-family: 'Nunito', sans-serif; font-size: 0.95rem; font-weight: 700; color: var(--text-main);">${primaryVocab.def}</span>
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
                                  return `
                                  <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px;">
                                      <div style="display: flex; flex-direction: column; flex: 1; min-width: 0;">
                                          <span style="font-family: 'Nunito', sans-serif; font-size: 0.9rem; font-weight: 700; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${v.def}</span>
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
                  <div class="appears-in-row" id="${rowId}">
                      <span class="appears-label interactive-char" onclick="App.handleCharClick(event, '${charStr}', '${safePy}', '${safeDef}')" style="cursor:pointer; display:flex; align-items:center; gap:6px; transition:0.2s;" title="Explore ${charStr}">
                          in ${charStr} 
                          <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
                          ${appearsTag}
                      </span> 
                      <div class="appears-list">${interactive}</div>
                  </div>
              `;
          }

          const clickAttr = hasExpandedContent ? `onclick="this.classList.toggle('expanded')"` : '';
          
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
        <div class="dna-section-title" style="margin-top:24px;">Your Mnemonics</div>
        <div class="hook-card">
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
      `;
  },

  _generateNetworkHTML(char) {
      let html = [];
      const buildsChars = this.findRelatedCharacters(char);

      if (buildsChars.length > 0) {
          const totalBuilds = buildsChars.length;
          const grouped = {};
          buildsChars.forEach((c) => {
              const hint = this.getVocabHint(c.hanzi);
              const key = hint ? `B${hint.book}` : 'Other';
              if (!grouped[key]) grouped[key] = { hint, items: [] };
              grouped[key].items.push({ c, hint });
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
                  <div class="component-group">
                      <div class="component-group-header" ${headerStyle} onclick="this.parentElement.classList.toggle('collapsed')">
                          <span class="component-group-title">${title}</span>
                          <svg class="component-group-chevron" viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/></svg>
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
                      <span>Acts as a component (${totalBuilds})</span>
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

  handleCharClick(e, char, fallbackPy = '', fallbackDef = '', isBackNavigation = false) {
      if (e) e.stopPropagation(); 
      
      const modal = document.getElementById('charModal');
      const wasOpen = modal ? modal.classList.contains('open') : false;
      
      // 🌟 HISTORY TRACKING LOGIC
      if (!wasOpen) {
          // If opening fresh, reset history
          this.state.charHistory = [];
      } else if (!isBackNavigation && this.state.currentCharModal && this.state.currentCharModal !== char) {
          // If already open and diving deeper, push current to history
          this.state.charHistory.push(this.state.currentCharModal);
      }
      this.state.currentCharModal = char;

      if (modal) modal.classList.add('open'); 

      // 🌟 SCROLL TO TOP LOGIC
      const modalContent = document.getElementById('charModalContent');
      if (modalContent) modalContent.scrollTop = 0;
      
      // 🌟 DYNAMIC BACK BUTTON INJECTION
      if (modalContent) {
          const modalHeader = modalContent.querySelector('h3');
          if (modalHeader) {
              if (this.state.charHistory.length > 0) {
                  modalHeader.innerHTML = `
                      <div style="display:flex; justify-content:space-between; align-items:center; width:100%; margin-top: -6px;">
                          <button style="background:rgba(255,158,181,0.15); border:none; padding:6px 12px; border-radius:12px; cursor:pointer; color:var(--primary-dark); display:flex; align-items:center; gap:4px; font-family:'Nunito', sans-serif; font-weight:800; font-size:0.9rem; transition:transform 0.2s;" onclick="App.goBackChar(event)" onmousedown="this.style.transform='scale(0.95)'" onmouseup="this.style.transform='scale(1)'">
                              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z"/></svg> Back
                          </button>
                          <span style="color:var(--text-muted); font-size:0.8rem; text-transform:uppercase; letter-spacing:1px; font-weight:800;">Lookup</span>
                      </div>
                  `;
              } else {
                  modalHeader.innerHTML = 'Character Lookup';
              }
          }
      }

      const display = document.getElementById('charDisplay');
      const detail = document.getElementById('charDetail');
      const relatedContainer = document.getElementById('charRelated');
      const link = document.getElementById('charLink');
      const strokeOrderContainer = document.getElementById('strokeOrderContainer');
      const strokeOrderFallback = document.getElementById('strokeOrderFallback');
      const strokeOrderSpinner = document.getElementById('strokeOrderSpinner');
      
      display.style.display = 'none'; 
      relatedContainer.innerHTML = '';

      // Helper to toggle scroll indicator based on actual content height
      const updateScrollIndicator = () => {
          const ind = document.getElementById('scrollIndicator');
          const cont = document.getElementById('charModalContent');
          if (ind && cont) {
              const isScrollable = cont.scrollHeight > cont.clientHeight + 20;
              if (isScrollable) {
                  ind.classList.add('visible');
                  cont.onscroll = () => {
                      if (cont.scrollTop > 50 && ind.classList.contains('visible')) {
                          ind.classList.remove('visible');
                      }
                  };
              } else {
                  ind.classList.remove('visible');
              }
          }
      };
      
      // ✨ FIX: MULTI-CHARACTER WORD CHECK
      // Check if the string has more than 1 Chinese character
      const hanziChars = char.match(/[\u4e00-\u9fa5]/g) || [];
      
      if (hanziChars.length > 1) {
          // This is a WORD, not a single character. Break it down!
          const vocabMatch = (DATA.VOCAB_EXACT_MATCH[char] || [])[0];
          detail.innerHTML = this._generateWordHTML(char, vocabMatch, fallbackPy, fallbackDef);
          link.href = `https://hanzicraft.com/character/${char}`;
          
          // Disable stroke order animation for multi-character words
          if(strokeOrderContainer) strokeOrderContainer.style.display = 'none';
          if(strokeOrderSpinner) strokeOrderSpinner.classList.add('hidden');
          if(strokeOrderFallback) {
              strokeOrderFallback.classList.remove('hidden');
              strokeOrderFallback.innerHTML = `<div class="static-fallback-char" style="font-size: clamp(3rem, 15vw, 5rem); letter-spacing: 5px;">${char}</div>`;
          }
          setTimeout(updateScrollIndicator, 100);
          return; // Exit early since we rendered a word
      }

      // --- SINGLE CHARACTER LOGIC (Continues exactly as before) ---
      let charData = DATA.CHARS[char];
      let isFallback = false;

      if (!charData) {
          isFallback = true;
          this.buildCharacterIndices(); // Ensures fallback index exists instantly
          
          let foundTree = this._fallbackTreeIndex[char] || null;

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
      
      let html = `<div class="anatomy-master-container">`;

      const sheet = detail.closest('.modal-sheet');
      if (sheet) {
          const oldBadge = sheet.querySelector('.rank-sticker');
          if (oldBadge) oldBadge.remove();
          
          if (charData.street_utility && charData.street_utility.frequency_rank) {
              const rank = charData.street_utility.frequency_rank;
              let rankText = "Rare";
              let rankClass = "rank-rare";
              
              if (rank <= 500) { rankText = "Very Common"; rankClass = "rank-very-common"; }
              else if (rank <= 1500) { rankText = "Common"; rankClass = "rank-common"; }
              else if (rank <= 3000) { rankText = "Uncommon"; rankClass = "rank-uncommon"; }

              const badge = document.createElement('div');
              badge.className = `rank-sticker ${rankClass}`;
              badge.textContent = rankText;
              badge.style.zIndex = '100'; // Fix: Ensures the badge floats above the card content
              sheet.appendChild(badge);
          }
      }

      html += this._generateCharHeroHTML(char, charData);
      html += this._generateVocabBannersHTML(char);
      html += this._generateDeconstructionHTML(char, charData);
      html += this._generateHookHTML(char, charData);
      html += this._generateNetworkHTML(char);
      
      html += `</div>`; 
      
      detail.innerHTML = html;
      link.href = `https://hanzicraft.com/character/${char}`;

      setTimeout(updateScrollIndicator, 100);

      if (char.length === 1 && /[\u4e00-\u9fa5]/.test(char)) {
          strokeOrderContainer.style.display = 'none';
          strokeOrderFallback.classList.add('hidden');
          strokeOrderSpinner.classList.remove('hidden');
          
          // Cleanup previous writer to prevent memory leaks and choppy animations
          if (this.state.currentWriter) {
              try { this.state.currentWriter.cancelQuiz(); } catch(e){}
              try { this.state.currentWriter.hideCharacter(); } catch(e){}
              try { 
                  if (typeof this.state.currentWriter.destroy === 'function') {
                      this.state.currentWriter.destroy(); 
                  }
              } catch(e){}
              this.state.currentWriter = null;
              strokeOrderContainer.onclick = null;
          }

          if (this.animTimeout) clearTimeout(this.animTimeout);
          this.animTimeout = setTimeout(async () => {
              await this.loadHanziWriter();
              if (typeof HanziWriter === 'undefined') {
                  strokeOrderSpinner.classList.add('hidden');
                  strokeOrderFallback.classList.remove('hidden');
                  return;
              }
              strokeOrderContainer.innerHTML = '';
              this.state.currentWriter = HanziWriter.create('strokeOrderContainer', char, {
                  renderer: 'canvas', // 🌟 Switch to canvas for better drawing performance
                  width: 150, height: 150, padding: 5, showOutline: App.state.writingShowOutline,
                  strokeAnimationSpeed: 1, delayBetweenStrokes: 100,
                  strokeColor: '#ff9eb5', radicalColor: '#8b5cf6',
                  onLoadCharDataSuccess: () => {
                      strokeOrderSpinner.classList.add('hidden');
                      strokeOrderContainer.style.display = 'block';
                      this.state.currentWriter.animateCharacter({ onComplete: () => { /* Animation loop handled by user interaction or re-trigger if needed */ } });
                  },
                  onLoadCharDataError: () => {
                      if(strokeOrderSpinner) strokeOrderSpinner.classList.add('hidden');
                      if(strokeOrderContainer) strokeOrderContainer.style.display = 'none';
                      if(strokeOrderFallback) {
                          strokeOrderFallback.classList.remove('hidden');
                          strokeOrderFallback.innerHTML = `<div class="static-fallback-char">${char}</div>`;
                      }
                  }
              });
              strokeOrderContainer.onclick = () => { this.state.currentWriter.animateCharacter(); };
          }, 200);
      } else {
          if(strokeOrderSpinner) strokeOrderSpinner.classList.add('hidden');
          if(strokeOrderContainer) strokeOrderContainer.style.display = 'none';
          if(strokeOrderFallback) {
              strokeOrderFallback.classList.remove('hidden');
              strokeOrderFallback.innerHTML = `<div class="static-fallback-char">${char}</div>`;
          }
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
        if (text) text.textContent = "Initialization Failed.";
        if (fill) fill.style.background = "#ef4444";
        
        const c = document.getElementById('mainContainer');
        if(c) {
            c.innerHTML = `<div style="padding:20px;text-align:center;position:relative;z-index:10000;">App failed to load.<br><button class="btn-sec" onclick="localStorage.clear();location.reload()" style="margin-top:10px;">Reset Everything</button></div>`;
        }
    }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js');
  });
}
