Object.assign(window.UI, {
  renderStudy(item) {
    const pinyinStyle = App.state.noPinyin ? 'display:none' : 'font-size: 1.5rem; margin-bottom: 0.5rem;';

    const searchTerms = (item.hanzi || item.zh || '')
        .split(/[\/，,]/) 
        .map(t => t.replace(/[（(].*?[）)]/g, '').trim())
        .filter(t => t.length > 0);

    let primaryExample = null;
    let otherExamples = [];
    let isFromOtherLesson = false;

    this._exampleCache = this._exampleCache || new Map();
    const cacheKey = `${item.book}-${item.lesson}-${item.hanzi || item.zh}`;
    
    if (this._exampleCache.has(cacheKey)) {
        const cached = this._exampleCache.get(cacheKey);
        primaryExample = cached.primaryExample;
        otherExamples = cached.otherExamples;
        isFromOtherLesson = cached.isFromOtherLesson;
    } else {
        if (searchTerms.length > 0 && DATA.SENTENCES.length > 0) {
            const allMatches = DATA.SENTENCES.filter(s => searchTerms.some(term => s.zh.includes(term)));

            const itemBook = String(item.book_id || item.book || '');
            const itemLesson = String(item.lesson_id !== undefined ? item.lesson_id : (item.lesson || '0'));
            const itemDialogue = String(item.dialogue_id || item.dialogue || '');

            // Grouping for smart prioritization: Same Lesson > Same Book > Others
            const sameLesson = allMatches.filter(s => String(s.book_id || s.book) === itemBook && String(s.lesson_id !== undefined ? s.lesson_id : s.lesson) === itemLesson);
            const sameBook = allMatches.filter(s => String(s.book_id || s.book) === itemBook && String(s.lesson_id !== undefined ? s.lesson_id : s.lesson) !== itemLesson);
            const others = allMatches.filter(s => String(s.book_id || s.book) !== itemBook);

            // Within same lesson, prioritize current dialogue
            if (itemDialogue) {
                sameLesson.sort((a, b) => {
                    const aD = String(a.dialogue_id || a.dialogue || '');
                    const bD = String(b.dialogue_id || b.dialogue || '');
                    if (aD === itemDialogue && bD !== itemDialogue) return -1;
                    if (aD !== itemDialogue && bD === itemDialogue) return 1;
                    return 0;
                });
            }

            const sortedPool = [...sameLesson, ...sameBook, ...others];
            if (sortedPool.length > 0) {
                primaryExample = sortedPool[0];
                otherExamples = sortedPool.slice(1);
                const pBook = String(primaryExample.book_id || primaryExample.book || '');
                const pLesson = String(primaryExample.lesson_id !== undefined ? primaryExample.lesson_id : (primaryExample.lesson || ''));
                isFromOtherLesson = (pBook !== itemBook || pLesson !== itemLesson);
            }
        }
        this._exampleCache.set(cacheKey, { primaryExample, otherExamples, isFromOtherLesson });
    }

    App.state.currentExample = primaryExample;
    let studyWrapper = this.container.querySelector('.study-static-wrapper');
    
    if (!studyWrapper) {
        let animClass = App.state.skipFadeInOnce ? '' : 'fade-in';
        // Use swipe animations if navigation was triggered via m/n (Mastered/New)
        if (App.state.lastSwipe === 'right') animClass = 'swipe-in-right';
        else if (App.state.lastSwipe === 'left') animClass = 'swipe-in-left';

        this.container.innerHTML = `
        <div class="study-static-wrapper relative-center-wrapper ${animClass}">
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
    
    item._plainHanzi = item._plainHanzi || Utils.createInteractiveHanzi(item.hanzi || item.zh, false);
    if (!App.state.noHanziColor) {
        item._colorHanzi = item._colorHanzi || Utils.colorHanzi(item.hanzi || item.zh);
    }
    item._convertedPy = item._convertedPy || Utils.convertTones(item.pinyin || item.py);

    let exampleGroupsHtml = '';
    const allExamples = primaryExample ? [primaryExample, ...otherExamples] : otherExamples;
    if (allExamples && allExamples.length > 0) {
        const groups = new Map();
        allExamples.forEach(ex => {
            const book = ex.book != null ? String(ex.book) : '?';
            if (!groups.has(book)) groups.set(book, { book, items: [] });
            groups.get(book).items.push(ex);
        });

        const groupList = Array.from(groups.values()).sort((a, b) => {
            const bn = Number(a.book) - Number(b.book);
            if (!Number.isNaN(bn) && bn !== 0) return bn;
            return String(a.book).localeCompare(String(b.book));
        });

        exampleGroupsHtml = groupList.map((group, groupIdx) => {
            const groupItemsHtml = group.items
                .slice()
                .sort((a, b) => {
                    const l = Number(a.lesson) - Number(b.lesson);
                    if (l !== 0) return l;
                    const d = Number(a.dialogue) - Number(b.dialogue);
                    if (d !== 0) return d;
                    return Number(a.seq) - Number(b.seq);
                })
                .map((ex, idx) => {
                ex._cachedInteractive = ex._cachedInteractive || {};
                if (!ex._cachedInteractive[item.hanzi || item.zh]) {
                    ex._cachedInteractive[item.hanzi || item.zh] = Utils.createInteractiveSentence(ex.zh, item.hanzi || item.zh);
                }
                ex._convertedPy = ex._convertedPy || Utils.convertTones(ex.py);
                const isPrimary = primaryExample && ex === primaryExample;
                const lessonTag = ex.lesson != null ? `L${ex.lesson}` : 'L?';
                const lessonBg = ex.book != null ? Utils.getBookBg(ex.book) : 'rgba(255, 255, 255, 0.9)';
                const lessonColor = ex.book != null ? Utils.getBookColor(ex.book) : 'var(--text-muted)';
                return `
                    <div class="example-item ${isPrimary ? 'is-primary' : ''}">
                        <div class="example-item-meta"><span class="example-lesson-tag" style="background:${lessonBg}; color:${lessonColor};">${lessonTag}</span></div>
                        <div class="example-zh">${ex._cachedInteractive[item.hanzi || item.zh]}</div>
                        <div class="example-py" style="${App.state.noPinyin || App.state.noExamplePinyin ? 'display:none' : ''}">${ex._convertedPy}</div>
                        <div class="example-en" style="${App.state.noTranslation ? 'display:none' : ''}">${ex.en}</div>
                    </div>
                `;
            }).join('');

            const bookBg = Utils.getBookBg(group.book);
            const bookColor = Utils.getBookColor(group.book);

            return `
                <div class="example-group ${groupIdx === 0 ? 'expanded' : ''}">
                    <button class="example-group-header" type="button" data-action="toggle-example-group" style="background:${bookBg}; color:${bookColor};">
                        <div class="example-group-title">Book ${group.book}</div>
                        <span class="example-group-cue" aria-hidden="true">
                          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>
                        </span>
                        <svg class="example-group-chevron" viewBox="0 0 24 24" fill="currentColor"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>
                    </button>
                    <div class="example-group-body">
                        <div class="example-group-inner">
                            <div class="example-list">${groupItemsHtml}</div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // 20% chance to show a subtle hint at the bottom of the card
    const showHoldHint = Math.random() < 0.2;
    const holdHintHtml = showHoldHint ? `<div style="position: absolute; bottom: 25px; left: 0; right: 0; text-align: center; font-size: 0.75rem; color: #cbd5e1; font-weight: 700; pointer-events: none; letter-spacing: 0.5px; opacity: 0.7;">Hold to practice writing</div>` : '';

    frontFace.innerHTML = `
        <div class="face-content vocab-content">
            <div class="card-center-layout">
                <div class="hanzi-display hanzi-display hz-hero">${App.state.noHanziColor ? item._plainHanzi : item._colorHanzi}</div>
            </div>
            ${holdHintHtml}
        </div>
    `;

    backFace.innerHTML = `
        <div class="face-content vocab-content">
            <div class="study-back-main" style="min-height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center; width: 100%;">
                <div class="pinyin-display" style="${pinyinStyle}">${item._convertedPy}</div>
                <div class="hanzi-display hanzi-display hz-hero">${item._plainHanzi}</div>
                ${App.state.showHooks && item.hook ? `<div class="memory-hook"><span>💡</span> <span>${item.hook}</span></div>` : ''}
                <div class="def-display study-def" style="${App.state.noTranslation ? 'display:none' : ''}">${item.def}</div>
            </div>
            
            ${exampleGroupsHtml ? `
            <div class="example-section">
                <div class="example-section-title">Examples</div>
                <div class="example-groups">${exampleGroupsHtml}</div>
            </div>
            ` : ''}
        </div>
    `;
    studyWrapper.querySelector('#exampleBtnContainer').innerHTML = '';
  },

  renderSentences(item) {
    const pinyinStyle = App.state.noPinyin ? 'display:none' : 'font-size: 1.5rem; margin-bottom: 1rem;';
    item._zhHTML = item._zhHTML || Utils.createInteractiveSentence(item.zh);
    item._coloredPy = item._coloredPy || Utils.colorPinyin(item.py);

    let wrapper = this.container.querySelector('.sentence-static-wrapper');
    let animClass = App.state.skipFadeInOnce ? '' : 'fade-in';

    if (!wrapper) {
        if (App.state.lastSwipe === 'right') animClass = 'swipe-in-right';
        else if (App.state.lastSwipe === 'left') animClass = 'swipe-in-left';

        this.container.innerHTML = `
          <div class="sentence-static-wrapper card-wrapper relative-center-wrapper ${animClass}">
            <div class="card-container sentence-card-container">
                <div class="card" data-action="toggle-flip">
                    <div class="card__face card__face--front" id="sentenceFront"></div>
                    <div class="card__face card__face--back" id="sentenceBack"></div>
                </div>
            </div>
          </div>
        `;
        wrapper = this.container.querySelector('.sentence-static-wrapper');
    }

    const card = wrapper.querySelector('.card');
    
    if (App.state.skipFlipAnimationOnce) card.classList.add('no-flip-transition');
    if (App.state.isFlipped) card.classList.add('flipped');
    else card.classList.remove('flipped');
    
    if (App.state.skipFlipAnimationOnce) {
        App.state.skipFlipAnimationOnce = false;
        requestAnimationFrame(() => card.classList.remove('no-flip-transition'));
    }

    document.getElementById('sentenceFront').innerHTML = `
        <div class="face-content">
            <div class="card-center-layout"><div class="hanzi-display hz-sentence">${item._zhHTML}</div></div>
        </div>
    `;

    document.getElementById('sentenceBack').innerHTML = `
        <div class="face-content">
            <div class="card-center-layout">
                <div class="pinyin-display sentence-pinyin" style="${pinyinStyle}">${item._coloredPy}</div>
                <div class="hanzi-display hz-sentence-back">${item._zhHTML}</div>
                <div class="def-display sentence-def">${item.en}</div>
            </div>
        </div>
    `;
  },

  renderQuiz(item) {
    const isTrans = App.state.quizType === 'translate';
    const isDefOnly = !isTrans && App.state.quizDefOnly;
    
    const rawHz = (item.hanzi || item.zh || '').replace(/[^\u4e00-\u9fa5]/g, '');
    const charLen = rawHz.length || 1;
    let lenClass = '';
    let fontFam = '';
    let prompt = '';
    let promptLabel = '';

    if (!isTrans && !isDefOnly) {
        if (charLen === 3) lenClass = 'chars-3';
        else if (charLen >= 4) lenClass = 'chars-long';
        prompt = item._plainHanzi || (item._plainHanzi = Utils.createInteractiveHanzi(item.hanzi || item.zh, false));
        promptLabel = 'Type Pinyin';
        fontFam = "font-family: 'twkai', serif;";
    } else {
        prompt = item.def || item.en || '';
        promptLabel = isTrans ? 'Translate' : 'Type Definition';
        fontFam = "font-family: 'Nunito', sans-serif; font-size: 1.4rem; line-height: 1.5;";
    }

    if (!document.getElementById('quiz-shared-styles')) {
        const style = document.createElement('style');
        style.id = 'quiz-shared-styles';
        style.innerHTML = `
            .qz-wrap { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; width: 100%; padding: 20px; box-sizing: border-box; transition: all 0.4s cubic-bezier(0.2, 0.8, 0.2, 1); }
            .qz-card { width: 100%; max-width: 400px; background: #ffffff; border-radius: 28px; box-shadow: 0 10px 40px rgba(0,0,0,0.06); padding: 35px 25px; display: flex; flex-direction: column; align-items: center; border: 1px solid rgba(0,0,0,0.03); transition: all 0.4s cubic-bezier(0.2, 0.8, 0.2, 1); }
            .qz-label { font-family: 'Nunito', sans-serif; font-size: 0.8rem; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: #cbd5e1; margin-bottom: 15px; transition: all 0.3s; }
            .qz-prompt { font-size: 4.5rem; line-height: 1.2; color: var(--text-main); text-align: center; word-break: break-word; transition: all 0.4s cubic-bezier(0.2, 0.8, 0.2, 1); margin-bottom: 25px; }
            .qz-prompt.chars-long { font-size: 2.2rem; }
            .qz-prompt.chars-3 { font-size: 3rem; }
            .qz-input-wrap { width: 100%; position: relative; }
            .qz-input { width: 80%; margin: 0 auto; display: block; font-family: 'Nunito', sans-serif; font-size: 1.4rem; font-weight: 700; text-align: center; border: none; border-bottom: 2px solid #e2e8f0; border-radius: 0; padding: 8px 0; color: var(--text-main); background: transparent; outline: none; transition: border-color 0.3s ease, color 0.3s ease; box-sizing: border-box; -webkit-appearance: none; }
            .qz-input:focus { border-bottom-color: #94a3b8; }
            .qz-input::placeholder { color: #cbd5e1; font-weight: 600; font-size: 1.2rem; }
            .qz-input.state-correct { border-bottom-color: #34d399; color: #34d399; }
            .qz-input.state-wrong { border-bottom-color: #fb7185; color: #fb7185; animation: qz-shake 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97) both; }
            .qz-input.state-correct::placeholder, .qz-input.state-wrong::placeholder { color: transparent; }
            .qz-feedback { width: 100%; max-height: 0; opacity: 0; overflow: hidden; display: flex; flex-direction: column; align-items: center; transition: all 0.5s cubic-bezier(0.2, 0.8, 0.2, 1); }
            .qz-feedback.show { max-height: 300px; opacity: 1; margin-top: 16px; padding-top: 16px; border-top: 1px solid #f1f5f9; }
            .qz-fb-py { font-family: 'Nunito', sans-serif; font-size: 1.1rem; font-weight: 800; margin-bottom: 4px; text-align: center; }
            .qz-fb-def { font-family: 'Nunito', sans-serif; font-size: 1.05rem; font-weight: 700; color: #64748b; text-align: center; padding: 0 10px; line-height: 1.4; }
            .mc-option-btn { font-family: 'Nunito', sans-serif; background: #ffffff; border: 2px solid #e2e8f0; border-radius: 16px; padding: 16px; font-size: 1.1rem; font-weight: 700; color: var(--text-main); cursor: pointer; transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1); text-align: center; width: 100%; box-sizing: border-box; box-shadow: 0 2px 8px rgba(0,0,0,0.02); }
            .mc-option-btn:active { transform: scale(0.96); background: #f8fafc; }
            .mc-option-btn.state-correct { background: #34d399; border-color: #34d399; color: white; transform: scale(1.02); box-shadow: 0 8px 20px rgba(52,211,153,0.3); }
            .mc-option-btn.state-wrong { background: #fb7185; border-color: #fb7185; color: white; animation: qz-shake 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97) both; box-shadow: 0 8px 20px rgba(251,113,133,0.3); }
            .mc-option-btn.disabled { pointer-events: none; }
            @keyframes qz-shake { 0%, 100% { transform: translateX(0); } 20%, 60% { transform: translateX(-6px); } 40%, 80% { transform: translateX(6px); } }
            
            @media (max-width: 768px) {
                .qz-wrap.keyboard-open { justify-content: flex-start; padding-top: 25px; }
                .qz-wrap.keyboard-open .qz-card { padding: 20px 20px; border-radius: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.04); }
                .qz-wrap.keyboard-open .qz-label { margin-bottom: 5px; opacity: 0.6; font-size: 0.7rem; }
                .qz-wrap.keyboard-open .qz-prompt { font-size: 2.8rem; margin-bottom: 15px; }
                .qz-wrap.keyboard-open .qz-prompt.chars-long { font-size: 1.6rem; }
                .qz-wrap.keyboard-open .qz-prompt.chars-3 { font-size: 2rem; }
            }
        `;
        document.head.appendChild(style);
    }
    
    let animClass = App.state.skipFadeInOnce ? '' : 'fade-in';
    if (App.state.lastSwipe === 'right') animClass = 'swipe-in-right';
    else if (App.state.lastSwipe === 'left') animClass = 'swipe-in-left';

    this.container.innerHTML = `
        <div class="qz-wrap ${animClass}" id="quizWrap">
            <div class="qz-card" id="quizCard">
                <div class="qz-label">${promptLabel}</div>
                <div class="qz-prompt ${lenClass}" style="${fontFam}">${prompt}</div>
                <div class="qz-input-wrap">
                    <input type="text" id="userAnswer" class="qz-input" placeholder="Your answer..." autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="done">
                </div>
                <div class="qz-feedback" id="quizFeedback"></div>
            </div>
        </div>
    `;

    const input = document.getElementById('userAnswer');
    const feedback = document.getElementById('quizFeedback');
    const wrap = document.getElementById('quizWrap');

    if (input && wrap) {
        input.addEventListener('focus', () => {
            wrap.classList.add('keyboard-open');
            // Fight the browser's automatic scroll to prevent the progress bar from hiding
            let frame = 0;
            const keepPinned = () => {
                window.scrollTo(0, 0);
                document.body.scrollTop = 0;
                document.documentElement.scrollTop = 0;
                const app = document.getElementById('app');
                if (app) app.scrollTop = 0;
                frame++;
                if (frame < 30) requestAnimationFrame(keepPinned);
            };
            requestAnimationFrame(keepPinned);
        });
        input.addEventListener('blur', () => wrap.classList.remove('keyboard-open'));
    }

    let isProcessing = false;

    const check = () => {
      if (isProcessing) return;
      const val = input.value.trim();
      if (!val) return;
      const target = (isTrans ? item.py : item.pinyin || item.py).trim();
      const isCorrect = Utils.checkAnswer(val, target);
      
      const pinyinText = item._convertedPy || (item._convertedPy = Utils.convertTones(item.pinyin || item.py));
      const hanzi = item._plainHanzi || (item._plainHanzi = Utils.createInteractiveHanzi(item.hanzi || item.zh, false));
      const def = item.def || item.en;
      
      const themeColor = isCorrect ? '#34d399' : '#fb7185';
      
      if(isCorrect) {
         isProcessing = true;
         input.blur();
         input.classList.add('state-correct');
         
         feedback.innerHTML = `
             <div class="qz-fb-py" style="color: ${themeColor};">${pinyinText}</div>
             <div class="qz-fb-def">${def}</div>
         `;
         feedback.classList.add('show');
         
         App.speakText(item.hanzi || item.zh);
         App.state.streak++;
         if (typeof UI.updateStreak === 'function') UI.updateStreak();
         App.saveSettings();
         if (typeof UI.celebrate === 'function') UI.celebrate();
         
         setTimeout(() => {
             App.state.lastSwipe = 'right';
             App.next();
         }, App.state.fastNext ? 1000 : 2200);
      } else {
         App.speakText(item.hanzi || item.zh);
         input.classList.remove('shake', 'state-wrong');
         void input.offsetWidth;
         input.classList.add('shake', 'state-wrong');
         
         App.state.streak = 0;
         if (typeof UI.updateStreak === 'function') UI.updateStreak();
         App.saveSettings();
         
         const key = item.hanzi || item.zh;
         if (!App.state.sessionMistakes.includes(key)) App.state.sessionMistakes.push(key);
         if (window.Sound) window.Sound.play('wrong');
         
         setTimeout(() => {
             if (!isProcessing && input) {
                 input.classList.remove('shake', 'state-wrong');
             }
         }, 800);
      }
    };

    input.onkeyup = (e) => { if(e.key === 'Enter') check(); };
    setTimeout(() => { if (input) input.focus(); }, 350);
  },

  renderQuizMC(item) {
    const isTrans = App.state.quizType === 'translate';
    const rawHz = (item.hanzi || item.zh || '').replace(/[^\u4e00-\u9fa5]/g, '');
    const charLen = rawHz.length || 1;
    let lenClass = '';
    if (!isTrans) {
        if (charLen === 3) lenClass = 'chars-3';
        else if (charLen >= 4) lenClass = 'chars-long';
    }
    const prompt = item._plainHanzi || (item._plainHanzi = Utils.createInteractiveHanzi(item.hanzi || item.zh, false));
    const correctDef = (item.def || item.en).trim();
    const fontFam = isTrans ? "font-family: 'twkai', serif;" : "font-family: 'twkai', serif;";

    if (!document.getElementById('quiz-shared-styles')) {
        const style = document.createElement('style');
        style.id = 'quiz-shared-styles';
        style.innerHTML = `
            .qz-wrap { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; width: 100%; padding: 20px; box-sizing: border-box; transition: all 0.4s cubic-bezier(0.2, 0.8, 0.2, 1); }
            .qz-card { width: 100%; max-width: 400px; background: #ffffff; border-radius: 28px; box-shadow: 0 10px 40px rgba(0,0,0,0.06); padding: 35px 25px; display: flex; flex-direction: column; align-items: center; border: 1px solid rgba(0,0,0,0.03); transition: all 0.4s cubic-bezier(0.2, 0.8, 0.2, 1); }
            .qz-label { font-family: 'Nunito', sans-serif; font-size: 0.8rem; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: #cbd5e1; margin-bottom: 15px; transition: all 0.3s; }
            .qz-prompt { font-size: 4.5rem; line-height: 1.2; color: var(--text-main); text-align: center; word-break: break-word; transition: all 0.4s cubic-bezier(0.2, 0.8, 0.2, 1); margin-bottom: 25px; }
            .qz-prompt.chars-long { font-size: 2.2rem; }
            .qz-prompt.chars-3 { font-size: 3rem; }
            .qz-input-wrap { width: 100%; position: relative; }
            .qz-input { width: 80%; margin: 0 auto; display: block; font-family: 'Nunito', sans-serif; font-size: 1.4rem; font-weight: 700; text-align: center; border: none; border-bottom: 2px solid #e2e8f0; border-radius: 0; padding: 8px 0; color: var(--text-main); background: transparent; outline: none; transition: border-color 0.3s ease, color 0.3s ease; box-sizing: border-box; -webkit-appearance: none; }
            .qz-input:focus { border-bottom-color: #94a3b8; }
            .qz-input::placeholder { color: #cbd5e1; font-weight: 600; font-size: 1.2rem; }
            .qz-input.state-correct { border-bottom-color: #34d399; color: #34d399; }
            .qz-input.state-wrong { border-bottom-color: #fb7185; color: #fb7185; animation: qz-shake 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97) both; }
            .qz-input.state-correct::placeholder, .qz-input.state-wrong::placeholder { color: transparent; }
            .qz-feedback { width: 100%; max-height: 0; opacity: 0; overflow: hidden; display: flex; flex-direction: column; align-items: center; transition: all 0.5s cubic-bezier(0.2, 0.8, 0.2, 1); }
            .qz-feedback.show { max-height: 300px; opacity: 1; margin-top: 16px; padding-top: 16px; border-top: 1px solid #f1f5f9; }
            .qz-fb-py { font-family: 'Nunito', sans-serif; font-size: 1.1rem; font-weight: 800; margin-bottom: 4px; text-align: center; }
            .qz-fb-def { font-family: 'Nunito', sans-serif; font-size: 1.05rem; font-weight: 700; color: #64748b; text-align: center; padding: 0 10px; line-height: 1.4; }
            .mc-option-btn { font-family: 'Nunito', sans-serif; background: #ffffff; border: 2px solid #e2e8f0; border-radius: 16px; padding: 16px; font-size: 1.1rem; font-weight: 700; color: var(--text-main); cursor: pointer; transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1); text-align: center; width: 100%; box-sizing: border-box; box-shadow: 0 2px 8px rgba(0,0,0,0.02); }
            .mc-option-btn:active { transform: scale(0.96); background: #f8fafc; }
            .mc-option-btn.state-correct { background: #34d399; border-color: #34d399; color: white; transform: scale(1.02); box-shadow: 0 8px 20px rgba(52,211,153,0.3); }
            .mc-option-btn.state-wrong { background: #fb7185; border-color: #fb7185; color: white; animation: qz-shake 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97) both; box-shadow: 0 8px 20px rgba(251,113,133,0.3); }
            .mc-option-btn.disabled { pointer-events: none; }
            @keyframes qz-shake { 0%, 100% { transform: translateX(0); } 20%, 60% { transform: translateX(-6px); } 40%, 80% { transform: translateX(6px); } }
            
            @media (max-width: 768px) {
                .qz-wrap.keyboard-open { justify-content: flex-start; padding-top: 25px; }
                .qz-wrap.keyboard-open .qz-card { padding: 20px 20px; border-radius: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.04); }
                .qz-wrap.keyboard-open .qz-label { margin-bottom: 5px; opacity: 0.6; font-size: 0.7rem; }
                .qz-wrap.keyboard-open .qz-prompt { font-size: 2.8rem; margin-bottom: 15px; }
                .qz-wrap.keyboard-open .qz-prompt.chars-long { font-size: 1.6rem; }
                .qz-wrap.keyboard-open .qz-prompt.chars-3 { font-size: 2rem; }
            }
        `;
        document.head.appendChild(style);
    }
    
    let animClass = App.state.skipFadeInOnce ? '' : 'fade-in';
    if (App.state.lastSwipe === 'right') animClass = 'swipe-in-right';
    else if (App.state.lastSwipe === 'left') animClass = 'swipe-in-left';

    this.container.innerHTML = `
        <div class="qz-wrap ${animClass}" id="quizMcWrap">
            <div class="qz-card" id="quizMcCard">
                <div class="qz-label">Choose Meaning</div>
                <div class="qz-prompt ${lenClass}" style="${fontFam}">${prompt}</div>
                
                <div id="mcOptionsContainer" style="width:100%; display:flex; flex-direction:column; gap:12px; margin-top:30px;"></div>
                
                <div class="qz-feedback" id="quizMcFeedback"></div>
            </div>
        </div>
    `;

    const optionsContainer = document.getElementById('mcOptionsContainer');
    const feedback = document.getElementById('quizMcFeedback');
    
    const options = Utils.generateDefDistractors(item);
    
    optionsContainer.innerHTML = options.map((opt, i) => `
        <button class="mc-option-btn fade-in" data-def="${opt.replace(/"/g, '&quot;')}">${opt}</button>
    `).join('');

    let isProcessing = false;

    optionsContainer.querySelectorAll('.mc-option-btn').forEach(btn => {
        btn.onclick = () => {
            if (isProcessing) return;
            const selectedDef = btn.dataset.def;
            
            if (selectedDef === correctDef) {
                btn.classList.add('state-correct');
                isProcessing = true;
                optionsContainer.querySelectorAll('.mc-option-btn').forEach(b => {
                    b.classList.add('disabled');
                    if (b !== btn) b.style.opacity = '0.4';
                });
                
                const pinyinText = item._convertedPy || (item._convertedPy = Utils.convertTones(item.pinyin || item.py));
                const hanzi = item._plainHanzi || (item._plainHanzi = Utils.createInteractiveHanzi(item.hanzi || item.zh, false));
                
                App.speakText(item.hanzi || item.zh);
                
                feedback.innerHTML = `
                    <div class="qz-fb-py" style="color: #34d399;">${pinyinText}</div>
                `;
                feedback.classList.add('show');
                
                App.state.streak++;
                if (typeof UI.updateStreak === 'function') UI.updateStreak();
                App.saveSettings();
                if (window.Sound) window.Sound.play('correct');
                if (typeof UI.celebrate === 'function') UI.celebrate();
                
                setTimeout(() => {
                    App.state.lastSwipe = 'right';
                    App.next();
                }, App.state.fastNext ? 1000 : 2200);
            } else {
                btn.classList.remove('shake');
                void btn.offsetWidth;
                btn.classList.add('shake', 'state-wrong');
                App.speakText(item.hanzi || item.zh);
                
                App.state.streak = 0;
                if (typeof UI.updateStreak === 'function') UI.updateStreak();
                App.saveSettings();
                
                const key = item.hanzi || item.zh;
                if (!App.state.sessionMistakes.includes(key)) App.state.sessionMistakes.push(key);
                if (window.Sound) window.Sound.play('wrong');
            }
        };
    });
  },

  renderList() {
    if (!document.getElementById('listContent')) {
        const html = `
          <div id="listContent" class="list-view fade-in" style="display: flex; flex-direction: column; width: 100%; height: 100%; padding-bottom: 20px;">
              
              <div class="prof-list-board">
                  
                  <div class="prof-search-header">
                      <div class="prof-search-wrapper">
                          <svg class="prof-search-icon" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                              <circle cx="11" cy="11" r="8"></circle>
                              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                          </svg>
                          <input type="text" id="listSearch" class="prof-search-input" placeholder="Search dictionary..." autocomplete="off">
                          <button id="listSearchClear" class="prof-search-clear" style="display: none;">
                              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                                  <line x1="18" y1="6" x2="6" y2="18"></line>
                                  <line x1="6" y1="6" x2="18" y2="18"></line>
                              </svg>
                          </button>
                      </div>
                  </div>

                  <div id="listItemsContainer" class="prof-list-scroll"></div>

              </div>
          </div>
        `;
        this.container.innerHTML = html;
        
        const searchInput = document.getElementById('listSearch');
        const clearBtn = document.getElementById('listSearchClear');
        let debounceTimer;

        searchInput.addEventListener('input', (e) => {
          const val = e.target.value;
          clearBtn.style.display = val.length > 0 ? 'flex' : 'none';

          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
              const term = Utils.normalizeSearch(val);
              const filtered = App.state.activeList.filter(i => i.searchKey && i.searchKey.includes(term));
              this.populateList(filtered);
          }, 200);
        });

        clearBtn.addEventListener('click', () => {
            if (window.Sound) window.Sound.play('click');
            searchInput.value = '';
            clearBtn.style.display = 'none';
            searchInput.focus(); 
            this.populateList(App.state.activeList);
        });
    }
    
    this.populateList(App.state.activeList);
  },

  populateList(items) {
    const containerEl = document.getElementById('listItemsContainer');
    if (!containerEl) return;
    
    containerEl.innerHTML = ''; 
    
    if (!items || items.length === 0) {
        containerEl.innerHTML = `<div style="text-align:center; padding: 60px 20px; color: #94a3b8; font-family: 'Nunito', sans-serif; font-weight: 600;">No items found.</div>`;
        return;
    }

    const CHUNK_SIZE = 50; 
    let index = 0;
    
    // 🌟 Use a unique render ID to prevent race conditions during rapid typing in search
    const renderId = ++this._listRenderId || (this._listRenderId = 1);

    const renderChunk = () => {
        if (!document.getElementById('listItemsContainer')) return; 
        if (this._listRenderId !== renderId) return; // Abort if a new render started

        let chunkHTML = '';
        const end = Math.min(index + CHUNK_SIZE, items.length);
        
        for (; index < end; index++) {
            const item = items[index];
            const hz = item.hanzi || item.zh;
            const py = item.pinyin || item.py;
            const en = item.def || item.en;
            const isSentence = !!item.zh;
            
            // 🌟 CACHE HTML STRING IN THE ITEM OBJECT FOR INSTANT RE-RENDERS
            if (!item._listStaticHTML) {
                const hzHTML = item._interactiveHz || (item._interactiveHz = Utils.createInteractiveHanzi(hz));
                const pyHTML = item._coloredPy || (item._coloredPy = Utils.colorPinyin(py));
                const bookColor = window.Utils && Utils.getBookColor ? Utils.getBookColor(item.book) : '#ec4899';
                const bookBg = window.Utils && Utils.getBookBg ? Utils.getBookBg(item.book) : '#fce7f3';
                
                const safeHz = hz.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, '&quot;');
                const safePy = py.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, '&quot;');
                const safeEn = (en || '').replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, '&quot;');

                const onClickStr = `if(window.App && App.handleCharClick) App.handleCharClick(event, '${safeHz}', '${safePy}', '${safeEn}')`;

                let inner = '';
                if (isSentence) {
                    inner = `
                        <div class="prof-row-content">
                            <div class="prof-hz-sentence">${hzHTML}</div>
                            <div class="prof-py" style="[PY_DISPLAY] color: ${bookColor};">${pyHTML}</div>
                            <div class="prof-en">${en}</div>
                        </div>
                        <div class="prof-tag" style="color: ${bookColor}; background: ${bookBg}; align-self: flex-start;">B${item.book} L${item.lesson}</div>
                    `;
                } else {
                    inner = `
                        <div class="prof-hz-large">${hzHTML}</div>
                        <div class="prof-row-content" style="border-left: 2px solid rgba(0,0,0,0.03); padding-left: 16px; margin-left: 4px;">
                            <div class="prof-py" style="[PY_DISPLAY]">${pyHTML}</div>
                            <div class="prof-en">${en}</div>
                        </div>
                        <div class="prof-tag" style="color: ${bookColor}; background: ${bookBg};">B${item.book} L${item.lesson}</div>
                    `;
                }
                item._listStaticHTML = `<div class="prof-list-row fade-in" onclick="${onClickStr}">${inner}</div>`;
            }
            
            // 🌟 Linked "Hide Example Pinyin" to the sentences in the dictionary list!
            const pyDisplay = (App.state.noPinyin || (isSentence && App.state.noExamplePinyin)) ? 'display:none;' : '';
            chunkHTML += item._listStaticHTML.replace('[PY_DISPLAY]', pyDisplay);
        }
        
        containerEl.insertAdjacentHTML('beforeend', chunkHTML);

        if (index < items.length) {
            requestAnimationFrame(renderChunk);
        }
    };

    requestAnimationFrame(renderChunk);
  },

  renderBuilder(item) {
    this.container.innerHTML = `
      <div class="unstable-screen fade-in">
        <div class="unstable-icon">🚧🥺🚧</div>
        <h2 class="unstable-title">Under Construction</h2>
        <p class="unstable-text">The Sentence Builder is currently undergoing maintenance and is a bit unstable right now.<br><br>Check back soon!</p>
        <button class="btn-main" onclick="App.setMode('study')" style="margin-top: 24px; box-shadow: 0 8px 20px rgba(236, 72, 153, 0.3);">Go back to safety</button>
      </div>
    `;
    return; 
  },

  renderListening(item) {
    this.container.innerHTML = `
      <div class="unstable-screen fade-in">
        <div class="unstable-icon">🎧🛠️🥺</div>
        <h2 class="unstable-title">Tuning the Audio!</h2>
        <p class="unstable-text">The Listening Test is currently unstable and getting a tune-up.<br><br>Check back later!</p>
        <button class="btn-main" onclick="App.setMode('study')" style="margin-top: 24px; box-shadow: 0 8px 20px rgba(236, 72, 153, 0.3);">Go back to safety</button>
      </div>
    `;
    return;
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

    const rawWord = (item.hanzi || item.zh || '').replace(/[（(].*?[）)]/g, '');
    const word = rawWord.replace(/[^\u4e00-\u9fa5]/g, '');
    const chars = Array.from(word);

    if (!chars.length || App.state.writingCharIndex >= chars.length) {
        App.state.writingCharIndex = 0;
        App.next();
        return;
    }

    const currentChar = chars[App.state.writingCharIndex];
    const pinyinText = item._convertedPy || (item._convertedPy = Utils.convertTones(item.pinyin || item.py || '')); 
    const displayWord = word || rawWord.trim() || currentChar;
    item._plainDisplayHanzi = item._plainDisplayHanzi || Utils.createInteractiveHanzi(displayWord, false);
    const isMobile = window.innerWidth <= 768;
    const wrapperBottomPadding = isMobile ? 80 : 100;

    const inlineProgressHtml = chars.map((c, i) => {
        if (i < App.state.writingCharIndex) return `<div class="progress-dot filled"></div>`;
        if (i === App.state.writingCharIndex) return `<div class="progress-dot current"></div>`;
        return `<div class="progress-dot"></div>`;
    }).join('');

    const isFS = !!App.state.writingFullscreen;

    let wrapper = this.container.querySelector('#writingAppWrapper');
    
    let animClass = App.state.skipFadeInOnce ? '' : 'fade-in';
    if (App.state.lastSwipe === 'right') animClass = 'swipe-in-right';
    else if (App.state.lastSwipe === 'left') animClass = 'swipe-in-left';
    App.state.lastSwipe = null;

    if (!wrapper) {
        if (!document.getElementById('writing-styles')) {
            const style = document.createElement('style');
            style.id = 'writing-styles';
            style.innerHTML = `
                .premium-practice-card{background:rgba(255,255,255,.98);backdrop-filter:none;-webkit-backdrop-filter:none;border:1px solid rgba(255,158,181,.22);border-radius:36px;box-shadow:0 16px 40px rgba(255,158,181,.2);width:100%;max-width:320px;display:flex;flex-direction:column;overflow:hidden;transition:transform .4s cubic-bezier(0.34,1.56,0.64,1),opacity .4s ease;transform:scale(.96) translateY(10px);opacity:0;margin:auto;will-change:transform,opacity}.premium-practice-card.is-fullscreen{max-width:480px;width:90vw;aspect-ratio:1 / 1.15;max-height:calc(100vh - 160px);border-radius:40px;box-shadow:0 24px 50px rgba(255,158,181,.24)}.practice-card-header{padding:12px 20px;background:rgba(248,250,252,.7);border-bottom:2px dashed rgba(226,232,240,.8);cursor:pointer;transition:opacity .4s ease,background .2s}.practice-card-header:hover{background:rgba(241,245,249,.9)}.header-top-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}.writing-progress-dots{display:flex;gap:5px;align-items:center}.progress-dot{height:4px;width:12px;border-radius:4px;background:#e2e8f0;transition:all .3s ease}.progress-dot.filled{background:#94a3b8}.progress-dot.current{background:var(--primary);width:20px}.hint-text-wrapper{position:relative;height:24px;overflow:hidden}.hint-text-inner{transition:opacity .2s ease}.hint-def,.hint-py{position:absolute;left:0;top:0;width:100%;transition:transform .35s cubic-bezier(0.34,1.56,0.64,1),opacity .35s;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.hint-def{font-family:'Nunito',sans-serif;font-size:1.05rem;font-weight:700;color:var(--text-main);transform:translateY(0);opacity:1}.hint-py{font-family:'Nunito',sans-serif;font-size:1.05rem;font-weight:800;color:var(--primary);letter-spacing:.5px;transform:translateY(20px);opacity:0}.practice-card-header.show-py .hint-def{transform:translateY(-20px);opacity:0}.practice-card-header.show-py .hint-py{transform:translateY(0);opacity:1}.header-controls{display:flex;gap:14px;align-items:center}.swap-icon{color:#cbd5e1;transition:transform .3s;display:flex;align-items:center}.practice-card-header.show-py .swap-icon{transform:rotate(180deg);color:var(--primary)}.fs-toggle-btn-header{background:transparent;border:none;color:#cbd5e1;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:4px;transition:color .15s ease,background-color .15s ease;outline:none;border-radius:6px;margin-right:-4px}.fs-toggle-btn-header:hover{color:var(--primary);background:rgba(255,158,181,.08)}.fs-toggle-btn-header:active{transform:scale(.98)}.action-icon-btn{background:transparent;border:none;color:#94a3b8;width:50px;height:50px;cursor:pointer;border-radius:50%;transition:color .15s ease,background-color .15s ease;display:flex;align-items:center;justify-content:center;outline:none}.action-icon-btn:hover{background:#f8fafc;color:var(--text-main)}.action-icon-btn:active{transform:scale(.98)}.action-icon-btn.active{color:#fff;background:var(--primary)}.action-icon-btn.text-danger{color:#f43f5e}.action-icon-btn.text-danger:hover{background:#fff1f2}@keyframes successPop{0%{opacity:0;transform:scale(.8) translateY(10px)}60%{transform:scale(1.05) translateY(-2px)}100%{opacity:1;transform:scale(1) translateY(0)}}
                @keyframes dockEnter { 0% { opacity: 0; transform: translate(-50%, 150%) scale(0.9); pointer-events: none; } 100% { opacity: 1; transform: translate(-50%, 0) scale(1); pointer-events: auto; } }
                @keyframes dockExit { 0% { opacity: 1; transform: translate(-50%, 0) scale(1); } 100% { opacity: 0; transform: translate(-50%, 150%) scale(0.9); pointer-events: none; } }
                .dock-enter { animation: dockEnter 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards !important; }
                .dock-exit { animation: dockExit 0.25s cubic-bezier(0.4, 0, 0.2, 1) forwards !important; pointer-events: none !important; }
            `;
            document.head.appendChild(style);
        }
        const html = `

          <div id="writingAppWrapper" class="writing-wrapper ${animClass}" style="display: flex; flex-direction: row; width: 100%; height: 100%; justify-content: center; align-items: center; padding: max(20px, env(safe-area-inset-top)) 10px ${wrapperBottomPadding}px 10px; box-sizing: border-box; position: relative;">
            
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
                    
                    <div id="writingTarget" class="writing-target-inner" style="border-radius: 16px; display: flex; justify-content: center; align-items: center; transition: opacity 0.3s ease; touch-action: none;"></div>
                    
                    <div id="writingMessage" class="writing-msg" style="position: absolute; color:var(--text-muted); font-weight:700;">Loading...</div>
                    
                    <div id="writingSuccessView" style="position: absolute; top: 24px; left: 24px; right: 24px; bottom: 24px; display: none; flex-direction: column; justify-content: center; align-items: center; opacity: 0; transition: opacity 0.4s ease; z-index: 20; text-align: center; overflow-y: auto; scrollbar-width: none;"></div>
                </div>
            </div>
          </div>

            <div id="writingBottomDock" class="dock-enter" style="position: fixed; bottom: clamp(20px, 4vh, 35px); left: 50%; transform: translateX(-50%); z-index: 100; display: flex; justify-content: space-evenly; align-items: center; background: rgba(255, 255, 255, 0.96); padding: 8px 16px; border-radius: 100px; box-shadow: 0 8px 18px rgba(255, 158, 181, 0.08); border: 1px solid rgba(255, 255, 255, 0.9); width: calc(100% - 40px); max-width: 350px; will-change: transform, opacity;">
                <button class="action-icon-btn text-danger" id="exitFocusBtn" title="Exit Practice">
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                </button>
                <div style="width: 1px; height: 24px; background: rgba(0,0,0,0.1); margin: 0 4px;"></div>
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
        `;
        this.container.innerHTML = html;
        document.getElementById('cardHeaderToggle').onclick = function() { this.classList.toggle('show-py'); };
    }

    const textInner = document.getElementById('hintTextInner');
    const cardEl = document.getElementById('premiumPracticeCard');
    const targetEl = document.getElementById('writingTarget');
    const successView = document.getElementById('writingSuccessView');
    const headerToggle = document.getElementById('cardHeaderToggle');
    const fsToggleBtn = document.getElementById('fsToggleBtn');
    const exitBtn = document.getElementById('exitFocusBtn');
    
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
    
    if (exitBtn) exitBtn.onclick = () => App.setMode('study');

    if (successView) {
        successView.style.opacity = '0';
        successView.style.display = 'none';
        successView.innerHTML = '';
        
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
        const dotsEl = document.getElementById('writingProgressDots');
        if (dotsEl) dotsEl.innerHTML = inlineProgressHtml;
        document.getElementById('hintDef').textContent = item.def || 'Definition unavailable';
        document.getElementById('hintPy').textContent = pinyinText || 'Pinyin unavailable';
        
        if (App.state.writingCharIndex === 0 && headerToggle) {
            document.getElementById('cardHeaderToggle').classList.remove('show-py');
        }
        textInner.style.opacity = '1';
        
        if (cardEl) {
            cardEl.style.opacity = '1';
            cardEl.style.transform = 'scale(1) translateY(0)';
        }
        
        const dock = document.getElementById('writingBottomDock');
        if (dock) {
            dock.style.transition = '';
            dock.style.opacity = '';
            dock.style.transform = '';
            dock.style.pointerEvents = '';
            dock.classList.remove('dock-exit');
            void dock.offsetWidth; 
            dock.classList.add('dock-enter');
        }
    }, 150);

    // Prevent memory leaks by properly destroying the previous HanziWriter instance
    if (this._currentWriter) {
        try { this._currentWriter.cancelQuiz(); } catch(e){}
        try { if (typeof this._currentWriter.destroy === 'function') this._currentWriter.destroy(); } catch(e){}
        this._currentWriter = null;
    }

    targetEl.innerHTML = ''; 
    
    const animateBtn = document.getElementById('writingAnimateBtn');
    const resetBtn = document.getElementById('writingResetBtn');
    const outlineToggle = document.getElementById('writingOutlineToggle');
    [animateBtn, resetBtn, outlineToggle].forEach(b => b.disabled = true);

    if (typeof HanziWriter === 'undefined') {
        document.getElementById('writingMessage').textContent = 'Loading library...';
        App.loadHanziWriter().then(() => {
            if (typeof HanziWriter !== 'undefined') this.renderWriting(item);
            else document.getElementById('writingMessage').textContent = 'Failed to load library.';
        });
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

    const writer = this._currentWriter = HanziWriter.create('writingTarget', currentChar, {
        renderer: 'canvas', // 🌟 Bypasses expensive SVG DOM calculations
        width: dynamicSize, height: dynamicSize, padding: 5, 
        showCharacter: false, showOutline: App.state.writingShowOutline, 
        outlineColor: '#e2e8f0', strokeAnimationSpeed: 1, delayBetweenStrokes: 100,
        strokeColor: '#ff9eb5', radicalColor: '#8b5cf6', highlightColor: '#ff85a2',
        drawingWidth: 25, drawingFadeDuration: isMobile ? 100 : 400, // 🌟 Faster fade on mobile GPU
        onLoadCharDataSuccess: () => {
            document.getElementById('writingMessage').style.display = 'none';
            [animateBtn, resetBtn, outlineToggle].forEach(b => b.disabled = false);
            startQuiz();
            App.speakText(currentChar);
        },
        onLoadCharDataError: () => {
            document.getElementById('writingMessage').textContent = 'Character not found.';
        },
        onCorrectStroke: () => { if(window.Sound) window.Sound.play('click'); },
        onMistake: () => {
            if(window.Sound) window.Sound.play('wrong');
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
                if(window.Sound) window.Sound.play('correct');
                
                if (App.state.writingCharIndex < chars.length - 1) {
                    setTimeout(() => {
                        App.state.writingCharIndex++;
                        targetEl.style.opacity = '0';
                        setTimeout(() => this.renderWriting(item), 200);
                    }, 500);
                } else {
                    if (typeof UI.celebrate === 'function') UI.celebrate();
                    App.speakText(item.hanzi || item.zh);
                    
                    targetEl.style.opacity = '0';
                    if (headerToggle) headerToggle.style.opacity = '0';
                    
                    setTimeout(() => {
                        targetEl.style.visibility = 'hidden';
                        
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
                                ${item._plainDisplayHanzi}
                            </div>
                            <div style="font-family: 'Nunito', sans-serif; font-size: 1.25rem; color: var(--primary); font-weight: 800; margin-bottom: 8px; animation: slideUpFade 0.4s 0.2s both;">
                                ${pinyinText}
                            </div>
                            <div style="font-family: 'Nunito', sans-serif; font-size: 1.05rem; color: var(--text-muted); font-weight: 600; padding: 0 10px; animation: slideUpFade 0.4s 0.3s both;">
                                ${item.def || ''}
                            </div>
                            <div class="writing-controls">
                                <button class="writing-btn primary" onclick="App.state.writingCharIndex=0; App.state.lastSwipe='right'; App.next();" style="animation: slideUpFade 0.4s 0.4s both;">Next</button>
                            </div>
                        `;
                        
                        successView.style.display = 'flex';
                        void successView.offsetWidth; 
                        successView.style.opacity = '1';
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
  }
});
