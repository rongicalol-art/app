const DATA = {
  VOCAB: [],
  SENTENCES: [],
  SENTENCES_BY_LESSON: {},
  CHARS: {},
  FALLBACK_DEFS: {}
};

window.App = null;

const App = {
  state: {
    mode: 'study',
    bookFilter: '1',
    lessonFilter: ['All'],
    shuffle: false,
    currentIndex: 0,
    isFlipped: false,
    skipFlipAnimationOnce: false,
    ttsRate: 0.45,
    quizType: 'vocab',
    quizDefOnly: false,
    noPinyin: false,
    noHanziColor: false,
    noTranslation: false,
    separateMode: 'off',
    fastNext: false,
    listeningHard: false,
    listeningToneTest: false,
    writingShowOutline: true,
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
    hideLearned: true
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

    this.updateActiveList();
    
    if (this.state.activeList.length === 0 && DATA.VOCAB.length > 0) {
      this.state.lessonFilter = ['All'];
      this.updateActiveList();
      this.saveSettings();
    }
    
    UI.init();
    UI.render();
  },

  async importData() {
    // 1. Process Characters (UPDATED FOR NEW JSON FORMAT)
    if (window.CHARS_DATA) {
        // Check if it's the new dictionary format (Object) and not an Array
        if (!Array.isArray(window.CHARS_DATA)) {
            for (const [hanzi, charData] of Object.entries(window.CHARS_DATA)) {
                // Standardize the keys for the rest of the app
                DATA.CHARS[hanzi] = {
                    ...charData, 
                    hanzi: hanzi,
                    pinyin: Array.isArray(charData.pinyin) ? Utils.formatNumberedPinyin(charData.pinyin[0]) : charData.pinyin,
                    def: charData.meaning
                };
            }
        } else {
            // Fallback just in case it ever reads the old array format
            window.CHARS_DATA.forEach(c => {
                DATA.CHARS[c.hanzi] = { ...c, def: c.meaning || c.definition, decomposition: c.components };
            });
        }
    }

    // 2. Process Vocab
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
                searchKey: Utils.normalizeSearch(`${hanzi}${v.pinyin}${v.definition}`)
            });
        }
    });
    DATA.VOCAB = Array.from(vocabMap.values());

    // 3. Process Sentences
    DATA.SENTENCES = [];
    DATA.SENTENCES_BY_LESSON = {};
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
            dialogue: s.dialogue_id || 0,
            seq: parseInt(s.sentence_id || 0, 10),
            searchKey: Utils.normalizeSearch(`${s.sentence}${s.pinyin}${s.english}`)
        };
        DATA.SENTENCES.push(entry);
        const key = `${book}-${lesson}`;
        if (!DATA.SENTENCES_BY_LESSON[key]) DATA.SENTENCES_BY_LESSON[key] = [];
        DATA.SENTENCES_BY_LESSON[key].push(entry);
    });

    // 4. Load Custom Hooks
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
        this.state.bookFilter = parsed.bookFilter || '1';
        this.state.lessonFilter = parsed.lessonFilter || ['All'];
        if (!Array.isArray(this.state.lessonFilter)) this.state.lessonFilter = [this.state.lessonFilter];
        this.state.shuffle = parsed.shuffle || false;
        this.state.ttsRate = parsed.ttsRate || 0.45;
        this.state.quizType = (parsed.quizType === 'translate' && DATA.SENTENCES.length > 0) ? 'translate' : 'vocab';
        this.state.quizDefOnly = parsed.quizDefOnly || false;
        this.state.noPinyin = parsed.noPinyin || false;
        this.state.noHanziColor = parsed.noHanziColor || false;
        this.state.noTranslation = parsed.noTranslation || false;
        this.state.separateMode = parsed.separateMode || 'off';
        this.state.fastNext = parsed.fastNext || false;
        this.state.listeningHard = parsed.listeningHard || false;
        this.state.listeningToneTest = parsed.listeningToneTest || false;
        this.state.writingShowOutline = parsed.writingShowOutline ?? true;
        this.state.showHooks = parsed.showHooks ?? true;
        this.state.streak = parsed.streak || 0;
        this.state.hideLearned = parsed.hideLearned !== undefined ? parsed.hideLearned : true;
      } catch (e) {
        localStorage.removeItem('fc_settings');
      }
    }
  },

  saveSettings() {
    localStorage.setItem('fc_settings', JSON.stringify({
      bookFilter: this.state.bookFilter,
      lessonFilter: this.state.lessonFilter,
      shuffle: this.state.shuffle,
      ttsRate: this.state.ttsRate,
      quizType: this.state.quizType,
      quizDefOnly: this.state.quizDefOnly,
      noPinyin: this.state.noPinyin,
      noHanziColor: this.state.noHanziColor,
      noTranslation: this.state.noTranslation,
      separateMode: this.state.separateMode,
      fastNext: this.state.fastNext,
      listeningHard: this.state.listeningHard,
      listeningToneTest: this.state.listeningToneTest,
      writingShowOutline: this.state.writingShowOutline,
      showHooks: this.state.showHooks,
      streak: this.state.streak,
      hideLearned: this.state.hideLearned
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

  saveLearned() {
    localStorage.setItem('fc_learned_items', JSON.stringify(Array.from(this.state.learnedItems)));
  },

  updateActiveList() {
    let source = [];
    let fromVocab = false;
    if (this.state.mode === 'listening') {
      source = this.state.listeningHard ? DATA.SENTENCES : DATA.VOCAB;
      fromVocab = !this.state.listeningHard;
    } else if (this.state.mode === 'writing') {
      source = DATA.VOCAB;
      fromVocab = true;
    } else if (this.state.mode === 'sentences' || this.state.mode === 'builder' || this.state.quizType === 'translate') {
      source = DATA.SENTENCES;
    } else {
      source = DATA.VOCAB;
      fromVocab = true;
    }

    let filtered = source.filter(i => {
        const bookMatch = this.state.bookFilter === 'All' || String(i.book) === this.state.bookFilter;
        const lessonMatch = this.state.lessonFilter.includes('All') || this.state.lessonFilter.includes(String(i.lesson));
        const id = i.id || i.hanzi || i.zh;
        const isLearned = this.state.learnedItems.has(id);
        const learnedMatch = !this.state.hideLearned || !isLearned;
        return bookMatch && lessonMatch && learnedMatch;
    });
    
    if (fromVocab) {
      if (this.state.mode !== 'writing') {
          if (this.state.separateMode === 'all') {
            filtered = Utils.expandVocabToChars(filtered, { includeSingles: true });
          } else if (this.state.separateMode === 'multiOnly') {
            filtered = Utils.expandVocabToChars(filtered, { includeSingles: false });
          }
      }
    }
    
    if (this.state.shuffle) {
      filtered = [...filtered].sort(() => Math.random() - 0.5);
    } else {
      filtered.sort((a, b) => {
        if (a.book !== b.book) return a.book.localeCompare(b.book);
        const aL = parseInt(a.lesson) || 0;
        const bL = parseInt(b.lesson) || 0;
        if (aL !== bL) return aL - bL;
        return (a.seq || 0) - (b.seq || 0);
      });
    }

    this.state.activeList = filtered;
    this.state.isFinished = false;
    this.state.currentIndex = 0;
    this.state.sessionMistakes = []; 
    this.state.isFlipped = false;
    this.state.quizStats = { correct: 0, total: filtered.length };
    this.state.builderTokens = [];
    this.state.builderAnswer = [];
  },

  animateAndRender(direction) {
      const skipAnimationModes = ['writing', 'list']; 
      if (skipAnimationModes.includes(this.state.mode)) {
          return UI.render();
      }

      const container = document.getElementById('mainContainer');
      if (!container) return UI.render();
      
      const innerWrapper = container.firstElementChild;
      if (!innerWrapper) return UI.render();

      const currentHeight = container.clientHeight;
      container.style.minHeight = `${currentHeight}px`;

      innerWrapper.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
      innerWrapper.style.opacity = '0';
      innerWrapper.style.transform = direction === 'next' ? 'translateX(-30px)' : 'translateX(30px)';

      setTimeout(() => {
          UI.render();
          const newWrapper = container.firstElementChild;
          if (newWrapper) {
              newWrapper.style.animation = 'none'; 
              newWrapper.style.opacity = '0';
              newWrapper.style.transform = direction === 'next' ? 'translateX(30px)' : 'translateX(-30px)';
              
              void newWrapper.offsetWidth; 
              
              newWrapper.style.transition = 'opacity 0.35s cubic-bezier(0.2, 0.8, 0.2, 1), transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)';
              newWrapper.style.opacity = '1';
              newWrapper.style.transform = 'translateX(0)';
          }
          setTimeout(() => container.style.minHeight = '', 400);
      }, 200);
  },

  markLearned(isLearned) {
    const item = this.state.activeList[this.state.currentIndex];
    if (!item) return;
    const id = item.id || item.hanzi || item.zh;
    if (!id) return;

    if (isLearned) {
        this.state.learnedItems.add(id);
        UI.showToast("Marked as Learned");
    } else {
        this.state.learnedItems.delete(id);
        UI.showToast("Marked as Not Learned");
    }
    this.saveLearned();

    if (this.state.hideLearned && isLearned) {
        this.state.activeList.splice(this.state.currentIndex, 1);
        if (this.state.currentIndex >= this.state.activeList.length) {
            this.state.currentIndex = 0;
            if (this.state.activeList.length > 0) {
                UI.showToast("Round complete! Reviewing remaining.");
                if (this.state.shuffle) this.state.activeList.sort(() => Math.random() - 0.5);
            }
        }
        this.state.isFlipped = false;
        this.state.skipFlipAnimationOnce = true;
        this.animateAndRender('next'); 
    } else {
        this.next();
    }
  },

  next() {
    if(this.state.activeList.length === 0) return;
    const isGameMode = ['quiz', 'listening', 'writing', 'builder'].includes(this.state.mode);
    if (isGameMode && this.state.currentIndex === this.state.activeList.length - 1) {
        this.state.isFinished = true;
        return this.animateAndRender('next');
    }
    const nextIndex = this.state.currentIndex + 1;
    if (nextIndex >= this.state.activeList.length) {
        this.state.currentIndex = 0;
        if (this.state.mode === 'study') {
            UI.showToast("Round complete! Restarting.");
            if (this.state.shuffle) this.state.activeList.sort(() => Math.random() - 0.5);
        }
    } else {
        this.state.currentIndex = nextIndex;
    }
    this.state.isFlipped = false;
    this.state.skipFlipAnimationOnce = true;
    this.state.builderTokens = [];
    this.state.builderAnswer = [];
    this.animateAndRender('next'); 
  },

  prev() {
    if(this.state.activeList.length === 0) return;
    this.state.currentIndex = (this.state.currentIndex - 1 + this.state.activeList.length) % this.state.activeList.length;
    this.state.isFlipped = false;
    this.state.skipFlipAnimationOnce = true;
    this.state.builderTokens = [];
    this.state.builderAnswer = [];
    this.animateAndRender('prev'); 
  },

  toggleFlip() {
    this.state.isFlipped = !this.state.isFlipped;
    if(this.state.isFlipped) this.speakCurrent();
    UI.updateFlipState();
  },

  speakCurrent() {
    const item = this.state.activeList[this.state.currentIndex];
    if(!item) return;
    const card = document.querySelector('.card');
    const isShowingExample = card && card.classList.contains('showing-example');
    if (isShowingExample && this.state.currentExample) Utils.speak(this.state.currentExample.zh, this.state.ttsRate);
    else Utils.speak(item.hanzi || item.zh, this.state.ttsRate, item.audio);
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

  setMode(newMode) {
    if (this.state.mode === newMode) return; 

    if (newMode === 'writing') {
        document.body.classList.add('focus-mode');
    } else {
        document.body.classList.remove('focus-mode');
    }

    this.state.modeCache[this.state.mode] = {
        list: this.state.activeList, index: this.state.currentIndex,
        isFinished: this.state.isFinished, sessionMistakes: this.state.sessionMistakes
    };

    const container = document.getElementById('mainContainer');
    const modeOrder = { 'list': 0, 'study': 1, 'sentences': 2, 'builder': 3, 'writing': 4, 'quiz': 5, 'listening': 6 };
    const isGoingRight = (modeOrder[newMode] || 0) > (modeOrder[this.state.mode] || 0);

    const startHeight = container.clientHeight;
    container.style.minHeight = `${startHeight}px`;
    container.style.pointerEvents = 'none'; 
    
    this.state.mode = newMode; 
    UI.updateNavHighlight(); 

    container.style.transition = 'opacity 0.2s cubic-bezier(0.4, 0, 1, 1), transform 0.2s cubic-bezier(0.4, 0, 1, 1)';
    container.style.opacity = '0';
    container.style.transform = isGoingRight ? 'translateX(-40px)' : 'translateX(40px)';

    setTimeout(() => {
      try {
        if (this.state.modeCache[newMode]) {
            this.state.activeList = this.state.modeCache[newMode].list;
            this.state.currentIndex = this.state.modeCache[newMode].index;
            this.state.isFinished = this.state.modeCache[newMode].isFinished || false;
            this.state.sessionMistakes = this.state.modeCache[newMode].sessionMistakes || [];
            this.state.isFlipped = false;
            this.state.builderTokens = [];
            this.state.builderAnswer = [];
        } else {
            this.updateActiveList();
        }
        
        UI.render(); 
        UI.updateStreak();

        container.style.transition = 'none';
        container.style.transform = isGoingRight ? 'translateX(40px)' : 'translateX(-40px)';
        void container.offsetWidth; 

        container.style.transition = 'opacity 0.35s cubic-bezier(0.2, 0.8, 0.2, 1), transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)';
        container.style.opacity = '1';
        container.style.transform = 'translateX(0)';

      } catch (e) {
        console.error(e);
        container.innerHTML = `<div style="text-align:center; padding:20px; color:red;">Something went wrong.<br><button class="btn-sec" onclick="localStorage.clear(); location.reload();" style="margin-top:10px;">Reset App</button></div>`;
      } finally {
        setTimeout(() => {
            container.style.minHeight = '';
            container.style.pointerEvents = 'auto';
        }, 350);
      }
    }, 200); 
  },

handleCharClick(e, char) {
      if (e) e.stopPropagation();
      const modal = document.getElementById('charModal');
      const display = document.getElementById('charDisplay');
      const detail = document.getElementById('charDetail');
      const relatedContainer = document.getElementById('charRelated');
      const link = document.getElementById('charLink');
      
      const charData = DATA.CHARS[char];

      display.style.display = 'none'; 
      relatedContainer.innerHTML = '';
      
      let html = `<div class="blueprint-container">`;

      if (charData) {
          // 1. HERO SECTION
          let tags = '';
          if (charData.street_utility?.frequency_rank) tags += `<div class="bp-tag">Rank ${charData.street_utility.frequency_rank}</div>`;
          if (charData.chameleon_alert?.is_polyphone) tags += `<div class="bp-tag" style="background:#f3e8ff; color:#7e22ce; border-color:#e9d5ff;">Polyphone</div>`;

          html += `
              <div class="blueprint-hero">
                  <div class="bp-char">${char}</div>
                  <div class="bp-meta">
                      <div class="bp-py">${charData.pinyin || ''}</div>
                      <div class="bp-def">${charData.def || ''}</div>
                      ${tags ? `<div class="bp-tags">${tags}</div>` : ''}
                  </div>
              </div>
          `;

          // 2. COMPONENT CARDS (The Anatomy Grid)
          if (charData.deconstruction_tree && charData.deconstruction_tree.children) {
              let cardsHTML = '';
              
              charData.deconstruction_tree.children.forEach(child => {
                  const charStr = child.component || '?';
                  const pyRaw = Array.isArray(child.pinyin) ? child.pinyin[0] : (child.pinyin || '');
                  const py = Utils.formatNumberedPinyin(pyRaw);
                  const def = (child.meaning || '').split(/[,;]/)[0]; // Keep it short and clean

                  // If this component is made of smaller strokes/pieces, put them in tiny pills
                  let subPills = '';
                  if (child.children && child.children.length > 0) {
                      const subChars = child.children.map(c => c.component).filter(Boolean);
                      if (subChars.length > 0) {
                          subPills = `<div class="bp-subcomponents">` + 
                                     subChars.map(c => `<div class="bp-sub-pill">${c}</div>`).join('') + 
                                     `</div>`;
                      }
                  }

                  cardsHTML += `
                      <div class="bp-card">
                          <div class="bp-card-char">${charStr}</div>
                          ${py ? `<div class="bp-card-py">${py}</div>` : ''}
                          <div class="bp-card-def" title="${child.meaning || ''}">${def}</div>
                          ${subPills}
                      </div>
                  `;
              });

              html += `
                  <div>
                      <div class="bp-section-title">Composition</div>
                      <div class="blueprint-grid">${cardsHTML}</div>
                  </div>
              `;
          }
      } else {
          // Fallback if data is missing
          display.style.display = 'block';
          display.textContent = char;
          const fallbackDef = DATA.FALLBACK_DEFS[char] || "No detailed breakdown available yet.";
          html += `<div style="text-align:center; padding: 20px 0; color: #64748b; font-weight: 600;">${fallbackDef}</div>`;
      }

      // 3. MEMORY HOOK (Sleek Theme Override)
      let activeHook = charData ? charData.hook : '';
      html += `
        <div class="bp-hook-box">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px;">
                <div class="bp-section-title" style="margin:0;">Memory Hook</div>
                <button class="btn-icon" data-action="edit-hook" data-char="${char}" style="width:32px; height:32px; background:white; color:var(--primary); border:1px solid #e2e8f0; border-radius:8px; display:flex; justify-content:center; align-items:center; cursor:pointer;"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></button>
            </div>
            <div id="hook-display-${char}" style="font-family: 'Nunito', sans-serif; font-size:1.05rem; color:#334155; font-style:italic; line-height: 1.5;">
                ${activeHook ? Utils.createBreakdown(activeHook) : '<span style="color:#cbd5e1; font-size:0.95rem;">Save a custom mnemonic here.</span>'}
            </div>
            <div id="hook-editor-${char}" style="display:none; margin-top:16px;">
                <textarea id="hook-input-${char}" style="width:100%; min-height:80px; padding:12px; font-size:1rem; border-radius:12px; background:white; border:1px solid #cbd5e1; outline:none; font-family: 'Nunito', sans-serif; color:#334155; resize:none; box-sizing:border-box;" placeholder="Enter memory hook...">${activeHook || ''}</textarea>
                <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:12px;">
                    <button class="btn-sec" data-action="cancel-edit-hook" data-char="${char}" style="padding:8px 16px; font-size:0.85rem; border:none; background:transparent; color:#64748b; cursor:pointer;">Cancel</button>
                    <button class="btn-main" data-action="save-hook" data-char="${char}" style="padding:8px 20px; font-size:0.85rem; border-radius:8px; cursor:pointer;">Save Hook</button>
                </div>
            </div>
        </div>
      </div>`; // Close blueprint-container

      detail.innerHTML = html;
      link.href = `https://pleco.com/s/${char}`;

      // 4. STROKE ORDER ANIMATION (Kept intact)
      const strokeOrderContainer = document.getElementById('strokeOrderContainer');
      const strokeOrderFallback = document.getElementById('strokeOrderFallback');
      const strokeOrderSpinner = document.getElementById('strokeOrderSpinner');

      if (char.length === 1 && typeof HanziWriter !== 'undefined' && /[\u4e00-\u9fa5]/.test(char)) {
          strokeOrderContainer.style.display = 'none';
          if (!charData) display.style.display = 'none';
          strokeOrderFallback.classList.add('hidden');
          strokeOrderSpinner.classList.remove('hidden');
          
          if (this.animTimeout) clearTimeout(this.animTimeout);
          this.animTimeout = setTimeout(() => {
              strokeOrderContainer.innerHTML = '';
              const writer = HanziWriter.create('strokeOrderContainer', char, {
                  width: 150, height: 150, padding: 5, showOutline: true,
                  strokeAnimationSpeed: 1, delayBetweenStrokes: 100,
                  strokeColor: '#ff9eb5', radicalColor: '#8b5cf6',
                  onLoadCharDataSuccess: () => {
                      strokeOrderSpinner.classList.add('hidden');
                      strokeOrderContainer.style.display = 'block';
                      loop();
                  },
                  onLoadCharDataError: () => {
                      strokeOrderSpinner.classList.add('hidden');
                      strokeOrderContainer.style.display = 'none';
                      if (!charData) display.style.display = '';
                      strokeOrderFallback.classList.remove('hidden');
                  }
              });
              const loop = () => { writer.animateCharacter({ onComplete: () => { this.animTimeout = setTimeout(loop, 2000); } }); };
              strokeOrderContainer.onclick = () => { if (this.animTimeout) clearTimeout(this.animTimeout); loop(); };
          }, 200);
      } else {
          strokeOrderContainer.style.display = 'none';
          if (!charData) display.style.display = '';
          strokeOrderFallback.classList.add('hidden');
          strokeOrderSpinner.classList.add('hidden');
      }



      // 5. INITIALIZE VIS.JS NETWORK
      // We must do this AFTER modal.classList.add('open') so the canvas sizes itself properly!
      if (charData && charData.deconstruction_tree && charData.deconstruction_tree.children && typeof vis !== 'undefined') {
          setTimeout(() => {
              const nodes = [];
              const edges = [];
              let nodeIdCounter = 1;

              const parseTree = (node, parentId = null) => {
                  if (!node) return;
                  const currentId = nodeIdCounter++;
                  const charStr = node.component || '?';
                  const pyRaw = Array.isArray(node.pinyin) ? node.pinyin[0] : (node.pinyin || '');
                  const py = Utils.formatNumberedPinyin(pyRaw);
                  const def = (node.meaning || '').split(/[,;]/)[0]; // Use short definition for tooltip

                  const isRoot = parentId === null;

                  nodes.push({
                      id: currentId,
                      label: `${charStr}\n${py}`,
                      title: def, // Tooltip that appears on hover
                      shape: 'box',
                      margin: 12,
                      color: {
                          background: isRoot ? '#fff0f5' : '#ffffff',
                          border: isRoot ? '#ff9eb5' : '#cbd5e1',
                          highlight: { background: '#ffffff', border: '#ff85a2' }
                      },
                      font: { face: 'twkai, sans-serif', size: isRoot ? 28 : 18, color: '#887888' },
                      borderWidth: 2
                  });

                  if (parentId !== null) {
                      edges.push({
                          from: parentId,
                          to: currentId,
                          color: { color: '#cbd5e1', highlight: '#ff9eb5' },
                          width: 2,
                          arrows: 'to'
                      });
                  }

                  if (node.children) {
                      node.children.forEach(child => parseTree(child, currentId));
                  }
              };

              parseTree(charData.deconstruction_tree);

              const container = document.getElementById('anatomyNetwork');
              const data = { nodes: new vis.DataSet(nodes), edges: new vis.DataSet(edges) };
              const options = {
                  layout: {
                      hierarchical: {
                          direction: 'UD', // Up to Down tree
                          sortMethod: 'directed',
                          nodeSpacing: 120,
                          levelSeparation: 90
                      }
                  },
                  physics: { enabled: false }, // Disables bouncing so it stays looking like a clean tree
                  interaction: { dragNodes: true, zoomView: true, dragView: true, hover: true }
              };
              
              new vis.Network(container, data, options);
          }, 100); // 100ms delay ensures the modal is fully visible before drawing
      }
  }
}; 

window.App = App;

const startApp = async () => {
    const loader = document.getElementById('hqLoader');
    const fill = document.getElementById('hqProgressFill');
    const text = document.getElementById('hqLoadingText');
    
    const phrases = ["Preparing...", "Loading data...", "Setting up...", "Almost ready..."];
    let phraseIndex = 0;
    
    const textInterval = setInterval(() => {
        if (!text) return;
        text.style.opacity = '0';
        setTimeout(() => {
            text.textContent = phrases[phraseIndex % phrases.length];
            text.style.opacity = '1';
            phraseIndex++;
        }, 300);
    }, 800);

    try {
        if (fill) fill.style.width = '30%';
        await App.init(); 
        if (fill) fill.style.width = '70%';

        setTimeout(() => {
            if (fill) fill.style.width = '100%';
            if (text) text.textContent = "Ready!";
            clearInterval(textInterval);
            
            setTimeout(() => {
                if (loader) {
                    loader.classList.add('fade-out');
                    setTimeout(() => loader.remove(), 700);
                }
            }, 600); 
            
        }, 800);

    } catch (e) {
        console.error("App Init Failed:", e);
        clearInterval(textInterval);
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