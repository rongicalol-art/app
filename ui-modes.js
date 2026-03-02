Object.assign(window.UI, {
  renderStudy(item) {
    const pinyinStyle = App.state.noPinyin ? 'display:none' : 'font-size: 1.5rem; margin-bottom: 0.5rem;';

    const searchTerms = item.hanzi
        .split(/[\/，,]/) 
        .map(t => t.replace(/[（(].*?[）)]/g, '').trim())
        .filter(t => t.length > 0);

    let primaryExample = null;
    let otherExamples = [];
    let isFromOtherLesson = false;

    if (searchTerms.length > 0 && DATA.SENTENCES.length > 0) {
        const allMatches = DATA.SENTENCES.filter(s => searchTerms.some(term => s.zh.includes(term)));
        const currentLessonMatches = allMatches.filter(s => String(s.book) === String(item.book) && String(s.lesson) === String(item.lesson));
        const otherLessonMatches = allMatches.filter(s => !(String(s.book) === String(item.book) && String(s.lesson) === String(item.lesson)));

        if (currentLessonMatches.length > 0) {
            primaryExample = currentLessonMatches[0];
            otherExamples = [...currentLessonMatches.slice(1), ...otherLessonMatches];
        } else if (otherLessonMatches.length > 0) {
            primaryExample = otherLessonMatches[0];
            otherExamples = otherLessonMatches.slice(1);
            isFromOtherLesson = true;
        }
    }

    App.state.currentExample = primaryExample;
    let studyWrapper = this.container.querySelector('.study-static-wrapper');
    
    if (!studyWrapper) {
       this.container.innerHTML = `
        <div class="study-static-wrapper relative-center-wrapper fade-in">
            <div class="study-center-box">
                <div class="card-group study-card-group">
                    <div class="card-container study-card-container">
                        <div class="card" data-action="toggle-flip">
                            <div class="card__face card__face--front"></div>
                            <div class="card__face card__face--back"></div>
                        </div>
                    </div>
                    <div id="exampleBtnContainer"></div>
                </div>
            </div>
        </div>
    `;
        studyWrapper = this.container.querySelector('.study-static-wrapper');
    }

    if (primaryExample) studyWrapper.classList.add('has-example');
    else studyWrapper.classList.remove('has-example');

    const frontFace = studyWrapper.querySelector('.card__face--front');
    const backFace = studyWrapper.querySelector('.card__face--back');
    const card = studyWrapper.querySelector('.card');

    if (App.state.skipFlipAnimationOnce) {
        card.classList.add('no-flip-transition');
    }

    if (App.state.isFlipped) card.classList.add('flipped');
    else card.classList.remove('flipped');

    if (App.state.skipFlipAnimationOnce) {
        App.state.skipFlipAnimationOnce = false;
        requestAnimationFrame(() => card.classList.remove('no-flip-transition'));
    }

    card.classList.remove('showing-example');

    frontFace.innerHTML = `
        <div class="face-content vocab-content">
            <div class="card-center-layout">
                <div class="hanzi-display study-hz-lg">${Utils.createInteractiveHanzi(item.hanzi, false)}</div>
            </div>
        </div>
    `;

    backFace.innerHTML = `
        <div class="face-content vocab-content">
            <div class="study-back-main" style="min-height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center; width: 100%;">
                <div class="pinyin-display" style="${pinyinStyle}">${Utils.convertTones(item.pinyin)}</div>
                <div class="hanzi-display study-hz-lg-back">${Utils.colorHanzi(item.hanzi)}</div>
                ${App.state.showHooks && item.hook ? `<div class="memory-hook"><span>💡</span> <span>${item.hook}</span></div>` : ''}
                <div class="def-display study-def" style="${App.state.noTranslation ? 'display:none' : ''}">${item.def}</div>
            </div>
            
            ${primaryExample ? `
            <div class="example-section" style="margin-top: 40px; padding-bottom: 40px;">
            <div class="example-zh">${Utils.createInteractiveSentence(primaryExample.zh, item.hanzi)}</div>                <div class="example-py" style="${App.state.noPinyin ? 'display:none' : ''}">${Utils.convertTones(primaryExample.py)}</div>
                <div class="example-en" style="${App.state.noTranslation ? 'display:none' : ''}">${primaryExample.en}</div>
            </div>
            ` : ''}
        </div>
    `;
    studyWrapper.querySelector('#exampleBtnContainer').innerHTML = '';
  },

  renderSentences(item) {
    this.container.innerHTML = '';
    const pinyinStyle = App.state.noPinyin ? 'display:none' : 'font-size:1.3rem; margin-bottom:0.5rem';
    const zhHTML = Utils.createInteractiveSentence(item.zh);
    const html = `
      <div class="card-wrapper relative-center-wrapper fade-in">
        <div class="card-container sentence-card-container">
            <div class="card" data-action="toggle-flip">
                <div class="card__face card__face--front">
                    <div class="face-content">
                        <div class="card-center-layout"><div class="hanzi-display sentence-hanzi">${zhHTML}</div></div>
                    </div>
                </div>
                <div class="card__face card__face--back">
                    <div class="face-content">
                        <div class="card-center-layout">
                            <div class="pinyin-display" style="${pinyinStyle}">${Utils.colorPinyin(item.py)}</div>
                            <div class="hanzi-display sentence-hanzi-back">${zhHTML}</div>
                            <div class="def-display">${item.en}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      </div>
    `;
    this.container.innerHTML = html;
  },

renderQuiz(item) {
    const isTrans = App.state.quizType === 'translate';
    const isDefOnly = !isTrans && App.state.quizDefOnly;

    let prompt, promptLabel, fontStyle, fontFam;

    if (isTrans || isDefOnly) {
        prompt = isTrans ? item.en : item.def;
        promptLabel = isTrans ? 'Translate to Pinyin' : 'Type Pinyin';
        fontStyle = 'clamp(1.1rem, 4vw, 1.5rem)';
        fontFam = "font-family: 'Nunito', sans-serif;";
    } else { 
        prompt = Utils.createInteractiveHanzi(item.hanzi, false);
        promptLabel = 'Type Pinyin';
        
        // Sane font size for the Chinese characters on the front
        fontStyle = 'clamp(3rem, 15vw, 6rem)'; 
        fontFam = "";
    }
    this.container.innerHTML = `
        <div class="quiz-static-wrapper relative-center-wrapper fade-in">
            <div class="study-center-box" style="flex-direction: column; width: 100%;">
                <div class="card-group study-card-group" style="margin-bottom: 30px;">
                    <div class="card-container study-card-container">
                        <div class="card quiz-card-inner" id="quizCard">
                            <div class="card__face card__face--front">
                                <div class="face-content vocab-content" style="justify-content: center;">
                                    <div class="card-center-layout">
                                        <div style="font-family:'Nunito', sans-serif; font-weight:800; color:var(--text-muted); text-transform:uppercase; letter-spacing:1.5px; margin-bottom: 16px; text-align: center; opacity:0.8;">${promptLabel}</div>
                                        <div class="hanzi-display" style="font-size:${fontStyle}; margin:0; ${fontFam} text-align:center; line-height:1.1; color: var(--text-main);">${prompt}</div>
                                    </div>
                                </div>
                            </div>
                            <div class="card__face card__face--back" id="quizCardBack"></div>
                        </div>
                    </div>
                </div>
                <div class="quiz-input-container" style="width: 90vw; max-width: 400px; z-index: 20;">
                    <input type="search" id="userAnswer" class="quiz-input" placeholder="Type answer..." autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="done">
                </div>
            </div>
        </div>
    `;

    const input = document.getElementById('userAnswer');
    const card = document.getElementById('quizCard');
    const cardBack = document.getElementById('quizCardBack');
    let isProcessing = false;

    const check = () => {
      if (isProcessing) return;
      const val = input.value.trim();
      const target = (isTrans ? item.py : item.pinyin).trim();
      const isCorrect = Utils.checkAnswer(val, target);
      
      const pinyinText = Utils.convertTones(item.pinyin || item.py);
      const hanzi = Utils.createInteractiveHanzi(item.hanzi || item.zh, false);
      const def = item.def || item.en;
      
      // Clean, elegant colors for the text
      const themeColor = isCorrect ? '#10b981' : '#f43f5e';
      
      // THE FIX: Removed the "Oops/Awesome" boxes entirely.
      // Replaced with a beautifully clean, minimalist layout.
      cardBack.innerHTML = `
          <div class="face-content vocab-content" style="justify-content: center;">
              <div class="card-center-layout">
                  <div class="quiz-reveal-py" style="font-family:'Nunito', sans-serif; font-weight:800; font-size:1.1rem; color:${themeColor}; margin-bottom:8px;">${pinyinText}</div>
                  <div class="quiz-reveal-hz hanzi-display" style="font-family:'twkai', serif; color: var(--text-main); line-height:1.1; margin-bottom:12px;">${hanzi}</div>
                  <div class="quiz-reveal-def" style="font-family:'Nunito', sans-serif; font-weight:700; font-size:1.1rem; color: var(--text-muted); padding: 0 10px;">${def}</div>
              </div>
          </div>
      `;
      
      card.classList.add('flipped');
      
      if(isCorrect) {
         isProcessing = true;
         App.state.streak++;
         UI.updateStreak();
         App.saveSettings();
         UI.celebrate();
         setTimeout(() => App.next(), App.state.fastNext ? 600 : 2000);
      } else {
         input.classList.remove('shake');
         void input.offsetWidth;
         input.classList.add('shake');
         App.state.streak = 0;
         UI.updateStreak();
         App.saveSettings();
         
         const key = item.hanzi || item.zh;
         if (!App.state.sessionMistakes.includes(key)) App.state.sessionMistakes.push(key);
         Sound.play('wrong');
         setTimeout(() => input.classList.remove('shake'), 500);
      }
    };

    input.addEventListener('keyup', (e) => { if(e.key === 'Enter') check(); });
    input.focus();
  },

 renderList() {
    if (!document.getElementById('listContent')) {
        const html = `
          <div class="list-view-container list-view fade-in" style="padding: 0; background: transparent;">
            
            <div class="hq-search-container">
                <div class="hq-search-wrapper">
                    <svg class="hq-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    
                    <input type="text" id="listSearch" class="hq-search-input" placeholder="Search Hanzi, Pinyin or English..." autocomplete="off">
                    
                    <button id="listSearchClear" class="hq-search-clear" title="Clear Search">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
            </div>

            <div class="list-content list-scroll-area" id="listContent">
                <div id="listSpacer" class="list-spacer"></div>
                <div id="listItemsContainer" class="list-items-wrapper"></div>
            </div>
          </div>
        `;
        this.container.innerHTML = html;
        
        const searchInput = document.getElementById('listSearch');
        const clearBtn = document.getElementById('listSearchClear');
        let debounceTimer;

        // Listen for typing to animate the Clear button
        searchInput.addEventListener('input', (e) => {
          const val = e.target.value;
          
          if (val.length > 0) {
              clearBtn.classList.add('visible');
          } else {
              clearBtn.classList.remove('visible');
          }

          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
              const term = Utils.normalizeSearch(val);
              const filtered = App.state.activeList.filter(i => i.searchKey && i.searchKey.includes(term));
              this.populateList(filtered);
          }, 300);
        });

        // Clear button logic
        clearBtn.addEventListener('click', () => {
            if (window.Sound) window.Sound.play('click');
            searchInput.value = '';
            clearBtn.classList.remove('visible');
            searchInput.focus(); // Keep the glow active!
            this.populateList(App.state.activeList);
        });

        document.getElementById('listContent').addEventListener('scroll', () => {
            this.updateVirtualList();
        });
    }
    
    this.populateList(App.state.activeList);
  },

  renderBuilder(item) {
    this.container.innerHTML = '';
    
    // 1. Intelligently split the sentence into actual words!
    let targetWords = [];
    if (window.Intl && Intl.Segmenter) {
        // Use the native language engine to understand Chinese grammar boundaries
        const segmenter = new Intl.Segmenter('zh-TW', { granularity: 'word' });
        const segments = Array.from(segmenter.segment(item.zh));
        
        // isWordLike automatically drops commas, periods, question marks, and spaces!
        targetWords = segments.filter(s => s.isWordLike).map(s => s.segment);
    } else {
        // Fallback for older browsers: just strip punctuation and split by character
        targetWords = item.zh.replace(/[，。！？、；：“”‘’（）《》〈〉【】\s]/g, '').split('');
    }
    
    // The final string we need to match (without punctuation)
    const targetStr = targetWords.join('');

    // 2. Initialize the tokens state if starting fresh
    if (!App.state.builderTokens.length) {
        App.state.builderTokens = targetWords.map((w, i) => ({ id: i, char: w }));
        // Shuffle the words
        App.state.builderTokens.sort(() => Math.random() - 0.5);
        App.state.builderAnswer = [];
    }

    const html = `
      <div class="builder-container builder-scroll-wrapper fade-in">
        <div class="builder-prompt">
          <div class="builder-subtitle">Translate this</div>
          ${item.en}
        </div>
        <div class="answer-area" id="builderAnswer">
          ${App.state.builderAnswer.length === 0 ? '<span class="placeholder-text">Tap words below</span>' : ''}
        </div>
        <div class="word-bank" id="builderBank"></div>
        <div class="builder-action-row">
           <button class="btn-sec" id="clearBtn">Clear</button>
           <button class="btn-sec" id="hintBtn">Hint</button>
        </div>
        <div id="builderFeedback" class="builder-feedback-row"></div>
      </div>
    `;
    this.container.innerHTML = html;

    const bankEl = document.getElementById('builderBank');
    const answerEl = document.getElementById('builderAnswer');
    
    document.getElementById('clearBtn').onclick = () => {
        App.state.builderAnswer = [];
        this.renderBuilder(item);
    };

    document.getElementById('hintBtn').onclick = () => {
        // Solve it instantly by sorting IDs back to their original sequence
        App.state.builderAnswer = [...App.state.builderTokens].sort((a, b) => a.id - b.id);
        this.renderBuilder(item);
        
        document.getElementById('builderAnswer').classList.add('correct');
        Sound.play('correct');
        this.celebrate();
        
        const hintBtn = document.getElementById('hintBtn');
        hintBtn.textContent = 'Next';
        hintBtn.classList.replace('btn-sec', 'btn-main');
        hintBtn.onclick = () => setTimeout(() => App.next(), 300);
    };

    const checkAnswer = () => {
        // Compare the current blocks against the punctuation-free target
        const currentStr = App.state.builderAnswer.map(t => t.char).join('');
        if (currentStr.length > 0 && currentStr.length === targetStr.length) {
           if (currentStr === targetStr) {
             answerEl.classList.add('correct');
             document.getElementById('builderFeedback').innerHTML = '<span class="status-correct" style="color:#10b981; font-weight:800;">Perfect! 🎉</span>';
             Sound.play('correct');
             this.celebrate();
             
             const hintBtn = document.getElementById('hintBtn');
             hintBtn.textContent = 'Next';
             hintBtn.classList.replace('btn-sec', 'btn-main');
             hintBtn.onclick = () => setTimeout(() => App.next(), 300);
           } else {
             answerEl.classList.add('wrong');
             Sound.play('wrong');
             setTimeout(() => answerEl.classList.remove('wrong'), 500);
           }
        }
    };

    // Helper to generate a chip inside the answer box
    const createAnswerChip = (token) => {
        const ansChip = document.createElement('div');
        ansChip.className = 'word-chip in-answer';
        ansChip.textContent = token.char;
        
        ansChip.onclick = () => {
           Sound.play('click');
           const idx = App.state.builderAnswer.findIndex(t => t.id === token.id);
           if (idx > -1) App.state.builderAnswer.splice(idx, 1);
           
           ansChip.remove();
           const bankChip = bankEl.querySelector(`.word-chip[data-id="${token.id}"]`);
           if(bankChip) bankChip.classList.remove('used');
           
           if (App.state.builderAnswer.length === 0) {
               answerEl.innerHTML = '<span class="placeholder-text">Tap words below</span>';
           }
        };
        return ansChip;
    };

    // Render the draggable words in the bottom bank
    App.state.builderTokens.forEach(token => {
      const chip = document.createElement('div');
      chip.className = 'word-chip';
      chip.textContent = token.char;
      chip.dataset.id = token.id;
      
      // Hide from bank if already in the answer area
      if (App.state.builderAnswer.some(t => t.id === token.id)) chip.classList.add('used');
      
      chip.onclick = () => {
        Sound.play('click');
        const ph = answerEl.querySelector('.placeholder-text');
        if (ph) ph.remove();

        App.state.builderAnswer.push(token);
        chip.classList.add('used');
        
        const ansChip = createAnswerChip(token);
        answerEl.appendChild(ansChip);
        checkAnswer();
      };
      bankEl.appendChild(chip);
    });
    
    // Render any words currently in the answer box
    if (App.state.builderAnswer.length > 0) {
         App.state.builderAnswer.forEach(token => {
             const ansChip = createAnswerChip(token);
             answerEl.appendChild(ansChip);
         });
    }
  },

  renderListening(item) {
    if (!item) return;

    // 1. Generate 3 random distractors
    let pool = App.state.activeList.length > 3 ? App.state.activeList : DATA.VOCAB;
    let choices = [item];
    let attempts = 0;
    
    while(choices.length < 4 && attempts < 50) {
        let rand = pool[Math.floor(Math.random() * pool.length)];
        // Ensure no duplicates
        if (!choices.some(c => c.hanzi === rand.hanzi || c.en === rand.en)) {
            choices.push(rand);
        }
        attempts++;
    }
    
    // Shuffle options
    choices.sort(() => Math.random() - 0.5);

    // 2. Build the HTML Interface
    const html = `
      <div class="listen-master-wrapper fade-in">
        
        <div style="text-align: center; margin-top: 10px;">
            <div style="font-family: 'Nunito', sans-serif; font-size: 0.9rem; font-weight: 800; color: var(--primary); text-transform: uppercase; letter-spacing: 2px; margin-bottom: 6px;">Listening Test</div>
            <div style="font-family: 'Nunito', sans-serif; font-size: 1.2rem; font-weight: 700; color: var(--text-muted);">What did you hear?</div>
        </div>

        <div id="sonarContainer" class="sonar-container">
            <div class="sonar-ring"></div>
            <div class="sonar-ring"></div>
            <div class="sonar-ring"></div>
            <div id="sonarOrb" class="sonar-orb" title="Play Audio">
                <svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor">
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                </svg>
            </div>
        </div>

        <div id="listenOptionsGrid" class="listen-options-grid">
            ${choices.map((choice, i) => `
                <div class="listen-option-card" data-id="${choice.id || choice.hanzi}" style="transition-delay: ${i * 0.08}s">
                    <div class="listen-opt-main">${App.state.listeningHard ? '?' : choice.hanzi}</div>
                    <div class="listen-opt-sub">${choice.en}</div>
                </div>
            `).join('')}
        </div>
        
      </div>
    `;
    this.container.innerHTML = html;

    const sonarContainer = document.getElementById('sonarContainer');
    const sonarOrb = document.getElementById('sonarOrb');
    const grid = document.getElementById('listenOptionsGrid');
    const cards = document.querySelectorAll('.listen-option-card');

    // 3. Trigger staggered entrance animation
    setTimeout(() => {
        cards.forEach(card => card.classList.add('animate-in'));
    }, 50);

    // 4. TTS Audio Logic (Syncs with the Sonar Rings!)
    const playAudio = () => {
        if (!window.speechSynthesis) return;
        window.speechSynthesis.cancel(); // kill previous

        const msg = new SpeechSynthesisUtterance(item.hanzi || item.zh);
        msg.lang = 'zh-TW';
        msg.rate = App.state.ttsRate || 0.8;
        
        // Turn on rings
        sonarContainer.classList.add('is-playing');
        
        // Turn off rings when done
        msg.onend = () => sonarContainer.classList.remove('is-playing');
        msg.onerror = () => sonarContainer.classList.remove('is-playing');
        
        window.speechSynthesis.speak(msg);
    };

    // Auto-play on load
    setTimeout(playAudio, 300);

    // Re-play on tapping the orb
    sonarOrb.addEventListener('click', () => {
        if (window.Sound) Sound.play('click');
        playAudio();
    });

    // 5. Option Selection Logic
    cards.forEach(card => {
        card.addEventListener('click', function() {
            if (grid.classList.contains('has-selection')) return; // Prevent double taps

            const selectedId = this.getAttribute('data-id');
            const correctId = String(item.id || item.hanzi);

            if (selectedId === correctId) {
                // CORRECT
                if (window.Sound) Sound.play('correct');
                this.classList.add('state-correct');
                grid.classList.add('has-selection');
                window.speechSynthesis.cancel(); // Stop talking if they got it right
                
                UI.celebrate(); // Fire confetti!

                setTimeout(() => App.next(), 1000);
            } else {
                // WRONG
                if (window.Sound) Sound.play('wrong');
                this.classList.add('state-wrong');
                
                // Track mistake if not already tracked
                if (!App.state.sessionMistakes.includes(item.hanzi)) {
                    App.state.sessionMistakes.push(item.hanzi);
                }

                // Remove red shake after animation so they can try again
                setTimeout(() => {
                    this.classList.remove('state-wrong');
                }, 500);
            }
        });
    });
  },

  populateList(items) {
    this.currentListItems = items;
    this._lastListStart = -1; // Reset our new cache
    this._lastListEnd = -1;
    const container = document.getElementById('listContent');
    if (container) container.scrollTop = 0;
    this.updateVirtualList();
  },

 updateVirtualList() {
    const container = document.getElementById('listContent');
    const spacer = document.getElementById('listSpacer');
    const itemsContainer = document.getElementById('listItemsContainer');
    const items = this.currentListItems;
    
    if (!container || !itemsContainer || !items) return;

    const itemHeight = 94; 
    const scrollTop = container.scrollTop;
    const containerHeight = container.clientHeight;

    spacer.style.height = `${items.length * itemHeight}px`;

    let start = Math.floor(scrollTop / itemHeight) - 3;
    let end = Math.ceil((scrollTop + containerHeight) / itemHeight) + 3;
    
    start = Math.max(0, start);
    end = Math.min(items.length, end);

    if (this._lastListStart === start && this._lastListEnd === end) return;
    this._lastListStart = start;
    this._lastListEnd = end;

    itemsContainer.style.transform = `translateY(${start * itemHeight}px)`;

    const pinyinStyle = App.state.noPinyin ? 'display:none' : '';
    const visibleItems = items.slice(start, end);

    itemsContainer.innerHTML = visibleItems.map(item => {
        const hz = item.hanzi || item.zh;
        const py = item.pinyin || item.py;
        const en = item.def || item.en;
        const isSentence = !!item.zh;
        const hzHTML = Utils.createInteractiveHanzi(hz);
        
        const bookColor = Utils.getBookColor(item.book);
        const bookBg = Utils.getBookBg(item.book);

        // THE FIX: Added 'animation: none !important;' and 'opacity: 1 !important;' to force it to stop fading!
        return `
            <div class="list-item" style="background: #ffffff; border: 1px solid #eef2f7; border-radius: 16px; padding: 10px 12px; margin-bottom: 8px; display: flex; align-items: center; gap: 10px; box-shadow: 0 4px 10px rgba(0,0,0,0.02); border-left: 4px solid ${bookColor}; animation: none !important; transition: none !important; opacity: 1 !important;">
                ${isSentence ? `
                    <div class="list-info" style="flex: 1;">
                        <div class="list-item-sentence-hz" style="font-size: 1.05rem; margin-bottom: 3px;">${hzHTML}</div>
                        <div class="list-pinyin" style="${pinyinStyle} font-family: 'Nunito', sans-serif; font-weight: 700; color: ${bookColor}; margin-bottom: 2px; font-size: 0.82rem;">${Utils.colorPinyin(py)}</div>
                        <div class="list-def list-item-sentence-en" style="font-family: 'Nunito', sans-serif; font-size: 0.8rem; color: #64748b; line-height: 1.25;">${en}</div>
                    </div>
                ` : `
                    <div class="list-hanzi" style="font-family: 'twkai', 'Noto Serif TC', serif !important; font-size: 2rem; min-width: 44px; text-align: center; color: var(--text-main);">${hzHTML}</div>
                    <div class="list-info" style="flex: 1;">
                        <div class="list-pinyin" style="${pinyinStyle} font-family: 'Nunito', sans-serif; font-weight: 800; color: ${bookColor}; font-size: 0.88rem; margin-bottom: 2px;">${Utils.colorPinyin(py)}</div>
                        <div class="list-def" style="font-family: 'Nunito', sans-serif; font-size: 0.8rem; color: #64748b; font-weight: 600; line-height: 1.25;">${en}</div>
                    </div>
                `}
                <div style="font-family: 'Nunito', sans-serif; font-size: 0.66rem; font-weight: 800; color: ${bookColor}; background: ${bookBg}; padding: 4px 7px; border-radius: 8px; white-space: nowrap;">B${item.book} L${item.lesson}</div>
            </div>
        `;
    }).join('');
  },
