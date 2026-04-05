Object.assign(window.UI, {
    renderStudy(item) {
      const rawHzStr = (item.hanzi || item.zh || '').replace(/[^\u4e00-\u9fa5]/g, '');
      const hzLen = rawHzStr.length || 1;
      let pinyinStyle = '';
      const studyHzClass = hzLen === 1
        ? 'study-hz-single'
        : hzLen === 2
          ? 'study-hz-duo'
          : hzLen === 3
            ? 'study-hz-trio'
            : 'study-hz-long';
  
      if (hzLen >= 8) {
        pinyinStyle = App.state.noPinyin ? 'display:none;' : 'font-size: 0.95rem; line-height: 1.3; margin-bottom: 0.25rem; font-weight: 700;';
      } else if (hzLen >= 5) {
        pinyinStyle = App.state.noPinyin ? 'display:none;' : 'font-size: 1.15rem; line-height: 1.2; margin-bottom: 0.25rem; font-weight: 700;';
      } else {
        pinyinStyle = App.state.noPinyin ? 'display:none;' : 'font-size: 1.5rem; line-height: 1.2; margin-bottom: 0.25rem; font-weight: 700;';
      }
  
      const searchTerms = (item.hanzi || item.zh || '')
        .split(/[\/，,]/)
        .map(t => t.replace(/[（(].*?[）)]/g, '').trim())
        .filter(t => t.length > 0);
  
      let primaryExample = null;
      let otherExamples = [];
      let isFromOtherLesson = false;
      const isCompactLandscapeStudy = window.matchMedia('(orientation: landscape) and (max-height: 500px) and (pointer: coarse)').matches;
  
      this._exampleCache = this._exampleCache || new Map();
      const cacheKey = `${item.book}-${item.lesson}-${item.hanzi || item.zh}`;
  
      if (this._exampleCache.has(cacheKey)) {
        const cached = this._exampleCache.get(cacheKey);
        primaryExample = cached.primaryExample;
        otherExamples = cached.otherExamples;
        isFromOtherLesson = cached.isFromOtherLesson;
      } else {
        if (searchTerms.length > 0 && DATA.SENTENCES.length > 0) {
          const allMatchesMap = new Map();
          const addMatch = (sentence) => {
            if (!sentence) return;
            const matchKey = `${sentence.book}-${sentence.lesson}-${sentence.dialogue}-${sentence.zh}`;
            if (!allMatchesMap.has(matchKey)) allMatchesMap.set(matchKey, sentence);
          };
          searchTerms.forEach(term => {
            if (!term) return;
            const zhChars = term.match(/[\u4e00-\u9fa5]/g);
            if (!zhChars || zhChars.length === 0) {
              DATA.SENTENCES.forEach(s => { if (s.zh.includes(term)) addMatch(s); });
              return;
            }
            const firstChar = zhChars[0];
            const candidates = DATA.SENTENCES_BY_CHAR[firstChar] || [];
            if (term.length === 1 && term === firstChar) {
              candidates.forEach(addMatch);
            } else {
              candidates.forEach(m => { if (m.zh.includes(term)) addMatch(m); });
            }
          });
          const allMatches = Array.from(allMatchesMap.values());
  
          const itemBook = String(item.book_id || item.book || '');
          const itemLesson = String(item.lesson_id !== undefined ? item.lesson_id : (item.lesson || '0'));
          const itemDialogue = String(item.dialogue_id || item.dialogue || '');
          const itemBookNum = parseInt(itemBook, 10);
          const itemLessonNum = parseInt(itemLesson, 10);
  
          const sortedPool = allMatches
            .map(s => {
              const sentenceText = String(s.zh || '');
              let score = 0;
              let bestMatchLength = 0;

              searchTerms.forEach(term => {
                if (!term || !sentenceText.includes(term)) return;
                bestMatchLength = Math.max(bestMatchLength, term.length);
                score += 180 + term.length * 24;
                const pos = sentenceText.indexOf(term);
                if (pos === 0) score += 18;
                else if (pos > 0) score += Math.max(0, 12 - pos);
              });

              const uniqueChars = new Set((item.hanzi || item.zh || '').match(/[\u4e00-\u9fa5]/g) || []);
              uniqueChars.forEach(char => {
                if (sentenceText.includes(char)) score += 9;
              });

              const sentenceBook = String(s.book_id || s.book || '');
              const sentenceLesson = String(s.lesson_id !== undefined ? s.lesson_id : (s.lesson || ''));
              const sentenceDialogue = String(s.dialogue_id || s.dialogue || '');
              const sentenceBookNum = parseInt(sentenceBook, 10);
              const sentenceLessonNum = parseInt(sentenceLesson, 10);
              const sameBook = sentenceBook === itemBook;
              const sameLesson = sameBook && sentenceLesson === itemLesson;

              if (sameLesson) {
                score += 56;
              } else if (sameBook) {
                score += 24;
                if (Number.isFinite(itemLessonNum) && Number.isFinite(sentenceLessonNum)) {
                  const lessonDistance = Math.abs(sentenceLessonNum - itemLessonNum);
                  score += Math.max(0, 24 - lessonDistance * 6);
                }
              } else if (Number.isFinite(itemBookNum) && Number.isFinite(sentenceBookNum)) {
                const bookDistance = Math.abs(sentenceBookNum - itemBookNum);
                score += Math.max(-18, 8 - bookDistance * 8);
              }

              if (sentenceDialogue && itemDialogue && sentenceDialogue === itemDialogue) score += sameLesson ? 18 : 12;
              score -= sentenceText.length * 0.55;

              return { ...s, _studyScore: score, _bestMatchLength: bestMatchLength };
            })
            .sort((a, b) => {
              if (b._studyScore !== a._studyScore) return b._studyScore - a._studyScore;
              if (b._bestMatchLength !== a._bestMatchLength) return b._bestMatchLength - a._bestMatchLength;
              return a.zh.length - b.zh.length;
            });

          if (sortedPool.length > 0) {
            primaryExample = sortedPool[0];
            otherExamples = sortedPool.slice(1);
            const pBook = String(primaryExample.book_id || primaryExample.book || '');
            const pLesson = String(primaryExample.lesson_id !== undefined ? primaryExample.lesson_id : (primaryExample.lesson || ''));
            isFromOtherLesson = pBook !== itemBook || pLesson !== itemLesson;
          }
        }
        this._exampleCache.set(cacheKey, { primaryExample, otherExamples, isFromOtherLesson });
      }
  
      App.state.currentExample = primaryExample;
      let studyWrapper = this.container.querySelector('.study-static-wrapper');
  
      if (!studyWrapper) {
        let animClass = App.state.skipFadeInOnce ? '' : 'fade-in';
        if (App.state.lastSwipe === 'right') animClass = 'swipe-in-right';
        else if (App.state.lastSwipe === 'left') animClass = 'swipe-in-left';
  
        this.container.innerHTML = `
          <div class="study-static-wrapper relative-center-wrapper ${animClass}">
            <div class="study-center-box">
              <div class="study-desktop-shell">
                <div class="card-group study-card-group">
                  <div class="card-container study-card-container">
                    <div class="card" data-action="toggle-flip">
                      <div class="card__face card__face--front"></div>
                      <div class="card__face card__face--back"></div>
                    </div>
                  </div>
                  <div id="exampleBtnContainer"></div>
                </div>
                <aside class="study-mini-breakdown" aria-label="Character breakdown"></aside>
              </div>
            </div>
          </div>
        `;
        studyWrapper = this.container.querySelector('.study-static-wrapper');
      }
  
      if (primaryExample) studyWrapper.classList.add('has-example');
      else studyWrapper.classList.remove('has-example');
      studyWrapper.classList.toggle('compact-landscape', isCompactLandscapeStudy);
  
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
  
      if (item._cleanHz === undefined) {
        let hz = item.hanzi || item.zh || '';
        let py = item.pinyin || item.py || '';
        if (hz.includes('/') || hz.includes('／')) {
          hz = hz.split(/[\/／]/)[0];
          py = py.split(/[\/／]/)[0];
        }
        item._cleanHz = hz.trim();
        item._cleanPy = py.trim();
      }
  
      if (!item._processedHanzi) {
        let hzStr = item._cleanHz;
        let plainHtml = '';
        let colorHtml = '';
  
        const parts = hzStr.split(/([（(].*?[）)])/g);
        parts.forEach(part => {
          if (!part) return;
          if (part.match(/^[（(].*[）)]$/)) {
            let inner = Utils.createInteractiveHanzi(part, false);
            let cInner = Utils.colorHanzi(part);
            plainHtml += `<span style="font-size: 0.55em; opacity: 0.7; margin: 0 2px; display: inline-block; vertical-align: middle;">${inner}</span>`;
            colorHtml += `<span style="font-size: 0.55em; opacity: 0.7; margin: 0 2px; display: inline-block; vertical-align: middle;">${cInner}</span>`;
          } else {
            plainHtml += Utils.createInteractiveHanzi(part, false);
            colorHtml += Utils.colorHanzi(part);
          }
        });
        item._plainHanzi = plainHtml;
        item._colorHanzi = colorHtml;
        item._processedHanzi = true;
      }
  
      // Disable smart pinyin, just use the clean normal pinyin
      item._convertedPy = item._cleanPy;
      const studyPinyinHtml = item._cleanPy;
  
      const posDetails = {
        N: { name: 'Noun', desc: 'A person, place, or thing.' },
        V: { name: 'Action Verb', desc: 'A general action or behavior.' },
        Vi: { name: 'Intransitive Action Verb', desc: 'An action that does not take an object (e.g. 哭 to cry).' },
        Vt: { name: 'Transitive Action Verb', desc: 'An action that takes a direct object (e.g. 吃 to eat).' },
        Vs: { name: 'Stative Verb', desc: 'Functions as an adjective in Chinese. Describes a state or property (e.g. 大 big, 漂亮 pretty).' },
        Vst: { name: 'Transitive Stative Verb', desc: 'A stative verb that takes an object (e.g. 喜歡 to like, 怕 to fear).' },
        'Vs-attr': { name: 'Attributive Stative Verb', desc: 'A modifier placed directly before a noun (e.g. 男 male, 金 gold).' },
        'Vs-pred': { name: 'Predicative Stative Verb', desc: 'Acts as the main verb/predicate of a sentence, but cannot directly modify a noun.' },
        'V-sep': { name: 'Separable Verb', desc: 'A verb-object phrase that can be split to insert other words (e.g. 睡覺 -> 睡了一個好覺).' },
        Vp: { name: 'Intransitive Process Verb', desc: 'Describes a natural process or change of state without an object (e.g. 死 to die, 破 to break).' },
        Vpt: { name: 'Transitive Process Verb', desc: 'Describes a process or change of state that affects an object.' },
        'Vp-sep': { name: 'Separable Process Verb', desc: 'A process verb that can be split into parts.' },
        Adv: { name: 'Adverb', desc: 'Modifies verbs or stative verbs (e.g. 很 very, 都 all).' },
        Conj: { name: 'Conjunction', desc: 'Connects words, phrases, or clauses (e.g. 和 and, 因為 because).' },
        Prep: { name: 'Preposition', desc: 'Placed before a noun to indicate location, time, or direction (e.g. 在 at, 從 from).' },
        M: { name: 'Measure Word', desc: 'A classifier used with numbers or determiners to count nouns (e.g. 個, 本).' },
        Ptc: { name: 'Particle', desc: 'A grammatical marker usually placed at the end of a sentence (e.g. 嗎, 呢, 了).' },
        Ph: { name: 'Phrase', desc: 'A set phrase, idiom, or common expression (e.g. 對不起 sorry).' },
        Det: { name: 'Determiner', desc: 'Specifies a noun, often preceding a measure word (e.g. 這 this, 那 that, 哪 which).' },
        Num: { name: 'Number', desc: 'A numerical value (e.g. 一, 二).' },
        Name: { name: 'Proper Noun', desc: 'A specific name of a person or place (e.g. 台灣 Taiwan).' },
        Suf: { name: 'Suffix', desc: 'Added to the end of words (e.g. 們 for plural).' }
      };
  
      let displayTypes = [];
      if (item.type) {
        displayTypes = item.type.split(/[\/,]/).map(t => {
          const cleanT = t.trim();
          const detail = posDetails[cleanT];
          if (detail) {
            const safeDesc = detail.desc.replace(/'/g, "\\'");
            const safeName = detail.name.replace(/'/g, "\\'");
            return `<span class="pos-tag" onclick="const box=document.getElementById('pos-explanation-box'); if(box){ box.innerHTML='<span style=\\'color:var(--primary-dark);font-weight:800;\\'>${safeName}:</span> ${safeDesc}'; box.style.display='block'; } event.stopPropagation();" style="position: relative; top: auto; right: auto; font-size: 0.7rem; color: #94a3b8; background: rgba(248, 250, 252, 0.8); border: 1px solid #e2e8f0; padding: 3px 8px; border-radius: 8px; cursor: pointer; transition: 0.2s; letter-spacing: 0.5px; display: inline-block; font-weight: 700; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">${detail.name}</span>`;
          }
          return `<span class="pos-tag" style="position: relative; top: auto; right: auto; font-size: 0.7rem; color: #94a3b8; background: rgba(248, 250, 252, 0.8); border: 1px solid #e2e8f0; padding: 3px 8px; border-radius: 8px; letter-spacing: 0.5px; display: inline-block; font-weight: 700; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">${cleanT}</span>`;
        });
      }
  
      const safeDefinition = App.sanitizeDefinition(item.def || item.en);
      const definitionText = safeDefinition;
      const hookText = String(item.hook || '').trim();
      const isDense = hzLen >= 4 || definitionText.length > 42 || hookText.length > 80 || displayTypes.length >= 2;
      const isVeryDense = hzLen >= 7 || definitionText.length > 78 || hookText.length > 135;
      const backMainClasses = `study-back-main${isDense ? ' is-dense' : ''}${isVeryDense ? ' is-very-dense' : ''}`;
      const backContentClasses = `face-content vocab-content${isDense ? ' is-dense' : ''}${isVeryDense ? ' is-very-dense' : ''}`;
      const frontHeroClasses = `hanzi-display hanzi-display hz-hero ${studyHzClass}`;
      const backHeroClasses = `hanzi-display hanzi-display hz-hero study-hz-back ${studyHzClass}${isDense ? ' study-hz-back-dense' : ''}`;
      const hasDefinition = !App.state.noTranslation && Boolean(safeDefinition);
      const hasPosTags = displayTypes.length > 0;
      const studyMetaClasses = [
        'study-meta-row',
        hasPosTags ? 'has-pos' : 'study-meta-row--solo',
        !hasDefinition && hasPosTags ? 'study-meta-row--tags-only' : ''
      ].filter(Boolean).join(' ');

      if (!App.state.noPinyin) {
        if (isVeryDense) {
          pinyinStyle = 'font-size: 0.88rem; line-height: 1.18; margin-bottom: 0.15rem; font-weight: 700;';
        } else if (isDense) {
          pinyinStyle = 'font-size: 1rem; line-height: 1.2; margin-bottom: 0.2rem; font-weight: 700;';
        }
      }
  
      let exampleGroupsHtml = '';
      let compactExampleHtml = '';
      const allExamples = primaryExample ? [primaryExample, ...otherExamples] : otherExamples;
      if (allExamples && allExamples.length > 0) {
        const groups = new Map();
        allExamples.forEach(ex => {
          const book = ex.book != null ? String(ex.book) : '?';
          if (!groups.has(book)) groups.set(book, { book, items: [] });
          groups.get(book).items.push(ex);
        });

        const sortExamples = (a, b) => {
          const aPrimary = primaryExample && a === primaryExample;
          const bPrimary = primaryExample && b === primaryExample;
          if (aPrimary && !bPrimary) return -1;
          if (!aPrimary && bPrimary) return 1;
          const scoreDelta = Number(b._studyScore || 0) - Number(a._studyScore || 0);
          if (scoreDelta !== 0) return scoreDelta;
          const matchDelta = Number(b._bestMatchLength || 0) - Number(a._bestMatchLength || 0);
          if (matchDelta !== 0) return matchDelta;
          const lessonDelta = Number(a.lesson) - Number(b.lesson);
          if (lessonDelta !== 0) return lessonDelta;
          const dialogueDelta = Number(a.dialogue) - Number(b.dialogue);
          if (dialogueDelta !== 0) return dialogueDelta;
          return Number(a.seq) - Number(b.seq);
        };
  
        const groupList = Array.from(groups.values()).sort((a, b) => {
          const primaryBook = primaryExample ? String(primaryExample.book != null ? primaryExample.book : (primaryExample.book_id || '?')) : null;
          if (primaryBook) {
            const aPrimary = String(a.book) === primaryBook;
            const bPrimary = String(b.book) === primaryBook;
            if (aPrimary && !bPrimary) return -1;
            if (!aPrimary && bPrimary) return 1;
          }
          const bn = Number(a.book) - Number(b.book);
          if (!Number.isNaN(bn) && bn !== 0) return bn;
          return String(a.book).localeCompare(String(b.book));
        });
  
        exampleGroupsHtml = groupList.map(group => {
          const groupItemsHtml = group.items
            .slice()
            .sort(sortExamples)
            .map(ex => {
              ex._cachedInteractive = ex._cachedInteractive || {};
              if (!ex._cachedInteractive[item.hanzi || item.zh]) {
                ex._cachedInteractive[item.hanzi || item.zh] = Utils.createInteractiveSentence(ex.zh, item.hanzi || item.zh);
              }
              // Use standard pinyin for examples as well
              ex._convertedPy = ex.py || '';
              const isPrimary = primaryExample && ex === primaryExample;
              const lessonTag = ex.lesson != null ? `L${ex.lesson}` : 'L?';
              const lessonBg = ex.book != null ? Utils.getBookBg(ex.book) : 'rgba(255, 255, 255, 0.9)';
              const lessonColor = ex.book != null ? Utils.getBookColor(ex.book) : 'var(--text-muted)';
              const primaryBadge = isPrimary ? `<span class="example-lesson-tag" style="background:var(--primary); color:white; margin-left:6px; box-shadow: 0 2px 4px rgba(255,158,181,0.3); border:none;">Top Match</span>` : '';
  
              return `
                <div class="example-item ${isPrimary ? 'is-primary' : ''}">
                  <div class="example-item-meta" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <div>
                      <span class="example-lesson-tag" style="background:${lessonBg}; color:${lessonColor}; border: 1px solid ${lessonColor}40;">${lessonTag}</span>
                      ${primaryBadge}
                    </div>
                    <button class="ex-speaker-btn" data-action="speak" data-text="${ex.zh}" title="Play Audio" style="background:rgba(255,158,181,0.15); border:none; color:var(--primary); cursor:pointer; padding:6px; border-radius:50%; display:flex; align-items:center; justify-content:center; box-shadow: 0 2px 6px rgba(255,158,181,0.2);">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
                    </button>
                  </div>
                  <div class="example-zh">${ex._cachedInteractive[item.hanzi || item.zh]}</div>
                  <div class="example-py" style="${App.state.noPinyin || App.state.noExamplePinyin ? 'display:none' : ''}">${ex._convertedPy}</div>
                  <div class="example-en" style="${App.state.noTranslation ? 'display:none' : ''}">${ex.en}</div>
                </div>
              `;
            }).join('');
  
          const bookBg = Utils.getBookBg(group.book);
          const bookColor = Utils.getBookColor(group.book);
  
          return `
            <div class="example-group ${primaryExample && String(group.book) === String(primaryExample.book) ? 'expanded' : ''}">
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

        const compactExamplesHtml = allExamples
          .slice()
          .sort(sortExamples)
          .map(ex => {
            ex._cachedInteractive = ex._cachedInteractive || {};
            if (!ex._cachedInteractive[item.hanzi || item.zh]) {
              ex._cachedInteractive[item.hanzi || item.zh] = Utils.createInteractiveSentence(ex.zh, item.hanzi || item.zh);
            }
            ex._convertedPy = ex.py || '';
            const isPrimary = primaryExample && ex === primaryExample;
            const lessonTag = ex.lesson != null ? `L${ex.lesson}` : 'L?';
            const lessonBg = ex.book != null ? Utils.getBookBg(ex.book) : 'rgba(255, 255, 255, 0.9)';
            const lessonColor = ex.book != null ? Utils.getBookColor(ex.book) : 'var(--text-muted)';
            const primaryBadge = isPrimary ? `<span class="example-lesson-tag study-compact-example-badge">Top Match</span>` : '';

            return `
              <div class="study-compact-example-card ${isPrimary ? 'is-primary' : ''}">
                <div class="study-compact-example-head">
                  <div class="study-compact-example-tags">
                    <span class="example-lesson-tag" style="background:${lessonBg}; color:${lessonColor}; border: 1px solid ${lessonColor}40;">${lessonTag}</span>
                    ${primaryBadge}
                  </div>
                  <button class="ex-speaker-btn" data-action="speak" data-text="${ex.zh}" title="Play Audio">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
                  </button>
                </div>
                <div class="example-zh">${ex._cachedInteractive[item.hanzi || item.zh]}</div>
                <div class="example-py" style="${App.state.noPinyin || App.state.noExamplePinyin ? 'display:none' : ''}">${ex._convertedPy}</div>
                <div class="example-en" style="${App.state.noTranslation ? 'display:none' : ''}">${ex.en || ''}</div>
              </div>
            `;
          }).join('');

        if (compactExamplesHtml) {
          compactExampleHtml = `<div class="study-compact-example-list">${compactExamplesHtml}</div>`;
        }
      }
  
      const breakdownHtml = this.buildStudyMiniBreakdown(item);

      const hookHtml = App.state.showHooks && item.hook ? `
        <section class="memory-hook-card">
          <div class="memory-hook-label">Memory Hook</div>
          <div class="memory-hook-text">${Utils.createHookMarkup(item.hook, item._cleanHz || item.hanzi || item.zh || '')}</div>
        </section>
      ` : '';
  
      const studyDefClasses = `def-display study-def${hzLen >= 5 ? ' study-def--compact' : ''}`;
      const frontHanziHtml = item._plainHanzi;
      const backHanziHtml = App.state.noHanziColor ? item._plainHanzi : item._colorHanzi;
      const showHoldHint = Math.random() < 0.2;
      const holdHintHtml = showHoldHint ? `<div style="position: absolute; bottom: 25px; left: 0; right: 0; text-align: center; font-size: 0.75rem; color: #cbd5e1; font-weight: 700; pointer-events: none; letter-spacing: 0.5px; opacity: 0.7;">Hold to practice writing</div>` : '';
  
      frontFace.innerHTML = `
        <div class="face-content vocab-content">
          <div class="card-center-layout">
            <div class="${frontHeroClasses}">${frontHanziHtml}</div>
          </div>
          ${holdHintHtml}
        </div>
      `;
  
      backFace.innerHTML = `
        <div class="${backContentClasses}" style="position: relative;">
          <div class="${backMainClasses}" style="margin: auto 0; display: flex; flex-direction: column; align-items: center; width: 100%;">
            <div class="study-back-core">
              <div class="study-pinyin-row">
                <div class="pinyin-display" style="${pinyinStyle}">${studyPinyinHtml}</div>
              </div>
              <div class="${backHeroClasses}">${backHanziHtml}</div>
              ${(hasDefinition || hasPosTags) ? `
                <div class="${studyMetaClasses}">
                  ${hasDefinition ? `<div class="${studyDefClasses}">${safeDefinition}</div>` : ''}
                  ${hasPosTags ? `<div class="study-pos-list">${displayTypes.join('')}</div>` : ''}
                </div>
              ` : ''}
              <div id="pos-explanation-box" style="display:none; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:8px 12px; margin-top:10px; font-size:0.85rem; color:#475569; text-align:center; max-width:85%; box-shadow:inset 0 2px 4px rgba(0,0,0,0.02); line-height:1.4;"></div>
            </div>
            ${hookHtml ? `<div class="study-back-hook-slot">${hookHtml}</div>` : ''}
          </div>
  
          ${(isCompactLandscapeStudy ? compactExampleHtml : exampleGroupsHtml) ? `
            <div class="example-section">
              <div class="example-section-title">${isCompactLandscapeStudy ? 'Example' : 'Examples'}</div>
              ${isCompactLandscapeStudy ? compactExampleHtml : `<div class="example-groups">${exampleGroupsHtml}</div>`}
            </div>
          ` : ''}
        </div>
      `;
      const breakdownHost = studyWrapper.querySelector('.study-mini-breakdown');
      if (breakdownHost) breakdownHost.innerHTML = breakdownHtml;
      studyWrapper.classList.toggle('has-breakdown', Boolean(breakdownHtml));
      this.attachStudyDesktopExpansion(studyWrapper);
      studyWrapper.querySelector('#exampleBtnContainer').innerHTML = '';
    },

    buildStudyMiniBreakdown(item) {
      const rawWord = String(item.hanzi || item.zh || '').replace(/[（(].*?[）)]/g, '');
      const uniqueChars = [...new Set(rawWord.match(/[\u4e00-\u9fa5]/g) || [])];
      if (!uniqueChars.length) return '';

      const escapeAttr = (value) => String(value || '').replace(/\\/g, "\\\\").replace(/'/g, "\\'");
      const charCardsHtml = uniqueChars.slice(0, 4).map(char => {
        const charData = DATA.CHARS && DATA.CHARS[char] ? DATA.CHARS[char] : {};
        const pinyin = Utils.formatNumberedPinyin(Array.isArray(charData.pinyin) ? charData.pinyin[0] : (charData.pinyin || ''));
        const definition = App.sanitizeDefinition(charData.def || charData.meaning).split(/[,;，\/]/)[0].trim() || 'Character';
        const topComponents = (charData.deconstruction_tree?.children || [])
          .slice(0, 4)
          .map(child => ({
            char: child.component || '?',
            pinyin: Utils.formatNumberedPinyin(Array.isArray(child.pinyin) ? child.pinyin[0] : (child.pinyin || '')),
            def: App.sanitizeDefinition(child.meaning).split(/[,;，\/]/)[0].trim() || 'Component'
          }))
          .filter(component => component.char && component.char !== '?');

        const relatedVocab = ((DATA.VOCAB_BY_CHAR && DATA.VOCAB_BY_CHAR[char]) || [])
          .filter(v => v && v.hanzi && v.hanzi !== rawWord && v.hanzi !== char)
          .slice(0, 4);
        const relatedComponents = (typeof App.findRelatedCharacters === 'function' ? App.findRelatedCharacters(char) : [])
          .filter(c => c && c.hanzi && c.hanzi !== rawWord && c.hanzi !== char)
          .slice(0, 6);
        const hint = typeof App.getVocabHint === 'function' ? App.getVocabHint(char) : null;
        const badgeHtml = hint
          ? `<span class="study-mini-char-badge" style="background:${hint.bg}; color:${hint.color}; border-color:${hint.color}40;">B${hint.book} L${hint.lesson}</span>`
          : '';
        const previewParts = topComponents.slice(0, 3).map(component => `
          <span class="study-mini-preview-glyph">${component.char}</span>
        `).join('');
        const previewHtml = previewParts ? `
          <div class="study-mini-char-preview">
            <div class="study-mini-preview-strip">${previewParts}</div>
            ${topComponents.length > 3 ? `<span class="study-mini-preview-more">+${topComponents.length - 3}</span>` : ''}
          </div>
        ` : '';

        const componentsHtml = topComponents.length
          ? topComponents.map(component => {
              const safeChar = escapeAttr(component.char);
              const safePy = escapeAttr(component.pinyin);
              const safeDef = escapeAttr(component.def);
              return `
                <button class="study-mini-component-chip" type="button" onclick="App.handleCharClick(event, '${safeChar}', '${safePy}', '${safeDef}')">
                  <span class="study-mini-component-hz">${component.char}</span>
                  <span class="study-mini-component-copy">
                    <span class="study-mini-component-py">${component.pinyin || ' '}</span>
                    <span class="study-mini-component-def">${component.def}</span>
                  </span>
                </button>
              `;
            }).join('')
          : `<div class="study-mini-empty">No parts yet</div>`;

        const relatedVocabHtml = relatedVocab.length
          ? relatedVocab.map(v => {
              const safeHz = escapeAttr(v.hanzi);
              const safePy = escapeAttr(v.pinyin || v.py || '');
              const safeDef = escapeAttr(App.sanitizeDefinition(v.def || v.en));
              const rowHint = typeof App.getVocabHint === 'function' ? App.getVocabHint(v.hanzi) : null;
              const rowBadge = rowHint
                ? `<span class="study-mini-inline-badge" style="background:${rowHint.bg}; color:${rowHint.color}; border-color:${rowHint.color}40;">B${rowHint.book} L${rowHint.lesson}</span>`
                : '';
              return `
                <button class="study-mini-inline-row" type="button" onclick="App.handleCharClick(event, '${safeHz}', '${safePy}', '${safeDef}')">
                  <span class="study-mini-inline-main">
                    <span class="study-mini-inline-hz">${v.hanzi}</span>
                    <span class="study-mini-inline-py">${v.pinyin || v.py || ''}</span>
                  </span>
                  ${rowBadge}
                </button>
              `;
            }).join('')
          : `<div class="study-mini-empty">No words yet</div>`;

        const relatedComponentsHtml = relatedComponents.length
          ? relatedComponents.map(componentWord => {
              const safeHz = escapeAttr(componentWord.hanzi);
              const safePy = escapeAttr(Utils.formatNumberedPinyin(Array.isArray(componentWord.pinyin) ? componentWord.pinyin[0] : (componentWord.pinyin || '')));
              const safeDef = escapeAttr(App.sanitizeDefinition(componentWord.def || componentWord.meaning));
              const rowHint = typeof App.getVocabHint === 'function' ? App.getVocabHint(componentWord.hanzi) : null;
              const rowBadge = rowHint
                ? `<span class="study-mini-inline-badge" style="background:${rowHint.bg}; color:${rowHint.color}; border-color:${rowHint.color}40;">B${rowHint.book} L${rowHint.lesson}</span>`
                : '';
              return `
                <button class="study-mini-inline-row" type="button" onclick="App.handleCharClick(event, '${safeHz}', '${safePy}', '${safeDef}')">
                  <span class="study-mini-inline-main">
                    <span class="study-mini-inline-hz">${componentWord.hanzi}</span>
                    <span class="study-mini-inline-def">${App.sanitizeDefinition(componentWord.def || componentWord.meaning).split(/[,;，\/]/)[0].trim()}</span>
                  </span>
                  ${rowBadge}
                </button>
              `;
            }).join('')
          : `<div class="study-mini-empty">No links yet</div>`;

        return `
          <section class="study-mini-char-card">
            <button
              class="study-mini-char-header"
              type="button"
              data-action="toggle-study-mini-char"
              aria-expanded="false"
            >
              <span class="study-mini-char-hero">${char}</span>
              <span class="study-mini-char-copy">
                <span class="study-mini-char-topline">
                  <span class="study-mini-char-py">${pinyin || ' '}</span>
                  ${badgeHtml}
                </span>
                <span class="study-mini-char-defline">${definition}</span>
              </span>
              <span class="study-mini-char-caret" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg>
              </span>
            </button>
            ${previewHtml}
            <div class="study-mini-char-body">
              <div class="study-mini-section">
                <div class="study-mini-section-title">Parts</div>
                <div class="study-mini-components">${componentsHtml}</div>
              </div>
              <details class="study-mini-dropdown">
                <summary>Words</summary>
                <div class="study-mini-dropdown-body">${relatedVocabHtml}</div>
              </details>
              <details class="study-mini-dropdown">
                <summary>Links</summary>
                <div class="study-mini-dropdown-body">${relatedComponentsHtml}</div>
              </details>
            </div>
          </section>
        `;
      }).join('');

      return charCardsHtml ? `
        <div class="study-mini-panel">
          <div class="study-mini-panel-header">
            <div class="study-mini-panel-title">Breakdown</div>
          </div>
          ${charCardsHtml}
        </div>
      ` : '';
    },

    attachStudyDesktopExpansion(studyWrapper) {
      this._studyDesktopWrapper = studyWrapper;
      if (!this._studyDesktopExpansionHandler) {
        this._studyDesktopExpansionHandler = () => {
          if (this._studyDesktopSyncFrame) return;
          this._studyDesktopSyncFrame = requestAnimationFrame(() => {
            this._studyDesktopSyncFrame = null;
            this.syncStudyDesktopExpansion();
          });
        };
        window.addEventListener('resize', this._studyDesktopExpansionHandler, { passive: true });
      }

      this.syncStudyDesktopExpansion();
    },

    syncStudyDesktopExpansion() {
      const wrapper = this._studyDesktopWrapper;
      if (!wrapper) return;
      const isDesktopWideStudyLayout = window.matchMedia('(min-width: 768px) and (min-height: 700px)').matches;
      const isCompactLandscapeStudyLayout = window.matchMedia('(orientation: landscape) and (max-height: 500px) and (pointer: coarse)').matches;
      const isWideStudyLayout = isDesktopWideStudyLayout || isCompactLandscapeStudyLayout;
      const shell = wrapper.querySelector('.study-desktop-shell');
      const shouldStack = isDesktopWideStudyLayout
        && shell
        && shell.clientWidth < 930
        && wrapper.classList.contains('has-breakdown');
      const shouldExpand = isWideStudyLayout
        && App.state.mode === 'study'
        && App.state.isFlipped
        && wrapper.classList.contains('has-breakdown');
      wrapper.classList.toggle('compact-landscape', isCompactLandscapeStudyLayout);
      wrapper.classList.toggle('desktop-stacked', Boolean(shouldStack));
      wrapper.classList.toggle('desktop-expanded', shouldExpand);
    },
  
    renderSentences(item) {
      const pinyinStyle = App.state.noPinyin ? 'display:none' : 'font-size: 1.5rem; margin-bottom: 1rem;';
      item._zhHTML = item._zhHTML || Utils.createInteractiveSentence(item.zh);
      
      // Disable smart pinyin, just use standard
      item._coloredPy = item.py || '';
  
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
      App.state.quizPrompt = App.state.quizPrompt || 'hz';
      App.state.quizAnswer = App.state.quizAnswer || 'py';
  
      if (App.state.quizPrompt === App.state.quizAnswer) {
        App.state.quizAnswer = App.state.quizPrompt === 'py' ? 'hz' : 'py';
      }
  
      const pType = App.state.quizPrompt;
      const aType = App.state.quizAnswer;
  
      const rawHz = (item.hanzi || item.zh || '').replace(/[^\u4e00-\u9fa5]/g, '');
      const charLen = rawHz.length || 1;
      let lenClass = '';
      if (charLen === 3) lenClass = 'chars-3';
      else if (charLen >= 4) lenClass = 'chars-long';
  
      if (item._cleanHz === undefined) {
        let hz = item.hanzi || item.zh || '';
        if (hz.includes('/') || hz.includes('／')) hz = hz.split(/[\/／]/)[0];
        item._cleanHz = hz.trim();
      }
      if (!item._processedHanzi) {
        let hzStr = item._cleanHz;
        let plainHtml = '';
        const parts = hzStr.split(/([（(].*?[）)])/g);
        parts.forEach(part => {
          if (!part) return;
          if (part.match(/^[（(].*[）)]$/)) {
            plainHtml += `<span style="font-size: 0.55em; opacity: 0.7; margin: 0 2px; display: inline-block; vertical-align: middle;">${Utils.createInteractiveHanzi(part, false)}</span>`;
          } else {
            plainHtml += Utils.createInteractiveHanzi(part, false);
          }
        });
        item._plainHanzi = plainHtml;
        item._processedHanzi = true;
      }
      if (item._cleanPy === undefined) {
        let py = item.pinyin || item.py || '';
        if (py.includes('/') || py.includes('／')) py = py.split(/[\/／]/)[0];
        item._cleanPy = py.replace(/[（(].*?[）)]/g, '').trim();
      }
  
      // Disable smart pinyin, just use standard clean py
      const pinyinText = item._cleanPy;
      const tonedPinyinText = Utils.formatNumberedPinyin(pinyinText || '');
      const hanziText = item._plainHanzi;
      const pureHanzi = item._cleanHz;
      const defText = App.sanitizeDefinition(item.def || item.en);
      const revealDefText = typeof App.compactDefinition === 'function'
        ? App.compactDefinition(defText, { fallback: '' })
        : defText;
  
      let prompt = '';
      let promptLabel = aType === 'hz' ? 'Type Character(s)' : 'Type Pinyin';
      const acceptedPinyinTargets = aType === 'py' ? App.getAcceptedPinyinTargets(item) : [];
      let target = aType === 'hz' ? pureHanzi : (acceptedPinyinTargets.join('|') || item._cleanPy);
      let fontFam = '';
      const answerModeLabel = aType === 'py' ? 'Pinyin' : aType === 'hz' ? 'Hanzi' : 'English';
      const inputPlaceholder = aType === 'py' ? 'Type pinyin' : aType === 'hz' ? 'Type answer' : 'Type meaning';
  
      if (pType === 'hz') {
        prompt = hanziText;
        fontFam = "font-family: 'twkai', serif;";
      } else if (pType === 'py') {
        prompt = pinyinText;
        fontFam = "font-family: 'Nunito', sans-serif; color: var(--primary-dark);";
        lenClass = 'chars-long';
      } else if (pType === 'def') {
        prompt = defText;
        fontFam = "font-family: 'Nunito', sans-serif; line-height: 1.4;";
        lenClass = 'chars-long';
      }
  
      const settingsHtml = `
        <button class="qz-settings-btn" onclick="document.getElementById('qzSettingsPopup').classList.toggle('active')" aria-label="Settings">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="12" x2="20" y2="12"></line><line x1="4" y1="6" x2="20" y2="6"></line><line x1="4" y1="18" x2="20" y2="18"></line></svg>
        </button>
        <div id="qzSettingsPopup" class="qz-settings-popup" style="background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); box-shadow: 0 10px 30px rgba(0,0,0,0.12); border: 1px solid rgba(255,255,255,0.6); border-radius: 16px;">
          <div style="font-size: 0.7rem; font-weight: 800; color: #cbd5e1; letter-spacing: 1px; margin-bottom: 6px; padding-left: 4px;">QUESTION</div>
          <button class="nav-popup-btn ${pType === 'hz' ? 'active' : ''}" onclick="UI.setQuizPrompt('hz', 'typing')">Hanzi</button>
          <button class="nav-popup-btn ${pType === 'py' ? 'active' : ''}" onclick="UI.setQuizPrompt('py', 'typing')">Pinyin</button>
          <button class="nav-popup-btn ${pType === 'def' ? 'active' : ''}" onclick="UI.setQuizPrompt('def', 'typing')">English</button>
          <div style="font-size: 0.7rem; font-weight: 800; color: #cbd5e1; letter-spacing: 1px; margin: 12px 0 6px 0; padding-left: 4px; border-top: 1px solid #f1f5f9; padding-top: 10px;">ANSWER</div>
          <button class="nav-popup-btn ${aType === 'hz' ? 'active' : ''}" onclick="UI.setQuizAnswer('hz', 'typing')">Hanzi</button>
          <button class="nav-popup-btn ${aType === 'py' ? 'active' : ''}" onclick="UI.setQuizAnswer('py', 'typing')">Pinyin</button>
        </div>
      `;
      const animClass = App.state.skipFadeInOnce ? '' : App.state.lastSwipe === 'right' ? 'swipe-in-right' : App.state.lastSwipe === 'left' ? 'swipe-in-left' : 'fade-in';
      const existingInput = document.getElementById('userAnswer');
      const wasTypingFocused = existingInput && document.activeElement === existingInput;

      let wrap = document.getElementById('quizWrap');
      if (!wrap) {
        this.container.innerHTML = `
          <div class="qz-wrap" id="quizWrap" style="position: relative;">
            <div class="qz-card qz-card--typing" id="quizCard">
              <div class="qz-settings-slot"></div>
              <div class="qz-label"></div>
              <div class="qz-prompt"></div>
              <div class="qz-input-wrap">
                <label class="qz-input-shell" for="userAnswer">
                  <input type="text" id="userAnswer" class="qz-input" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="next">
                </label>
                <div class="qz-reveal-box" id="quizRevealBox" aria-live="polite"></div>
              </div>
              <div class="qz-card-tag"></div>
            </div>
          </div>
        `;
        wrap = document.getElementById('quizWrap');
      }

      wrap.className = 'qz-wrap';
      if (animClass) {
        void wrap.offsetWidth;
        wrap.className = `qz-wrap ${animClass}`;
      }

      const card = document.getElementById('quizCard');
      const settingsSlot = card.querySelector('.qz-settings-slot');
      const labelEl = card.querySelector('.qz-label');
      const promptEl = card.querySelector('.qz-prompt');
      const input = document.getElementById('userAnswer');
      const revealBox = document.getElementById('quizRevealBox');
      const tagEl = card.querySelector('.qz-card-tag');

      card.dataset.answerType = aType;
      card.dataset.promptType = pType;
      settingsSlot.innerHTML = settingsHtml;
      labelEl.textContent = promptLabel;
      promptEl.className = `qz-prompt${lenClass ? ` ${lenClass}` : ''}`;
      promptEl.setAttribute('style', fontFam || '');
      promptEl.innerHTML = prompt;
      input.placeholder = inputPlaceholder;
      input.autofocus = true;
      input.setAttribute('inputmode', aType === 'py' ? 'latin' : 'text');
      input.value = '';
      input.className = 'qz-input';
      revealBox.className = 'qz-reveal-box';
      revealBox.innerHTML = `
        <div class="qz-reveal-head">Answer</div>
        <div class="qz-reveal-hz">${pureHanzi}</div>
        ${tonedPinyinText ? `<div class="qz-reveal-py">${tonedPinyinText}</div>` : ''}
        ${revealDefText ? `<div class="qz-reveal-def">${revealDefText}</div>` : ''}
      `;
      tagEl.textContent = answerModeLabel;
      const isMobileTyping = window.matchMedia('(max-width: 768px)').matches;
      let shouldHoldFocus = false;

      const focusInput = () => {
        if (!input) return;
        try {
          input.focus({ preventScroll: true });
        } catch {
          input.focus();
        }
        if (typeof input.setSelectionRange === 'function') {
          const end = input.value.length;
          try { input.setSelectionRange(end, end); } catch {}
        }
      };

      const captureViewportScroll = () => {
        this._quizViewportScrollY = window.scrollY || window.pageYOffset || 0;
      };

      const stabilizeViewport = () => {
        if (!isMobileTyping) return;
        const targetY = typeof this._quizViewportScrollY === 'number'
          ? this._quizViewportScrollY
          : (window.scrollY || window.pageYOffset || 0);
        const restore = () => {
          if (Math.abs((window.scrollY || window.pageYOffset || 0) - targetY) > 1) {
            window.scrollTo(0, targetY);
          }
        };
        requestAnimationFrame(restore);
        setTimeout(restore, 48);
        setTimeout(restore, 120);
      };
  
      if (input && wrap) {
        input.onpointerdown = captureViewportScroll;
        input.ontouchstart = captureViewportScroll;
        input.onfocus = () => {
          requestAnimationFrame(() => {
            stabilizeViewport();
            if (document.activeElement === input) wrap.classList.add('keyboard-open');
          });
        };
        input.onblur = () => {
          wrap.classList.remove('keyboard-open');
          if (!shouldHoldFocus) return;
          requestAnimationFrame(() => {
            if (document.getElementById('userAnswer') === input && document.activeElement !== input) {
              focusInput();
            }
          });
        };
        if (document.activeElement === input) wrap.classList.add('keyboard-open');
      }
  
      let isProcessing = false;
      const clearReveal = () => {
        if (!revealBox) return;
        revealBox.classList.remove('is-visible', 'is-correct', 'is-wrong');
      };

      const showReveal = (state) => {
        if (!revealBox) return;
        revealBox.classList.remove('is-correct', 'is-wrong');
        revealBox.classList.add('is-visible');
        if (state) revealBox.classList.add(state);
      };

      if (input) {
        input.oninput = () => {
          input.classList.remove('state-wrong', 'state-correct', 'shake');
          clearReveal();
        };
      }
  
      const check = () => {
        if (isProcessing) return;
        const val = input.value.trim();
        if (!val) return;
        if (isMobileTyping) {
          shouldHoldFocus = true;
          setTimeout(() => { shouldHoldFocus = false; }, 180);
        }
  
        let isCorrect = false;
        if (aType === 'py') {
          isCorrect = window.Utils && Utils.checkAnswer
            ? Utils.checkAnswer(val, target)
            : val.replace(/\s+/g, '').toLowerCase() === target.replace(/\s+/g, '').toLowerCase();
        } else {
          isCorrect = val.replace(/\s+/g, '') === target.replace(/\s+/g, '');
        }
  
        if (isCorrect) {
          isProcessing = true;
          clearReveal();
          input.classList.add('state-correct');
          showReveal('is-correct');
  
          App.speakText(item.hanzi || item.zh);
          App.state.streak++;
          if (typeof UI.updateStreak === 'function') UI.updateStreak();
          App.saveSettings();
          if (typeof UI.celebrate === 'function') UI.celebrate();
  
          if (isMobileTyping && App.state.fastNext) {
            setTimeout(() => {
              App.state.lastSwipe = 'right';
              App.next();
            }, 420);
          } else {
            setTimeout(() => {
              App.state.lastSwipe = 'right';
              App.next();
            }, App.state.fastNext ? 1000 : 2200);
          }
        } else {
          App.speakText(item.hanzi || item.zh);
          input.classList.remove('shake', 'state-wrong');
          void input.offsetWidth;
          input.classList.add('shake', 'state-wrong');
          showReveal('is-wrong');
  
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
  
      input.onkeydown = e => {
        if (e.key === 'Enter' && !e.isComposing) {
          e.preventDefault();
          check();
        }
      };
      input.onkeyup = null;
      if (isMobileTyping) {
        if (!wasTypingFocused) {
          requestAnimationFrame(() => requestAnimationFrame(focusInput));
        }
      } else {
        focusInput();
        requestAnimationFrame(focusInput);
        setTimeout(focusInput, 180);
      }
    },
  
    renderQuizMC(item) {
      App.state.mcPrompt = App.state.mcPrompt || 'hz';
      App.state.mcAnswer = App.state.mcAnswer || 'def';
  
      if (App.state.mcPrompt === App.state.mcAnswer) {
        const alts = ['def', 'hz', 'py'].filter(x => x !== App.state.mcPrompt);
        App.state.mcAnswer = alts[0];
      }
  
      const pType = App.state.mcPrompt;
      const aType = App.state.mcAnswer;
  
      const rawHz = (item.hanzi || item.zh || '').replace(/[^\u4e00-\u9fa5]/g, '');
      const charLen = rawHz.length || 1;
      let lenClass = '';
  
      if (item._cleanHz === undefined) {
        let hz = item.hanzi || item.zh || '';
        if (hz.includes('/') || hz.includes('／')) hz = hz.split(/[\/／]/)[0];
        item._cleanHz = hz.trim();
      }
      if (!item._processedHanzi) {
        let hzStr = item._cleanHz;
        let plainHtml = '';
        const parts = hzStr.split(/([（(].*?[）)])/g);
        parts.forEach(part => {
          if (!part) return;
          if (part.match(/^[（(].*[）)]$/)) {
            plainHtml += `<span style="font-size: 0.55em; opacity: 0.7; margin: 0 2px; display: inline-block; vertical-align: middle;">${Utils.createInteractiveHanzi(part, false)}</span>`;
          } else {
            plainHtml += Utils.createInteractiveHanzi(part, false);
          }
        });
        item._plainHanzi = plainHtml;
        item._processedHanzi = true;
      }
      if (item._cleanPy === undefined) {
        let py = item.pinyin || item.py || '';
        if (py.includes('/') || py.includes('／')) py = py.split(/[\/／]/)[0];
        item._cleanPy = py.trim();
      }
  
      // Disable smart pinyin, just use standard clean py
      const pinyinText = item._cleanPy;
      const defText = App.sanitizeDefinition(item.def || item.en);
      const hanziText = item._plainHanzi;
      const pureHanzi = item._cleanHz;
  
      let prompt = '';
      let promptLabel = aType === 'def' ? 'Choose Meaning' : aType === 'hz' ? 'Choose Character(s)' : 'Choose Pinyin';
      let fontFam = '';
      let correctAns = '';
      let options = [];
  
      const getDistractors = type => {
        const isSentence = item.zh && !item.hanzi;
        const globalPool = isSentence ? (typeof DATA !== 'undefined' ? DATA.SENTENCES : []) : (typeof DATA !== 'undefined' ? DATA.VOCAB : []);
        const pool = globalPool && globalPool.length > 0 ? globalPool : App.state.activeList;
        const choices = new Set();
        choices.add(correctAns);
        const targetCount = aType === 'hz' ? 4 : 3;
        let attempts = 0;
        const isTargetSingle = type === 'hz' && correctAns.length === 1;
  
        const sharedCharPool = [];
        if (type === 'hz') {
          const chars = correctAns.split('');
          pool.forEach(poolItem => {
            const hz = (poolItem.hanzi || poolItem.zh || '').split(/[\/／]/)[0].replace(/[（(].*?[）)]/g, '').trim();
            if (hz && hz !== correctAns && hz.length === correctAns.length && chars.some(c => hz.includes(c))) {
              sharedCharPool.push(hz);
            }
          });
        }
  
        while (choices.size < targetCount && attempts < 200 && choices.size < pool.length) {
          attempts++;
          let wrongStr = '';
  
          if (type === 'hz' && sharedCharPool.length > 0 && Math.random() < 0.5) {
            wrongStr = sharedCharPool[Math.floor(Math.random() * sharedCharPool.length)];
          } else {
            const randItem = pool[Math.floor(Math.random() * pool.length)];
            if (!randItem) continue;
            wrongStr = type === 'hz'
              ? (randItem.hanzi || randItem.zh || '').split(/[\/／]/)[0].replace(/[（(].*?[）)]/g, '').trim()
              : type === 'py'
                ? (randItem.pinyin || randItem.py || '').split(/[\/／]/)[0].replace(/[（(].*?[）)]/g, '').trim()
                : (randItem.def || randItem.en || '').trim();
          }
  
          if (type === 'hz') {
            if (isTargetSingle && wrongStr.length !== 1) continue;
            if (!isTargetSingle && wrongStr.length === 1) continue;
          }
          if (wrongStr) choices.add(wrongStr);
        }
        return Array.from(choices).sort(() => Math.random() - 0.5);
      };
  
      if (pType === 'hz') {
        prompt = hanziText;
        fontFam = "font-family: 'twkai', serif;";
        if (charLen === 3) lenClass = 'chars-3';
        else if (charLen >= 4) lenClass = 'chars-long';
      } else if (pType === 'py') {
        prompt = pinyinText;
        fontFam = "font-family: 'Nunito', sans-serif; font-size: 1.8rem; color: var(--primary-dark);";
        lenClass = 'chars-long';
      } else if (pType === 'def') {
        prompt = defText;
        fontFam = "font-family: 'Nunito', sans-serif; font-size: 1.6rem; line-height: 1.4;";
        lenClass = 'chars-long';
      }
  
      if (aType === 'def') {
        correctAns = defText;
        options = window.Utils && Utils.generateDefDistractors ? Utils.generateDefDistractors(item) : getDistractors('def');
        if (options.length > 3) {
          const wrong = options.filter(o => o !== correctAns).slice(0, 2);
          options = [correctAns, ...wrong].sort(() => Math.random() - 0.5);
        }
      } else if (aType === 'hz') {
        correctAns = pureHanzi;
        options = getDistractors('hz');
      } else if (aType === 'py') {
        correctAns = pinyinText;
        options = getDistractors('py');
      }
  
      const animClass = App.state.skipFadeInOnce ? '' : App.state.lastSwipe === 'right' ? 'swipe-in-right' : App.state.lastSwipe === 'left' ? 'swipe-in-left' : 'fade-in';
      let hzGridClass = aType === 'hz' ? 'is-hz-grid' : '';
      let hzBtnClass = aType === 'hz' ? ' is-hz' : '';
  
      const settingsHtml = `
        <button class="qz-settings-btn" onclick="document.getElementById('qzSettingsPopup').classList.toggle('active')" aria-label="Settings">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="12" x2="20" y2="12"></line><line x1="4" y1="6" x2="20" y2="6"></line><line x1="4" y1="18" x2="20" y2="18"></line></svg>
        </button>
        <div id="qzSettingsPopup" class="qz-settings-popup" style="background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); box-shadow: 0 10px 30px rgba(0,0,0,0.12); border: 1px solid rgba(255,255,255,0.6); border-radius: 16px;">
          <div style="font-size: 0.7rem; font-weight: 800; color: #cbd5e1; letter-spacing: 1px; margin-bottom: 6px; padding-left: 4px;">QUESTION</div>
          <button class="nav-popup-btn ${pType === 'hz' ? 'active' : ''}" onclick="UI.setQuizPrompt('hz', 'mc')">Hanzi</button>
          <button class="nav-popup-btn ${pType === 'py' ? 'active' : ''}" onclick="UI.setQuizPrompt('py', 'mc')">Pinyin</button>
          <button class="nav-popup-btn ${pType === 'def' ? 'active' : ''}" onclick="UI.setQuizPrompt('def', 'mc')">English</button>
          <div style="font-size: 0.7rem; font-weight: 800; color: #cbd5e1; letter-spacing: 1px; margin: 12px 0 6px 0; padding-left: 4px; border-top: 1px solid #f1f5f9; padding-top: 10px;">ANSWER</div>
          <button class="nav-popup-btn ${aType === 'hz' ? 'active' : ''}" onclick="UI.setQuizAnswer('hz', 'mc')">Hanzi</button>
          <button class="nav-popup-btn ${aType === 'py' ? 'active' : ''}" onclick="UI.setQuizAnswer('py', 'mc')">Pinyin</button>
          <button class="nav-popup-btn ${aType === 'def' ? 'active' : ''}" onclick="UI.setQuizAnswer('def', 'mc')">English</button>
        </div>
      `;
  
      this.container.innerHTML = `
        <div class="qz-wrap qz-wrap--mc ${animClass}" id="quizMcWrap" style="position: relative;">
          <div class="qz-card qz-card--mc" id="quizMcCard">
            ${settingsHtml}
            <div class="qz-label qz-label--mc">${promptLabel}</div>
            <div class="qz-prompt qz-prompt--mc ${lenClass}" style="${fontFam}">${prompt}</div>
            <div id="mcOptionsContainer" class="mc-options-container ${hzGridClass}"></div>
          </div>
        </div>
      `;
  
      const optionsContainer = document.getElementById('mcOptionsContainer');
  
      optionsContainer.innerHTML = options.map(opt => {
        let displayOpt = opt;
        let extraClass = '';
        if (aType === 'hz') {
          let formatted = '';
          const parts = opt.split(/([（(].*?[）)])/g);
          parts.forEach(part => {
            if (!part) return;
            if (part.match(/^[（(].*[）)]$/)) {
              formatted += `<span style="font-size: 0.55em; opacity: 0.7; margin: 0 2px; display: inline-block; vertical-align: middle;">${part}</span>`;
            } else {
              formatted += part;
            }
          });
          displayOpt = formatted;
  
          const cleanLen = opt.replace(/[（(].*?[）)]/g, '').trim().length;
          if (cleanLen >= 4) {
            extraClass = ' chars-long-btn';
          } else if (cleanLen === 3) {
            extraClass = ' chars-3-btn';
          }
        }
        return `<button class="mc-option-btn fade-in${extraClass}${hzBtnClass}" data-opt="${opt.replace(/"/g, '"')}"><span class="mc-truncate">${displayOpt}</span></button>`;
      }).join('');
  
      let isProcessing = false;
  
      optionsContainer.querySelectorAll('.mc-option-btn').forEach(btn => {
        btn.onclick = () => {
          if (isProcessing) return;
          const selectedOpt = btn.dataset.opt;
  
          if (selectedOpt === correctAns) {
            btn.classList.add('state-correct');
            isProcessing = true;
            optionsContainer.querySelectorAll('.mc-option-btn').forEach(b => {
              b.classList.add('disabled');
              if (b !== btn) b.style.opacity = '0.4';
            });
  
            App.speakText(item.hanzi || item.zh);
  
            let extraInfo = [];
            if (aType !== 'py' && pType !== 'py') extraInfo.push(pinyinText);
            if (aType !== 'def' && pType !== 'def') extraInfo.push(defText);
            if (aType !== 'hz' && pType !== 'hz') extraInfo.push(pureHanzi);
            let infoStr = extraInfo.join(' • ');
  
            let displayOpt = selectedOpt;
  
            if (aType === 'hz') {
              let formatted = '';
              const parts = selectedOpt.split(/([（(].*?[）)])/g);
              parts.forEach(part => {
                if (!part) return;
                if (part.match(/^[（(].*[）)]$/)) {
                  formatted += `<span style="font-size: 0.55em; opacity: 0.7; margin: 0 2px; display: inline-block; vertical-align: middle;">${part}</span>`;
                } else {
                  formatted += part;
                }
              });
              displayOpt = formatted;
  
              btn.innerHTML = `
                <div class="mc-truncate" style="font-weight: normal; margin-top: 6px;">${displayOpt}</div>
                <div class="mc-truncate" style="font-size: 1.1rem; font-weight: 800; color: #059669; margin-top: 8px; font-family: 'Nunito', sans-serif; letter-spacing: 0.5px;">${pinyinText}</div>
              `;
            } else {
              if (infoStr) {
                btn.innerHTML = `
                  <div class="mc-truncate" style="font-weight: 700;">${displayOpt}</div>
                  <div class="mc-truncate" style="font-size: 1.05rem; font-weight: 700; opacity: 0.85; line-height: 1.3; margin-top: 6px; font-family: 'Nunito', sans-serif;">${infoStr}</div>
                `;
              } else {
                btn.innerHTML = `<div class="mc-truncate" style="font-weight: 700;">${displayOpt}</div>`;
              }
            }
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
  
    setQuizPrompt(value, mode) {
      if (mode === 'typing') {
        App.state.quizPrompt = value;
        if (App.state.quizPrompt === App.state.quizAnswer) {
          App.state.quizAnswer = App.state.quizPrompt === 'py' ? 'hz' : 'py';
        }
      } else {
        App.state.mcPrompt = value;
        if (App.state.mcPrompt === App.state.mcAnswer) {
          const alts = ['def', 'hz', 'py'].filter(x => x !== App.state.mcPrompt);
          App.state.mcAnswer = alts[0];
        }
      }
      App.saveSettings();
      UI.render();
    },
  
    setQuizAnswer(value, mode) {
      if (mode === 'typing') {
        App.state.quizAnswer = value;
        if (App.state.quizPrompt === App.state.quizAnswer) {
          const alts = ['def', 'hz', 'py'].filter(x => x !== App.state.quizAnswer);
          App.state.quizPrompt = alts[0];
        }
      } else {
        App.state.mcAnswer = value;
        if (App.state.mcPrompt === App.state.mcAnswer) {
          const alts = ['def', 'hz', 'py'].filter(x => x !== App.state.mcAnswer);
          App.state.mcPrompt = alts[0];
        }
      }
      App.saveSettings();
      UI.render();
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
  
        searchInput.addEventListener('input', e => {
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
      const renderId = ++this._listRenderId || (this._listRenderId = 1);
  
      const renderChunk = () => {
        if (!document.getElementById('listItemsContainer')) return;
        if (this._listRenderId !== renderId) return;
  
        let chunkHTML = '';
        const end = Math.min(index + CHUNK_SIZE, items.length);
  
        for (; index < end; index++) {
          const item = items[index];
          const hz = item.hanzi || item.zh || '';
          const py = item.pinyin || item.py || '';
          const en = App.sanitizeDefinition(item.def || item.en);
          const isSentence = !!item.zh;
  
          if (!item._listStaticHTML) {
            const hzHTML = item._interactiveHz || (item._interactiveHz = Utils.createInteractiveHanzi(hz));
            // Use normal pinyin styling, disable colored Py
            const pyHTML = item.py || item.pinyin || '';
            const bookColor = window.Utils && Utils.getBookColor ? Utils.getBookColor(item.book) : '#ec4899';
            const bookBg = window.Utils && Utils.getBookBg ? Utils.getBookBg(item.book) : '#fce7f3';
  
            const safeHz = hz.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, '"');
            const safePy = py.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, '"');
            const safeEn = (en || '').replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, '"');
  
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
  
          const pyDisplay = App.state.noPinyin || (isSentence && App.state.noExamplePinyin) ? 'display:none;' : '';
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
      // Disable smart pinyin, just use standard
      const pinyinText = item.pinyin || item.py || '';
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
            .premium-practice-card{background:rgba(255,255,255,.98);backdrop-filter:none;-webkit-backdrop-filter:none;border:1px solid rgba(255,158,181,.22);border-radius:36px;box-shadow:0 16px 40px rgba(255,158,181,.2);width:100%;max-width:320px;display:flex;flex-direction:column;overflow:hidden;transition:transform .4s cubic-bezier(0.34,1.56,0.64,1),opacity .4s ease;transform:scale(.96) translateY(10px);opacity:0;margin:auto;will-change:transform,opacity}.premium-practice-card.is-fullscreen{max-width:480px;width:90vw;aspect-ratio:1 / 1.15;max-height:calc(100vh - 160px);border-radius:40px;box-shadow:0 24px 50px rgba(255,158,181,.24)}.practice-card-header{padding:12px 20px;background:rgba(248,250,252,.7);border-bottom:2px dashed rgba(226,232,240,.8);cursor:pointer;transition:opacity .4s ease,background .2s}.practice-card-header:hover{background:rgba(241,245,249,.9)}.header-top-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}.writing-progress-dots{display:flex;gap:5px;align-items:center}.progress-dot{height:4px;width:12px;border-radius:4px;background:#e2e8f0;transition:all .3s ease}.progress-dot.filled{background:#94a3b8}.progress-dot.current{background:var(--primary);width:20px}.hint-text-wrapper{position:relative;height:24px;overflow:hidden}.hint-text-inner{transition:opacity .2s ease}.hint-def,.hint-py{position:absolute;left:0;top:0;width:100%;transition:transform .35s cubic-bezier(0.34,1.56,0.64,1),opacity .35s;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.hint-def{font-family:'Nunito',sans-serif;font-size:1.05rem;font-weight:700;color:var(--text-main);transform:translateY(0);opacity:1}.hint-py{font-family:'Nunito',sans-serif;font-size:1.05rem;font-weight:800;color:var(--primary);letter-spacing:.5px;transform:translateY(20px);opacity:0}.practice-card-header.show-py .hint-def{transform:translateY(-20px);opacity:0}.practice-card-header.show-py .hint-py{transform:translateY(0);opacity:1}.header-controls{display:flex;gap:14px;align-items:center}.swap-icon{color:#cbd5e1;transition:transform .3s;display:flex;align-items:center}.practice-card-header.show-py .swap-icon{transform:rotate(180deg);color:var(--primary)}.fs-toggle-btn-header{background:transparent;border:none;color:#cbd5e1;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:4px;transition:color .15s ease,background-color .15s ease;outline:none;border-radius:6px;margin-right:-4px}.fs-toggle-btn-header:hover{color:var(--primary);background:rgba(255,158,181,.08)}.fs-toggle-btn-header:active{transform:scale(.98)}.writing-bottom-dock{position:fixed;left:50%;bottom:clamp(16px,3.4vh,28px);transform:translate3d(-50%,0,0);z-index:100;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;padding:6px;min-width:232px;width:min(calc(100% - 28px),272px);background:rgba(255,255,255,.72);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border:1px solid rgba(255,255,255,.72);border-radius:22px;box-shadow:0 14px 28px rgba(216,180,193,.12),0 4px 10px rgba(148,163,184,.08);will-change:transform,opacity}.action-icon-btn{background:rgba(255,255,255,.56);border:1px solid rgba(255,255,255,.52);color:#9f95a1;width:100%;height:42px;cursor:pointer;border-radius:14px;transition:transform .2s cubic-bezier(.22,1,.36,1),color .16s ease,background-color .16s ease,border-color .16s ease,box-shadow .16s ease;display:flex;align-items:center;justify-content:center;outline:none;will-change:transform}.action-icon-btn:hover{background:rgba(255,255,255,.85);color:#7d7280;border-color:rgba(232,197,210,.88)}.action-icon-btn:active{transform:translate3d(0,1px,0) scale(.97)}.action-icon-btn.active{color:var(--primary-dark);background:rgba(255,247,250,.94);border-color:rgba(232,197,210,.92);box-shadow:inset 0 1px 0 rgba(255,255,255,.88),0 6px 12px rgba(246,183,201,.12)}.action-icon-btn.text-danger{color:#ab94a0}.action-icon-btn.text-danger:hover{color:#8f7380;background:rgba(255,248,250,.9);border-color:rgba(234,205,216,.9)}@keyframes successPop{0%{opacity:0;transform:scale(.8) translateY(10px)}60%{transform:scale(1.05) translateY(-2px)}100%{opacity:1;transform:scale(1) translateY(0)}}
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
  
          <div id="writingBottomDock" class="writing-bottom-dock dock-enter">
            <button class="action-icon-btn text-danger" id="exitFocusBtn" title="Exit Practice">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>
            <button class="action-icon-btn" id="writingAnimateBtn" title="Watch Stroke Order">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
            </button>
            <button class="action-icon-btn ${App.state.writingShowOutline ? 'active' : ''}" id="writingOutlineToggle" title="Toggle Guidelines">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M3 3v18h18V3H3zm16 16H5V5h14v14zM11 7h2v2h-2zM7 7h2v2H7zm8 0h2v2h-2zm-8 4h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2zm-8 4h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z"/></svg>
            </button>
            <button class="action-icon-btn" id="writingResetBtn" title="Retry Character">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
            </button>
          </div>
        `;
        this.container.innerHTML = html;
        document.getElementById('cardHeaderToggle').onclick = function () { this.classList.toggle('show-py'); };
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
  
        fsToggleBtn.onclick = e => {
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
        const safeDefinition = App.sanitizeDefinition(item.def || item.en);
        document.getElementById('hintDef').textContent = safeDefinition || 'Definition unavailable';
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
  
      if (this._currentWriter) {
        try { this._currentWriter.cancelQuiz(); } catch (e) {}
        try { if (typeof this._currentWriter.destroy === 'function') this._currentWriter.destroy(); } catch (e) {}
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
        renderer: 'canvas',
        width: dynamicSize,
        height: dynamicSize,
        padding: 5,
        showCharacter: false,
        showOutline: App.state.writingShowOutline,
        outlineColor: '#e2e8f0',
        strokeAnimationSpeed: 1,
        delayBetweenStrokes: 100,
        strokeColor: '#ff9eb5',
        radicalColor: '#8b5cf6',
        highlightColor: '#ff85a2',
        drawingWidth: App.state.writingHideDrawing ? 0 : 25,
        drawingColor: App.state.writingHideDrawing ? 'transparent' : '#64748b',
        drawingFadeDuration: 300,
        onLoadCharDataSuccess: () => {
          document.getElementById('writingMessage').style.display = 'none';
          [animateBtn, resetBtn, outlineToggle].forEach(b => b.disabled = false);
          startQuiz();
          App.speakText(currentChar);
        },
        onLoadCharDataError: () => {
          document.getElementById('writingMessage').textContent = 'Character not found.';
        },
        onCorrectStroke: () => { if (window.Sound) window.Sound.play('click'); },
        onMistake: () => {
          if (window.Sound) window.Sound.play('wrong');
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
            if (window.Sound) window.Sound.play('correct');
  
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
                    ${App.sanitizeDefinition(item.def || item.en)}
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
