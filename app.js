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
    // 1. Process Characters
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
  
  findRelatedCharacters(char) {
      const containsComponent = (node, target) => {
          if (!node) return false;
          if (node.component === target) return true;
          if (Array.isArray(node.children)) {
              return node.children.some(child => containsComponent(child, target));
          }
          return false;
      };

      return Object.values(DATA.CHARS).filter(c => {
          if (c.hanzi === char) return false;
          return c.deconstruction_tree && containsComponent(c.deconstruction_tree, char);
      });
  },

  // 1. UPDATED HELPER: Removed the highlight from the main component
  updateAppearsIn(e, searchChar, rowId, heroChar, mainComponent) {
      if (e) e.stopPropagation(); 
      
      const row = document.getElementById(rowId);
      if (!row) return;

      const bentoNode = row.closest('.bento-node');
      let targetChar = searchChar;

      // Toggle logic: If we clicked the already-active sub-component, revert to the main component!
      if (e && e.currentTarget && e.currentTarget.classList.contains('active-preview') && searchChar !== mainComponent) {
          targetChar = mainComponent;
      }

      const relatedChars = Object.values(DATA.CHARS)
          .filter(c => c.hanzi !== heroChar && c.hanzi !== targetChar && c.deconstruction_tree && JSON.stringify(c.deconstruction_tree).includes(`"component":"${targetChar}"`))
          .map(c => c.hanzi).slice(0, 5);

      let interactive = `<span style="color:var(--text-muted); font-size: 0.85rem;">None</span>`;
      if (relatedChars.length > 0) {
          interactive = relatedChars.map(c => `<span class="interactive-char appears-node" onclick="App.handleCharClick(event, '${c}')">${c}</span>`).join('');
      }

      row.innerHTML = `
          <span class="appears-label interactive-char" onclick="App.handleCharClick(event, '${targetChar}')" style="cursor:pointer; display:flex; align-items:center; gap:2px; transition:0.2s;" title="Explore ${targetChar}">
              in ${targetChar} 
              <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
          </span> 
          <div class="appears-list">${interactive}</div>
      `;

      if (bentoNode) {
          bentoNode.classList.add('expanded'); 
          // Clear all highlights
          bentoNode.querySelectorAll('.sub-component-item, .bento-icon-hz').forEach(el => {
              el.classList.remove('active-preview');
          });
          
          // Apply highlight ONLY to sub-components, never the main component
          if (targetChar !== mainComponent && e && e.currentTarget) {
              e.currentTarget.classList.add('active-preview');
          }
      }
  },

  // 2. UPDATED CLICK HANDLER: Master integration of all iOS UI components
  handleCharClick(e, char) {
      if (e) e.stopPropagation(); 
      const modal = document.getElementById('charModal');
      if (modal) modal.classList.add('open'); 

      const display = document.getElementById('charDisplay');
      const detail = document.getElementById('charDetail');
      const relatedContainer = document.getElementById('charRelated');
      const link = document.getElementById('charLink');
      
      const charData = DATA.CHARS[char];

      display.style.display = 'none'; 
      relatedContainer.innerHTML = '';
      
      let html = `<div class="anatomy-master-container">`;

      // Clean up any existing sticker from previous opens
      const sheet = detail.closest('.modal-sheet');
      if (sheet) {
          const oldBadge = sheet.querySelector('.rank-sticker');
          if (oldBadge) oldBadge.remove();
      }

      if (charData) {
          // 1. STICKER RANK BADGE (Injected into sheet, not scrollable content)
          if (charData.street_utility && charData.street_utility.frequency_rank && sheet) {
              const rank = charData.street_utility.frequency_rank;
              let rankText = "Rare";
              let rankClass = "rank-rare";
              
              if (rank <= 500) { rankText = "Very Common"; rankClass = "rank-very-common"; }
              else if (rank <= 1500) { rankText = "Common"; rankClass = "rank-common"; }
              else if (rank <= 3000) { rankText = "Uncommon"; rankClass = "rank-uncommon"; }

              const badge = document.createElement('div');
              badge.className = `rank-sticker ${rankClass}`;
              badge.textContent = rankText;
              sheet.appendChild(badge);
          }

          // 2. THE HERO (Pinyin, Sound Hint, Def)
          let displayPinyin = charData.pinyin || '';
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

          html += `
              <div class="anatomy-hero-section">
                  <div class="hero-py">${displayPinyin}</div>
                  ${soundHintHTML}
                  <div class="hero-def">${charData.def || ''}</div>
              </div>
          `;

          // 3. THE DNA (BENTO COMPONENTS)
          if (charData.deconstruction_tree && charData.deconstruction_tree.children) {
              html += `<div class="anatomy-bento-grid">`;
              
              charData.deconstruction_tree.children.forEach((child, idx) => {
                  const charStr = child.component || '?';
                  const py = Utils.formatNumberedPinyin(Array.isArray(child.pinyin) ? child.pinyin[0] : (child.pinyin || ''));
                  const def = (child.meaning || '').split(/[,;]/)[0]; 
                  
                  const rowId = `appears-row-${char}-${idx}`;

                  let subCharsHTML = '';
                  if (child.children && child.children.length > 0) {
                      const lis = child.children.map(c => {
                          const subC = c.component || '?';
                          const classSub = subC !== '?' ? 'sub-hz interactive-char' : 'sub-hz';
                          const clickSubIcon = subC !== '?' ? `onclick="App.handleCharClick(event, '${subC}')"` : '';
                          const clickSubRow = subC !== '?' ? `onclick="App.updateAppearsIn(event, '${subC}', '${rowId}', '${char}', '${charStr}')"` : '';
                          
                          return `
                              <li class="sub-component-item" ${clickSubRow}>
                                  <span class="${classSub}" ${clickSubIcon} style="position:relative; z-index:5;">${subC}</span> 
                                  <span class="sub-def">${(c.meaning || '').split(/[,;]/)[0]}</span>
                              </li>
                          `;
                      }).join('');
                      subCharsHTML = `<ul class="sub-component-list">${lis}</ul>`;
                  }

                  const initialRelatedChars = charStr !== '?' ? Object.values(DATA.CHARS)
                      .filter(c => c.hanzi !== char && c.hanzi !== charStr && c.deconstruction_tree && JSON.stringify(c.deconstruction_tree).includes(`"component":"${charStr}"`))
                      .map(c => c.hanzi).slice(0, 5) : [];

                  const hasExpandedContent = (child.children && child.children.length > 0) || initialRelatedChars.length > 0;
                  
                  let appearsInHTML = '';
                  if (hasExpandedContent) {
                      let interactive = `<span style="color:var(--text-muted); font-size: 0.85rem;">None</span>`;
                      if (initialRelatedChars.length > 0) {
                          interactive = initialRelatedChars.map(c => `<span class="interactive-char appears-node" onclick="App.handleCharClick(event, '${c}')">${c}</span>`).join('');
                      }
                      
                      appearsInHTML = `
                          <div class="appears-in-row" id="${rowId}">
                              <span class="appears-label interactive-char" onclick="App.handleCharClick(event, '${charStr}')" style="cursor:pointer; display:flex; align-items:center; gap:2px; transition:0.2s;" title="Explore ${charStr}">
                                  in ${charStr} 
                                  <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
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

                  const clickMainIcon = charStr !== '?' ? `onclick="App.handleCharClick(event, '${charStr}')"` : '';
                  const classMain = charStr !== '?' ? 'bento-icon-hz interactive-char' : 'bento-icon-hz'; 

                  html += `
                      <div class="bento-node" ${clickAttr} style="${hasExpandedContent ? 'cursor:pointer' : ''}">
                          <div class="bento-header">
                              <div class="${classMain}" ${clickMainIcon} style="transition:all 0.2s; position:relative; z-index:5;">${charStr}</div>
                              <div class="bento-meta">
                                  <span class="bento-py">${py}</span>
                                  <span class="bento-def">${def}</span>
                              </div>
                              ${hasExpandedContent ? `<div class="bento-chevron"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/></svg></div>` : '<div style="width:20px;"></div>'}
                          </div>
                          ${expandedBodyHTML}
                      </div>
                  `;
              });
              html += `</div>`; 
          }

      } else {
          html += `<div style="text-align:center; padding: 20px 0; color: #64748b; font-weight: 600;">${DATA.FALLBACK_DEFS[char] || "No detailed breakdown available yet."}</div>`;
      }

      // 4. MEMORY HOOK 
      let activeHook = charData ? charData.hook : '';
      html += `
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

  // 5. BUTTERY SMOOTH NETWORK UI (Custom Accordions)
      
      // A. "Acts as a component in" (Uniform Grid)
      const buildsChars = this.findRelatedCharacters(char).slice(0, 12);

      if (buildsChars.length > 0) {
          const gridItems = buildsChars.map((c) => {
              const py = Utils.formatNumberedPinyin(Array.isArray(c.pinyin) ? c.pinyin[0] : (c.pinyin || ''));
              const def = (c.def || c.meaning || '').split(/[,;，\/]/)[0].trim(); 
              
              return `
                  <div class="ios17-grid-card interactive-char" onclick="App.handleCharClick(event, '${c.hanzi}')" title="${c.def || ''}">
                      <div class="grid-py">${py}</div>
                      <div class="grid-hz">${c.hanzi}</div>
                      <div class="grid-def">${def}</div>
                  </div>
              `;
          }).join('');
          
          html += `
              <div class="network-accordion expanded">
                  <div class="network-accordion-header" onclick="this.parentElement.classList.toggle('expanded')">
                      <span>Acts as a component</span>
                      <svg class="network-chevron" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/></svg>
                  </div>
                  <div class="network-accordion-body">
                      <div class="network-accordion-inner">
                          <div class="ios17-component-grid">
                              ${gridItems}
                          </div>
                      </div>
                  </div>
              </div>
          `;
      }

      // B. "Appears in Vocab" (Inset Grouped List)
      const relatedVocab = DATA.VOCAB.filter(v => v.hanzi.includes(char) && v.hanzi !== char).slice(0, 8);
      if (relatedVocab.length > 0) {
          html += `
              <div class="network-accordion expanded">
                  <div class="network-accordion-header" onclick="this.parentElement.classList.toggle('expanded')">
                      <span>Appears in Vocab</span>
                      <svg class="network-chevron" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/></svg>
                  </div>
                  <div class="network-accordion-body">
                      <div class="network-accordion-inner">
                          <div class="ios17-grouped-list">
          `;
          
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

              html += `
                  <div class="ios17-list-item">
                      <div class="list-hz">${interactiveHanzi}</div>
                      <div class="list-info">
                          <span class="list-py">${v.pinyin}</span>
                          <span class="list-def">${def}</span>
                      </div>
                  </div>
              `;
          });
          html += `</div></div></div></div>`;
      }

      

    

      html += `</div>`; // Close master container
      
      detail.innerHTML = html;
      link.href = `https://pleco.com/s/${char}`;

      // STROKE ORDER
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
  }
};
window.App = App;

// --- THIS GOES AT THE VERY BOTTOM OF APP.JS ---
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