renderWriting(item) {
    if (this._lastWritingItemId !== item.id) {
        this._lastWritingItemId = item.id;
        App.state.writingCharIndex = 0;
        
        const card = document.getElementById('premiumPracticeCard');
        if (card) {
            card.style.opacity = '0';
            card.style.transform = 'scale(0.96) translateY(10px)';
        }
    }

    const rawWord = (item.hanzi || '').replace(/[（(].*?[）)]/g, '');
    let word = '';
    try {
        word = (rawWord.match(/\p{Script=Han}/gu) || []).join('');
    } catch (e) {
        word = rawWord.replace(/[^\u3400-\u9FFF\uF900-\uFAFF]/g, '');
    }
    const chars = Array.from(word);

    if (!chars.length || App.state.writingCharIndex >= chars.length) {
        App.state.writingCharIndex = 0;
        App.next();
        return;
    }

    const currentChar = chars[App.state.writingCharIndex];
    const pinyinText = Utils.convertTones(item.pinyin || ''); 
    const displayWord = word || (item.hanzi || '').replace(/[（(].*?[）)]/g, '').trim() || currentChar;
    const isMobile = window.innerWidth <= 768;
    const wrapperBottomPadding = isMobile ? 14 : 30;
    const dockMarginTop = isMobile ? 4 : 12;

    const inlineProgressHtml = chars.map((c, i) => {
        if (i < App.state.writingCharIndex) return `<div class="progress-dot filled"></div>`;
        if (i === App.state.writingCharIndex) return `<div class="progress-dot current"></div>`;
        return `<div class="progress-dot"></div>`;
    }).join('');

    const isFS = !!App.state.writingFullscreen;

    let wrapper = this.container.querySelector('#writingAppWrapper');

    if (!wrapper) {
        const html = `
          <style>
            .premium-practice-card {
                background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
                border: 1px solid rgba(255, 158, 181, 0.22); border-radius: 36px;
                box-shadow: 0 16px 40px rgba(255, 158, 181, 0.2); 
                width: 100%; max-width: 320px;
                display: flex; flex-direction: column; overflow: hidden;
                transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
                transform: scale(0.96) translateY(10px); opacity: 0; 
                margin: auto;
            }

            .premium-practice-card.is-fullscreen {
                max-width: 480px;
                width: 90vw;
                aspect-ratio: 1 / 1.15;
                max-height: calc(100vh - 160px);
                border-radius: 40px;
                box-shadow: 0 24px 50px rgba(255, 158, 181, 0.24);
            }

            .practice-card-header {
                padding: 12px 20px; background: rgba(248, 250, 252, 0.7);
                border-bottom: 2px dashed rgba(226, 232, 240, 0.8); cursor: pointer; transition: opacity 0.4s ease, background 0.2s;
            }
            .practice-card-header:hover { background: rgba(241, 245, 249, 0.9); }

            .header-top-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
            .writing-progress-dots { display: flex; gap: 5px; align-items: center; }
            .progress-dot { height: 4px; width: 12px; border-radius: 4px; background: #e2e8f0; transition: all 0.3s ease; }
            .progress-dot.filled { background: #94a3b8; }
            .progress-dot.current { background: var(--primary); width: 20px; }
            
            .hint-text-wrapper { position: relative; height: 24px; overflow: hidden; }
            .hint-text-inner { transition: opacity 0.2s ease; }
            .hint-def, .hint-py {
                position: absolute; left: 0; top: 0; width: 100%;
                transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.35s;
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            }
            .hint-def { font-family: 'Nunito', sans-serif; font-size: 1.05rem; font-weight: 700; color: var(--text-main); transform: translateY(0); opacity: 1; }
            .hint-py { font-family: 'Nunito', sans-serif; font-size: 1.05rem; font-weight: 800; color: var(--primary); letter-spacing: 0.5px; transform: translateY(20px); opacity: 0; }
            
            .practice-card-header.show-py .hint-def { transform: translateY(-20px); opacity: 0; }
            .practice-card-header.show-py .hint-py { transform: translateY(0); opacity: 1; }
            
            .header-controls { display: flex; gap: 14px; align-items: center; }
            .swap-icon { color: #cbd5e1; transition: transform 0.3s; display: flex; align-items: center; }
            .practice-card-header.show-py .swap-icon { transform: rotate(180deg); color: var(--primary); }

            .fs-toggle-btn-header {
                background: transparent; border: none; color: #cbd5e1; cursor: pointer;
                display: flex; align-items: center; justify-content: center; padding: 4px;
                transition: all 0.2s ease; outline: none; border-radius: 6px; margin-right: -4px;
            }
            .fs-toggle-btn-header:hover { color: var(--primary); background: rgba(255, 158, 181, 0.12); }
            .fs-toggle-btn-header:active { transform: scale(0.9); }

            .action-icon-btn {
                background: transparent; border: none; color: #94a3b8; width: 50px; height: 50px; 
                cursor: pointer; border-radius: 50%; transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); 
                display: flex; align-items: center; justify-content: center; outline: none;
            }
            .action-icon-btn:hover { background: #f8fafc; color: var(--text-main); transform: scale(1.1); box-shadow: 0 8px 16px rgba(255, 158, 181, 0.18); }
            .action-icon-btn:active { transform: scale(0.9); }
            .action-icon-btn.active { color: white; background: var(--primary); box-shadow: 0 4px 12px rgba(255, 158, 181, 0.3); }
            .action-icon-btn.text-danger { color: #f43f5e; }
            .action-icon-btn.text-danger:hover { background: #fff1f2; }

            @keyframes successPop {
                0% { opacity: 0; transform: scale(0.8) translateY(10px); }
                60% { transform: scale(1.05) translateY(-2px); }
                100% { opacity: 1; transform: scale(1) translateY(0); }
            }
          </style>

          <div id="writingAppWrapper" class="writing-wrapper fade-in" style="display: flex; flex-direction: column; width: 100%; height: 100%; justify-content: center; align-items: center; padding: max(20px, env(safe-area-inset-top)) 10px ${wrapperBottomPadding}px 10px; box-sizing: border-box; gap: 20px;">
            
            <div id="premiumPracticeCard" class="premium-practice-card ${isFS ? 'is-fullscreen' : ''}">
                <div id="cardHeaderToggle" class="practice-card-header" title="Tap to flip">
                    <div class="header-top-row">
                        <div id="writingProgressDots" class="writing-progress-dots"></div>
                        
                        <div class="header-controls">
                            <div class="swap-icon">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>
                            </div>
                            <button id="fsToggleBtn" class="fs-toggle-btn-header" title="Toggle Size"></button>
                        </div>
                    </div>
                    
                    <div class="hint-text-wrapper hint-text-inner" id="hintTextInner">
                        <div id="hintDef" class="hint-def"></div>
                        <div id="hintPy" class="hint-py"></div>
                    </div>
                </div>

                <div style="padding: 24px; width: 100%; display: flex; flex: 1; justify-content: center; align-items: center; position: relative; box-sizing: border-box; min-height: 0;">
                    
                    <div id="writingTarget" class="writing-target-inner" style="border-radius: 16px; display: flex; justify-content: center; align-items: center; transition: opacity 0.3s ease;"></div>
                    
                    <div id="writingMessage" class="writing-msg" style="position: absolute; color:var(--text-muted); font-weight:700;">Loading...</div>
                    
                    <div id="writingSuccessView" style="position: absolute; top: 24px; left: 24px; right: 24px; bottom: 24px; display: none; flex-direction: column; justify-content: center; align-items: center; opacity: 0; transition: opacity 0.4s ease; z-index: 20; text-align: center; overflow-y: auto; scrollbar-width: none;"></div>
                </div>
            </div>

            <div id="writingBottomDock" style="display: flex; justify-content: space-evenly; align-items: center; background: rgba(255,255,255,0.95); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); padding: 8px 16px; border-radius: 36px; box-shadow: 0 12px 35px rgba(255, 158, 181, 0.2); border: 1px solid rgba(255, 158, 181, 0.2); width: 100%; max-width: 320px; margin-top: ${dockMarginTop}px; transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);">
                <button class="action-icon-btn text-danger" id="exitFocusBtn" title="Exit Practice">
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                </button>
                <div style="width: 2px; height: 24px; background: rgba(255, 158, 181, 0.25); border-radius: 2px;"></div>
                <button class="action-icon-btn" id="writingAnimateBtn" title="Watch Stroke Order">
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
                </button>
                <button class="action-icon-btn ${App.state.writingShowOutline ? 'active' : ''}" id="writingOutlineToggle" title="Toggle Guidelines">
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M3 3v18h18V3H3zm16 16H5V5h14v14zM11 7h2v2h-2zM7 7h2v2H7zm8 0h2v2h-2zm-8 4h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2zm-8 4h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z"/></svg>
                </button>
                <button class="action-icon-btn" id="writingResetBtn" title="Retry Character">
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
                </button>
            </div>
          </div>
        `;
        this.container.innerHTML = html;
        document.getElementById('cardHeaderToggle').onclick = function() { this.classList.toggle('show-py'); };
    }

    const textInner = document.getElementById('hintTextInner');
    const cardEl = document.getElementById('premiumPracticeCard');
    const targetEl = document.getElementById('writingTarget');
    const successView = document.getElementById('writingSuccessView');
    const exitBtn = document.getElementById('exitFocusBtn');
    const headerToggle = document.getElementById('cardHeaderToggle');
    const fsToggleBtn = document.getElementById('fsToggleBtn');
    
    if (cardEl) {
        if (isFS) cardEl.classList.add('is-fullscreen');
        else cardEl.classList.remove('is-fullscreen');
    }

    if (fsToggleBtn) {
        fsToggleBtn.innerHTML = isFS 
            ? `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>`
            : `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>`;
            
        fsToggleBtn.onclick = (e) => {
            e.stopPropagation(); 
            App.state.writingFullscreen = !App.state.writingFullscreen;
            if (App.saveSettings) App.saveSettings();
            
            if (cardEl) {
                cardEl.style.transition = 'all 0.25s ease'; 
                cardEl.style.transform = 'scale(0.9)';
                cardEl.style.opacity = '0';
            }
            setTimeout(() => this.renderWriting(item), 250);
        };
    }
    
    if (exitBtn) {
        exitBtn.className = 'action-icon-btn text-danger';
        exitBtn.title = 'Exit Practice';
        exitBtn.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`;
        exitBtn.onclick = () => App.setMode('study');
    }

    if (successView) {
        successView.style.opacity = '0';
        successView.style.display = 'none';
        successView.innerHTML = '';
        
        // CLEANUP: Reset back to absolute but clear any transform so we start fresh
        successView.style.position = 'absolute';
        successView.style.transform = 'none';
        successView.style.height = 'auto';
        successView.style.width = 'auto';
    }
    if (headerToggle) headerToggle.style.opacity = '1';
    
    targetEl.style.display = 'flex';
    targetEl.style.visibility = 'visible'; 
    targetEl.style.opacity = '1';

    textInner.style.opacity = '0';
    setTimeout(() => {
        document.getElementById('writingProgressDots').innerHTML = inlineProgressHtml;
        document.getElementById('hintDef').textContent = item.def || 'Definition unavailable';
        document.getElementById('hintPy').textContent = pinyinText || 'Pinyin unavailable';
        
        if (App.state.writingCharIndex === 0) {
            document.getElementById('cardHeaderToggle').classList.remove('show-py');
        }
        textInner.style.opacity = '1';
        
        if (cardEl) {
            cardEl.style.opacity = '1';
            cardEl.style.transform = 'scale(1) translateY(0)';
        }
    }, 150);

    targetEl.innerHTML = ''; 
    
    const animateBtn = document.getElementById('writingAnimateBtn');
    const resetBtn = document.getElementById('writingResetBtn');
    const outlineToggle = document.getElementById('writingOutlineToggle');
    [animateBtn, resetBtn, outlineToggle].forEach(b => b.disabled = true);

    if (typeof HanziWriter === 'undefined') {
        document.getElementById('writingMessage').textContent = 'Library not loaded.';
        return;
    }

    let dynamicSize;
    if (isFS) {
        const cardW = Math.min(window.innerWidth * 0.9, 480);
        const aspectH = cardW * 1.15;
        const maxH = window.innerHeight - 160;
        const cardH = Math.min(aspectH, maxH);
        
        const availableW = cardW - 48;
        const availableH = cardH - 100;
        
        dynamicSize = Math.max(120, Math.min(availableW, availableH, 380));
    } else {
        dynamicSize = Math.max(120, Math.min(window.innerWidth - 80, window.innerHeight - 380, 260));
    }

    targetEl.style.width = `${dynamicSize}px`;
    targetEl.style.height = `${dynamicSize}px`;

    const writer = HanziWriter.create('writingTarget', currentChar, {
        width: dynamicSize, height: dynamicSize, padding: 5, 
        showCharacter: false, showOutline: App.state.writingShowOutline, 
        outlineColor: '#e2e8f0', strokeAnimationSpeed: 1, delayBetweenStrokes: 100,
        strokeColor: '#ff9eb5', highlightColor: '#ff85a2',
        drawingWidth: 25, drawingFadeDuration: 400, 
        onLoadCharDataSuccess: () => {
            document.getElementById('writingMessage').style.display = 'none';
            [animateBtn, resetBtn, outlineToggle].forEach(b => b.disabled = false);
            startQuiz();
        },
        onLoadCharDataError: () => {
            document.getElementById('writingMessage').textContent = 'Character not found.';
        },
        onCorrectStroke: () => Sound.play('click'),
        onMistake: () => {
            Sound.play('wrong');
            targetEl.classList.remove('shake');
            void targetEl.offsetWidth;
            targetEl.classList.add('shake');
            setTimeout(() => targetEl.classList.remove('shake'), 400);
        }
    });

    const startQuiz = () => {
        writer.quiz({
            leniency: 2.0,
            onComplete: () => {
                Sound.play('correct');
                
                if (exitBtn) {
                    exitBtn.className = 'action-icon-btn active'; 
                    exitBtn.title = 'Next';
                    exitBtn.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M5 13h11.17l-4.88 4.88c-.39.39-.39 1.03 0 1.42.39.39 1.02.39 1.41 0l6.59-6.59a.9959.9959 0 000-1.41l-6.58-6.59a.9959.9959 0 00-1.41 0c-.39.39-.39 1.02 0 1.41L16.17 11H5c-.55 0-1 .45-1 1s.45 1 1 1z"/></svg>`;
                }
                
                if (App.state.writingCharIndex < chars.length - 1) {
                    if (exitBtn) {
                        exitBtn.onclick = () => {
                            App.state.writingCharIndex++;
                            targetEl.style.opacity = '0';
                            setTimeout(() => this.renderWriting(item), 200);
                        };
                    }
                } else {
                    this.celebrate();
                    
                    targetEl.style.opacity = '0';
                    if (headerToggle) headerToggle.style.opacity = '0';
                    
                    setTimeout(() => {
                        // KEEPS THE CANVAS PROPPING UP THE HEIGHT
                        targetEl.style.visibility = 'hidden';
                        
                        // PERFECT GEOMETRIC CENTERING
                        // This pins the exact middle of the success view 
                        // to the exact middle of the practice card.
                        successView.style.position = 'absolute';
                        successView.style.top = '50%';
                        successView.style.left = '50%';
                        successView.style.transform = 'translate(-50%, -50%)';
                        successView.style.width = '100%';
                        successView.style.height = 'auto';
                        successView.style.bottom = 'auto';
                        successView.style.right = 'auto';
                        successView.style.paddingBottom = '60px';
                        
                        successView.innerHTML = `
                            <div style="font-size: clamp(3rem, ${isFS ? '15vw' : '20vw'}, 7rem); font-family: 'twkai', serif; color: var(--text-main); line-height: 1.1; margin-bottom: 10px; animation: successPop 0.5s 0.1s cubic-bezier(0.34, 1.56, 0.64, 1) both;">
                                ${Utils.createInteractiveHanzi(displayWord, false)}
                            </div>
                            <div style="font-family: 'Nunito', sans-serif; font-size: 1.25rem; color: var(--primary); font-weight: 800; margin-bottom: 8px; animation: slideUpFade 0.4s 0.2s both;">
                                ${pinyinText}
                            </div>
                            <div style="font-family: 'Nunito', sans-serif; font-size: 1.05rem; color: var(--text-muted); font-weight: 600; padding: 0 10px; animation: slideUpFade 0.4s 0.3s both;">
                                ${item.def || ''}
                            </div>
                        `;
                        
                        successView.style.display = 'flex';
                        void successView.offsetWidth; 
                        successView.style.opacity = '1';

                        if (exitBtn) {
                            exitBtn.onclick = () => {
                                App.state.writingCharIndex = 0;
                                if (cardEl) {
                                    cardEl.style.opacity = '0';
                                    cardEl.style.transform = 'scale(0.96) translateY(10px)';
                                }
                                setTimeout(() => App.next(), 350);
                            };
                        }
                    }, 300);
                }
            }
        });
    };

    animateBtn.onclick = () => writer.animateCharacter();
    
    resetBtn.onclick = () => {
        if (successView && successView.style.display === 'flex') {
            App.state.writingCharIndex = 0;
            this.renderWriting(item);
            return;
        }
        
        writer.quiz({}); 
        
        if (exitBtn) {
            exitBtn.className = 'action-icon-btn text-danger';
            exitBtn.title = 'Exit Practice';
            exitBtn.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`;
            exitBtn.onclick = () => App.setMode('study');
        }
    };
    
    outlineToggle.onclick = () => {
        App.state.writingShowOutline = !App.state.writingShowOutline;
        if (App.saveSettings) App.saveSettings();
        if (App.state.writingShowOutline) {
            writer.showOutline();
            outlineToggle.classList.add('active');
        } else {
            writer.hideOutline();
            outlineToggle.classList.remove('active');
        }
    };
}})