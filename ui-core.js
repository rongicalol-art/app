const UI = {
  container: document.getElementById('mainContainer'),
  
  // 🌟 PRE-RENDER SVGs ONCE TO PREVENT RE-PARSING ON EVERY CLICK
  subModes: {
      'study': [
          { label: 'Cards', mode: 'study', icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h16v12zM6 10h12v2H6zm0 4h8v2H6z"/></svg>' },
          { label: 'List', mode: 'list', icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/></svg>' }
      ],
      'sentences': [
          { label: 'Read', mode: 'sentences', icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>' },
          { label: 'Build', mode: 'builder', icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/></svg>' }
      ],
      'quiz': [
          { label: 'Type', mode: 'quiz', icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>' },
          { label: 'Choice', mode: 'quiz-mc', icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>' },
          { label: 'Listen', mode: 'listening', icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 3v9.28c-.47-.17-.97-.28-1.5-.28C8.01 12 6 14.01 6 16.5S8.01 21 10.5 21c2.31 0 4.2-1.75 4.45-4H15V6h4V3h-7z"/></svg>' }
      ]
  },

init() {
    document.body.style.height = '100dvh';
    document.body.style.minHeight = '-webkit-fill-available'; 
    document.body.style.overflowX = 'hidden';
    document.body.style.display = 'flex';
    document.body.style.flexDirection = 'column';
    
    this.container.style.flex = '1';
    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'column';
    this.container.style.justifyContent = 'center';
    this.container.style.alignItems = 'center';
    this.container.style.overflowY = 'auto';
    this.container.style.webkitOverflowScrolling = 'touch';

    document.querySelectorAll('.nav-item').forEach(btn => {
      if (btn.dataset.action) {
          btn.addEventListener('click', (e) => {
              e.stopPropagation();
          });
          return;
      }

      btn.addEventListener('click', (e) => {
        const mode = btn.dataset.mode;

        if (UI.subModes[mode]) {
            e.stopPropagation();
            this.showNavPopup(btn, UI.subModes[mode]);
        } else {
            App.setMode(mode);
        }
      });
    });

    document.body.classList.remove('dock-hidden');
    if (App.state.hideDock) {
        App.state.hideDock = false;
        App.saveSettings();
    }

    document.addEventListener('click', () => {
        this.closePopups();
    });

    document.getElementById('settingsBtn')?.addEventListener('click', () => {
      const settingsContent = document.getElementById('settingsModalContent');
      if (settingsContent) settingsContent.scrollTop = 0;
      document.getElementById('settingsModal').classList.add('open');
    });
    // --- NEW TAB SWITCHING LOGIC ---
    document.querySelectorAll('.settings-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            // Remove active state from all tabs
            document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
            // Add active state to the clicked tab
            e.target.classList.add('active');
            
            // Hide all content panes
            document.querySelectorAll('.settings-section-pane').forEach(p => p.classList.remove('active'));
            // Show the target pane
            const targetId = e.target.dataset.tab;
            document.getElementById(targetId)?.classList.add('active');
        });
    });

    document.getElementById('shuffleBtn')?.addEventListener('click', () => {
      const btn = document.getElementById('shuffleBtn');
      btn.classList.add('shuffling');
      setTimeout(() => btn.classList.remove('shuffling'), 500);
      
      App.state.shuffle = !App.state.shuffle;
      btn.classList.toggle('active', App.state.shuffle);
      App.state.modeCache = {};
      App.saveSettings();
      App.updateActiveList();
      UI.render();
    });

    document.getElementById('autoPlayBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (App.state.autoPlay) App.stopAutoPlay();
      else App.startAutoPlay();
      this.updateAutoPlayButton();
    });

    document.getElementById('lessonBadge')?.addEventListener('click', (e) => {
      e.stopPropagation();
      UI.showCourseSelector();
    });

    document.querySelectorAll('.modal-overlay').forEach(modal => {
      // Bind to all close buttons inside the modal
      modal.querySelectorAll('.modal-close').forEach(closeBtn => {
        closeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          modal.classList.remove('open');
        });
      });
      
      // Allow clicking the background overlay to close
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.remove('open');
        }
      });
    });
    
    document.querySelectorAll('.speed-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        App.state.ttsRate = parseFloat(btn.dataset.rate);
        UI.updateSpeedButtons();
        App.saveSettings();
      });
    });

    const bindToggle = (id, propName, onUpdate) => {
        const el = document.getElementById(id);
        if (el) {
            el.checked = App.state[propName];
            el.addEventListener('change', (e) => {
                App.state[propName] = e.target.checked;
                App.saveSettings();
                if(onUpdate) onUpdate();
            });
        }
    };

    const bindSlider = (id, propName, displayId, formatText, onUpdate) => {
        const el = document.getElementById(id);
        const displayEl = document.getElementById(displayId);
        if (el) {
            el.value = App.state[propName] || el.value;
            if (displayEl) displayEl.textContent = formatText(el.value);
            el.addEventListener('input', (e) => {
                if (displayEl) displayEl.textContent = formatText(e.target.value);
            });
            el.addEventListener('change', (e) => {
                App.state[propName] = parseFloat(e.target.value);
                App.saveSettings();
                if (onUpdate) onUpdate();
            });
        }
    };

    const island = document.getElementById('dynamicIsland');
    if (island) {
        const badge = document.getElementById('lessonBadge');
        if (badge && !document.getElementById('clearReviewBtn')) {
            const resetBtn = document.createElement('button');
            resetBtn.id = 'clearReviewBtn';
            resetBtn.title = "Restart & Clear Learned";
            resetBtn.style.cssText = "background: rgba(255, 158, 181, 0.15); border: none; color: var(--primary); cursor: pointer; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); flex-shrink: 0;";
            resetBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`;
            resetBtn.onmouseover = () => resetBtn.style.transform = 'rotate(90deg) scale(1.1)';
            resetBtn.onmouseout = () => resetBtn.style.transform = 'rotate(0deg) scale(1)';
            badge.insertAdjacentElement('afterend', resetBtn);
        }

        island.addEventListener('click', (e) => {
            if (e.target.closest('#lessonBadge') || e.target.closest('#shuffleBtn') || e.target.closest('#settingsBtn') || e.target.closest('#clearReviewBtn')) return;
            island.classList.toggle('expanded');
        });
        
        document.addEventListener('click', (e) => {
            if (!island.contains(e.target) && island.classList.contains('expanded')) {
                island.classList.remove('expanded');
            }
        });
    }

    bindToggle('quizDefOnlyToggle', 'quizDefOnly', () => { if (App.state.mode === 'quiz') UI.render(); });
    
    if (typeof App.state.noExamplePinyin === 'undefined') App.state.noExamplePinyin = true;
    bindToggle('noExamplePinyinToggle', 'noExamplePinyin', () => {
        this.updateExamplePinyinState();
        UI.render();
    });
    this.updateExamplePinyinState();

    bindToggle('noPinyinToggle', 'noPinyin', () => UI.render());
    bindToggle('noHanziColorToggle', 'noHanziColor', () => UI.render());
    bindToggle('noTranslationToggle', 'noTranslation', () => UI.render());
    bindToggle('fastNextToggle', 'fastNext');
    bindToggle('listeningToneTestToggle', 'listeningToneTest', () => { if (App.state.mode === 'listening') UI.render(); });
    bindToggle('writingGuidelinesToggle', 'writingShowOutline', () => { if (App.state.mode === 'writing') UI.render(); });
    bindToggle('writingHideDrawingToggle', 'writingHideDrawing', () => { if (App.state.mode === 'writing') UI.render(); });
    bindToggle('showHooksToggle', 'showHooks', () => UI.render());

    // --- AUDIO & AUTO-PLAY CUSTOMIZATION ---
    if (typeof App.state.ttsReadWord === 'undefined') App.state.ttsReadWord = true;
    if (typeof App.state.ttsReadMeaning === 'undefined') App.state.ttsReadMeaning = true;
    if (typeof App.state.ttsReadExample === 'undefined') App.state.ttsReadExample = false;
    if (typeof App.state.ttsReadExampleEn === 'undefined') App.state.ttsReadExampleEn = false;
    if (typeof App.state.ttsItemInterval === 'undefined') App.state.ttsItemInterval = 1.0;
    if (typeof App.state.ttsCardInterval === 'undefined') App.state.ttsCardInterval = 2.0;

    bindToggle('ttsReadWordToggle', 'ttsReadWord');
    bindToggle('ttsReadMeaningToggle', 'ttsReadMeaning');
    bindToggle('ttsReadExampleToggle', 'ttsReadExample');
    bindToggle('ttsReadExampleEnToggle', 'ttsReadExampleEn');
    bindSlider('ttsItemIntervalSlider', 'ttsItemInterval', 'ttsItemIntervalVal', v => `${v}s`);
    bindSlider('ttsCardIntervalSlider', 'ttsCardInterval', 'ttsCardIntervalVal', v => `${v}s`);

    const qToggle = document.getElementById('quizTypeToggle');
    if (qToggle) {
        qToggle.checked = App.state.quizType === 'translate';
        qToggle.addEventListener('change', (e) => {
          App.state.quizType = e.target.checked ? 'translate' : 'vocab';
          App.state.modeCache = {};
          App.saveSettings();
          App.updateActiveList();
          UI.updateNavVisibility();
          UI.render();
        });
    }

    const scToggle = document.getElementById('separateCharsToggle');
    if (scToggle) {
        scToggle.checked = App.state.separateMode !== 'off';
        scToggle.addEventListener('change', (e) => {
          App.state.separateMode = e.target.checked ? 'all' : 'off';
          App.state.modeCache = {}; 
          App.saveSettings();
          App.updateActiveList();
          UI.render();
        });
    }

    const lhToggle = document.getElementById('listeningHardToggle');
    if (lhToggle) {
        lhToggle.checked = App.state.listeningHard;
        lhToggle.addEventListener('change', (e) => {
          App.state.listeningHard = e.target.checked;
          App.state.modeCache = {}; 
          App.saveSettings();
          if (App.state.mode === 'listening') {
             App.updateActiveList();
             UI.render();
          }
        });
    }

    document.getElementById('clearReviewBtn')?.addEventListener('click', () => {
        App.clearReviewList();
    });

    const charModal = document.getElementById('charModal');
    if (charModal) {
        charModal.addEventListener('click', (e) => {
            const target = e.target;
            const actionTarget = target.closest('[data-action="show-char-details"]');
            if (actionTarget) {
                e.stopPropagation();
                const char = actionTarget.dataset.char;
                if (char) App.handleCharClick(e, char);
            }
            
            const toggleTarget = target.closest('[data-action="toggle-breakdown"]');
            if (toggleTarget) {
                 e.stopPropagation();
                 const l1 = document.getElementById('breakdown-l1');
                 const l2 = document.getElementById('breakdown-l2');
                 if (l1 && l2) {
                     const isL2Visible = l2.style.display !== 'none';
                     l1.style.display = isL2Visible ? 'block' : 'none';
                     l2.style.display = isL2Visible ? 'none' : 'block';
                 }
            }
        });

        charModal.addEventListener('click', (e) => {
            const summary = e.target.closest('summary');
            if (!summary) return;
            const details = summary.parentElement;
            if (!details) return;
            e.preventDefault();

            if (details._closeTimer) {
                clearTimeout(details._closeTimer);
                details._closeTimer = null;
            }

            if (details.classList.contains('expanded')) {
                details.classList.remove('expanded');
                details._closeTimer = setTimeout(() => {
                    details.removeAttribute('open');
                    details._closeTimer = null;
                }, 300);
            } else {
                details.setAttribute('open', '');
                void details.offsetHeight;
                details.classList.add('expanded');
            }
        });

        charModal.addEventListener('click', (e) => {
            const target = e.target;
            const editBtn = target.closest('[data-action="edit-hook"]');
            if (editBtn) {
                const char = editBtn.dataset.char;
                document.getElementById(`hook-display-${char}`).style.display = 'none';
                document.getElementById(`hook-editor-${char}`).style.display = 'block';
                editBtn.style.display = 'none';
                const ta = document.getElementById(`hook-input-${char}`);
                if (ta) {
                    ta.focus();
                    ta.style.height = 'auto';
                    ta.style.height = ta.scrollHeight + 'px';
                }
            }
            
            const cancelBtn = target.closest('[data-action="cancel-edit-hook"]');
            if (cancelBtn) {
                App.handleCharClick(e, cancelBtn.dataset.char);
            }
            
            const saveBtn = target.closest('[data-action="save-hook"]');
            if (saveBtn) {
                const char = saveBtn.dataset.char;
                const val = document.getElementById(`hook-input-${char}`).value;
                App.saveUserHook(char, val);
                App.handleCharClick(e, char); 
            }
        });

        charModal.addEventListener('input', (e) => {
            if (e.target.tagName === 'TEXTAREA' && e.target.id.startsWith('hook-input-')) {
                e.target.style.height = 'auto';
                e.target.style.height = e.target.scrollHeight + 'px';
            }
        });
    }

    this.container.addEventListener('click', (e) => {
      const target = e.target;
      const actionTarget = target.closest('[data-action]');
      if (!actionTarget) return;

      const action = actionTarget.dataset.action;
      
      switch (action) {
        case 'toggle-flip': App.toggleFlip(); break;
        case 'toggle-study-mini-char': {
          e.stopPropagation();
          const card = actionTarget.closest('.study-mini-char-card');
          const panel = actionTarget.closest('.study-mini-panel');
          if (!card || !panel) break;

          const isOpen = card.classList.contains('is-open');
          panel.querySelectorAll('.study-mini-char-card.is-open').forEach(node => {
            node.classList.remove('is-open');
            node.querySelector('.study-mini-char-header')?.setAttribute('aria-expanded', 'false');
          });

          if (!isOpen) {
            card.classList.add('is-open');
            actionTarget.setAttribute('aria-expanded', 'true');
          } else {
            actionTarget.setAttribute('aria-expanded', 'false');
          }
          break;
        }
        case 'toggle-example-group': {
          const group = actionTarget.closest('.example-group');
          if (group) group.classList.toggle('expanded');
          break;
        }
        case 'prev': App.prev(); break;
        case 'next': App.next(); break;
        case 'show-char-details':
          e.stopPropagation();
          if (actionTarget.dataset.char) App.handleCharClick(e, actionTarget.dataset.char);
          break;
        case 'speak':
          if (actionTarget.dataset.text) App.speakText(actionTarget.dataset.text);
          break;
        case 'speak-example':
          e.stopPropagation();
          if (App.state.currentExample) App.speakText(App.state.currentExample.zh);
          break;
      }
    });

    document.addEventListener('keydown', (e) => {
      const isField = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable);
      
      if (!isField && (e.key === 'r' || e.key === 'R')) { e.preventDefault(); App.cycleSeparateMode(); return; }
      if (!isField && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        if (App.state.currentExample) App.speakText(App.state.currentExample.zh);
        return;
      }
      if (!isField && (e.key === 'm' || e.key === 'M')) { if (App.state.mode === 'study') App.markLearned(true); }
      if (!isField && (e.key === 'n' || e.key === 'N')) { if (App.state.mode === 'study') App.markLearned(false); }
      if (isField) return; // Prevent shortcuts while typing
      if ((e.key === 'c' || e.key === 'C') && !e.metaKey && !e.ctrlKey) { e.preventDefault(); App.copyCurrent(); return; }
    });

    let longPressTimer;
    let touchStartX = 0, touchStartY = 0;
    let isLongPress = false;

    this.container.addEventListener('touchstart', (e) => {
        const card = e.target.closest('.card');
        if (!card || App.state.mode !== 'study') return;
        
        isLongPress = false;
        const touch = e.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;

        longPressTimer = setTimeout(() => {
            longPressTimer = null;
            isLongPress = true;
            const currentItem = App.state.activeList[App.state.currentIndex];
            if (currentItem) {
                // 🌟 Pre-fill the cache so setMode smoothly transitions without losing your place
                App.state.modeCache['writing'] = {
                    list: App.state.activeList, index: App.state.currentIndex,
                    isFinished: App.state.isFinished,
                    sessionMistakes: App.state.sessionMistakes,
                    filterKey: App.getFilterKey()
                };
                App.setMode('writing');
            }
        }, 500);
    }, { passive: true });

    this.container.addEventListener('touchmove', (e) => {
        if (!longPressTimer) return;
        const touch = e.touches[0];
        if (Math.abs(touch.clientX - touchStartX) > 10 || Math.abs(touch.clientY - touchStartY) > 10) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    }, { passive: true });

    this.container.addEventListener('touchend', (e) => {
        if (longPressTimer) clearTimeout(longPressTimer);
        if (isLongPress) {
            e.preventDefault();
            isLongPress = false; // 🌟 FIX: Reset the flag so future taps aren't blocked!
        }
    });

    document.getElementById('shuffleBtn')?.classList.toggle('active', App.state.shuffle);
    this.updateLessonBadge();
    this.updateSpeedButtons();
    this.updateStreak();
    this.updateNavVisibility();
  },

  showNavPopup(btn, options) {
    this.closePopups();
    const popup = document.createElement('div');
    popup.className = 'nav-popup';
    
    options.forEach(opt => {
        const item = document.createElement('button');
        item.className = 'nav-popup-btn';
        item.innerHTML = `${opt.icon || ''}<span>${opt.label}</span>`;
        if (App.state.mode === opt.mode) item.classList.add('active');
        item.onclick = (e) => { e.stopPropagation(); App.setMode(opt.mode); this.closePopups(); };
        popup.appendChild(item);
    });

    document.body.appendChild(popup);
    const rect = btn.getBoundingClientRect();
    popup.style.left = `${rect.left + rect.width / 2}px`;
    popup.style.bottom = `${window.innerHeight - rect.top + 15}px`; 

    requestAnimationFrame(() => requestAnimationFrame(() => popup.classList.add('active')));
  },

showCourseSelector() {
      const existing = document.getElementById('course-selector-modal');
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.id = 'course-selector-modal';
      overlay.className = 'pastel-modal-wrapper';
      
      let tempBook = Array.isArray(App.state.bookFilter) ? [...App.state.bookFilter] : [App.state.bookFilter || '1'];
      let tempLessons = Array.isArray(App.state.lessonFilter) ? [...App.state.lessonFilter] : [App.state.lessonFilter || 'All'];
      let tempDialogues = App.state.dialogueFilter ? JSON.parse(JSON.stringify(App.state.dialogueFilter)) : {};
      if (Array.isArray(tempDialogues)) tempDialogues = {};
      let focusedLesson = tempLessons.length > 0 && tempLessons[0] !== 'All' ? tempLessons[tempLessons.length - 1] : null;

      const books = Array.from(new Set(DATA.VOCAB.map(v => String(v.book)))).sort((a,b) => a.localeCompare(b));
      if(!books.includes('1')) books.unshift('1');

      overlay.innerHTML = `
          <div class="pastel-modal" onclick="event.stopPropagation()">
              <!-- Top Section: Header & Books -->
              <div style="padding: 24px 24px 16px 24px; background: #ffffff; border-bottom: 1px solid #f1f5f9; z-index: 10; flex-shrink: 0;">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 20px;">
                      <h3 style="font-family:'Nunito', sans-serif; font-size:1.6rem; font-weight:800; color:#475569; margin:0; letter-spacing:-0.5px;">Course Selection</h3>
                      <button class="pastel-btn-icon" id="closeCourseModal">
                          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                      </button>
                  </div>
                  <div style="font-family: 'Nunito', sans-serif; font-weight: 800; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; margin-bottom: 10px;">Select Book</div>
                  <div id="bookContainer" style="display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; -webkit-overflow-scrolling: touch;"></div>
              </div>
              
              <!-- Middle Section: Lessons (Scrollable Body) -->
              <div class="pastel-scroll" style="flex: 1; min-height: 200px; max-height: 42vh; overflow-y: auto; padding: 20px 24px; background: #f8fafc;">
                  <div style="font-family: 'Nunito', sans-serif; font-weight: 800; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; margin-bottom: 12px;">Lessons</div>
                  <div id="lessonContainer" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 10px;"></div>
              </div>

              <!-- Bottom Section: Dialogues (Fixed Footer) -->
              <div id="dialogueSection" style="display: none; padding: 16px 24px 24px 24px; background: #ffffff; border-top: 1px solid #e2e8f0; z-index: 10; flex-shrink: 0; box-shadow: 0 -4px 12px rgba(0,0,0,0.02);">
                  <div id="dialogueTitle" style="font-family: 'Nunito', sans-serif; font-weight: 800; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; margin-bottom: 10px;">Dialogues</div>
                  <div id="dialogueContainer" style="display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; -webkit-overflow-scrolling: touch;"></div>
              </div>
          </div>
      `;
      
      document.body.appendChild(overlay);

      const bookContainer = overlay.querySelector('#bookContainer');
      const lessonContainer = overlay.querySelector('#lessonContainer');

      const updateVisuals = () => {
          const isAllLessons = tempLessons.includes('All');
          const primaryBook = tempBook[0] || '1';
          const currentBookColor = Utils.getBookColor(primaryBook);
          const currentBookBg = Utils.getBookBg(primaryBook);

          lessonContainer.querySelectorAll('.pastel-chip').forEach(btn => {
              const l = btn.dataset.lesson;
              const isActive = (l === 'All') ? isAllLessons : (tempLessons.includes(l) && !isAllLessons);
              const isFocused = l === focusedLesson;

              if (isActive) {
                  btn.classList.add('active');
                  btn.style.color = currentBookColor;
                  btn.style.background = currentBookBg;
                  btn.style.borderColor = currentBookColor;
                  const sub = tempDialogues[l];
                  if (sub && Array.isArray(sub) && sub.length > 0) {
                      btn.style.borderStyle = 'dashed';
                  } else {
                      btn.style.borderStyle = 'solid';
                  }
                  if (isFocused) {
                      btn.style.boxShadow = `0 0 0 3px white, 0 0 0 5px ${currentBookColor}`;
                  } else {
                      btn.style.boxShadow = '';
                  }
              } else {
                  btn.classList.remove('active');
                  btn.style.color = ''; 
                  btn.style.background = '';
                  btn.style.borderColor = '';
                  btn.style.borderStyle = 'solid';
                  btn.style.boxShadow = '';
              }
          });
          
          const dialogueSection = overlay.querySelector('#dialogueSection');
          if (dialogueSection) {
              if (focusedLesson && tempLessons.includes(focusedLesson)) {
                  dialogueSection.style.display = 'block';
                  const titleEl = overlay.querySelector('#dialogueTitle');
                  if (titleEl) titleEl.textContent = `L${focusedLesson} Dialogues`;
              } else {
                  dialogueSection.style.display = 'none';
              }
          }

          const dialogueContainer = overlay.querySelector('#dialogueContainer');
          if (dialogueContainer && focusedLesson) {
              dialogueContainer.querySelectorAll('.pastel-chip').forEach(btn => {
                  const d = btn.dataset.dialogue;
                  const activeSet = tempDialogues[focusedLesson];
                  const isDiaActive = !activeSet || activeSet.includes(d);
                  if (isDiaActive) {
                      btn.classList.add('active');
                      btn.style.color = currentBookColor;
                      btn.style.background = currentBookBg;
                      btn.style.borderColor = currentBookColor;
                  } else {
                      btn.classList.remove('active');
                      btn.style.color = ''; 
                      btn.style.background = '';
                      btn.style.borderColor = '';
                  }
              });
          }
      };

      const renderDialogues = () => {
          const dialogueContainer = overlay.querySelector('#dialogueContainer');
          if (!dialogueContainer) return;
          if (focusedLesson && tempLessons.includes(focusedLesson)) {
              const l = focusedLesson;
              
              const isSentencesSource = (App.state.mode === 'listening' && App.state.listeningHard) ||
                                        ['sentences', 'builder'].includes(App.state.mode) ||
                                        (['quiz', 'quiz-mc'].includes(App.state.mode) && App.state.quizType === 'translate');
              const source = isSentencesSource ? DATA.SENTENCES : DATA.VOCAB;
              const lessonItems = source.filter(i => tempBook.includes(String(i.book)) && String(i.lesson) === l);

              const availableDialogues = Array.from(new Set(
                  lessonItems.map(v => String(v.dialogue))
                            .filter(d => d !== '0' && d !== 'undefined' && d !== '')
              )).sort((a,b) => Number(a) - Number(b));

              if (availableDialogues.length > 0) {
                  let diaHtml = availableDialogues.map((d, i) => {
                      return `
                      <div class="pastel-chip" data-dialogue="${d}" style="animation-delay: ${i * 0.02}s;">
                          D${d}
                      </div>
                      `;
                  }).join('');
                  dialogueContainer.innerHTML = diaHtml;

                  dialogueContainer.querySelectorAll('.pastel-chip[data-dialogue]').forEach(btn => {
                      btn.onclick = () => {
                          if (window.Sound) window.Sound.play('click');
                          const d = btn.dataset.dialogue;
                          let activeSet = tempDialogues[l];
                          if (!activeSet) activeSet = [...availableDialogues];
                          
                          if (activeSet.includes(d)) {
                              if (activeSet.length === 1) {
                                  UI.showToast("At least one part must be selected");
                                  return;
                              }
                              activeSet = activeSet.filter(x => x !== d);
                          } else {
                              activeSet.push(d);
                          }
                          
                          if (activeSet.length === availableDialogues.length) {
                              delete tempDialogues[l];
                          } else {
                              tempDialogues[l] = activeSet;
                          }
                          updateVisuals();
                      };
                  });
              } else {
                  dialogueContainer.innerHTML = '<div style="color: #94a3b8; font-size: 0.9rem; margin-left: 4px;">No parts available</div>';
              }
          }
      };

      const renderBookAndLessons = () => {
          bookContainer.innerHTML = books.map((b, i) => {
              const isActive = tempBook.includes(b);
              const activeColor = Utils.getBookColor(b);
              const activeBg = Utils.getBookBg(b);
              const activeStyle = isActive ? `color: ${activeColor}; background: ${activeBg}; border-color: ${activeColor};` : '';
              
              return `
              <div class="pastel-chip ${isActive ? 'active' : ''}" data-book="${b}" style="${activeStyle} animation-delay: ${i * 0.04}s;">
                  B${b}
              </div>
              `;
          }).join('');

          bookContainer.querySelectorAll('.pastel-chip').forEach(btn => {
              btn.onclick = () => { 
                  if (window.Sound) window.Sound.play('click');
                  const b = btn.dataset.book;
                  if (tempBook.includes(b)) {
                      if (tempBook.length > 1) { // Prevent unselecting the last remaining book
                          tempBook = tempBook.filter(x => x !== b);
                      } else {
                          UI.showToast("At least one book must be selected");
                          return;
                      }
                  } else {
                      tempBook.push(b);
                      tempBook.sort((x, y) => Number(x) - Number(y)); // Keep B1 before B2
                  }
                  tempLessons = ['All']; 
                  tempDialogues = {};
                  focusedLesson = null;
                  renderBookAndLessons();
                  renderDialogues();
                  updateVisuals();
              };
          });

          const availableLessons = Array.from(new Set(DATA.VOCAB.filter(v => tempBook.includes(String(v.book))).map(v => String(v.lesson)))).sort((a, b) => Number(a) - Number(b));
          
          let lessonHtml = `
              <div class="pastel-chip" data-lesson="All" style="grid-column: 1 / -1; animation-delay: 0s;">
                  All
              </div>
          `;

          lessonHtml += availableLessons.map((l, i) => {
              return `
              <div class="pastel-chip" data-lesson="${l}" style="animation-delay: ${(i + 1) * 0.02}s;">
                  L${l}
              </div>
              `;
          }).join('');
          
          lessonContainer.innerHTML = lessonHtml;

          lessonContainer.querySelectorAll('.pastel-chip[data-lesson]').forEach(btn => {
              btn.onclick = () => {
                  if (window.Sound) window.Sound.play('click');
                  const l = btn.dataset.lesson;
                  if (l === 'All') {
                      tempLessons = ['All'];
                      tempDialogues = {};
                      focusedLesson = null;
                  } else {
                      if (tempLessons.includes('All')) tempLessons = [];
                      
                      if (tempLessons.includes(l)) {
                          if (focusedLesson !== l) {
                              focusedLesson = l; // Just switch focus!
                          } else {
                              tempLessons = tempLessons.filter(x => x !== l);
                              focusedLesson = tempLessons.length > 0 ? tempLessons[tempLessons.length - 1] : null;
                          }
                      } else {
                          tempLessons.push(l);
                          tempLessons.sort((a, b) => Number(a) - Number(b));
                          focusedLesson = l;
                      }
                      
                      if (tempLessons.length === 0) {
                          tempLessons = ['All'];
                          focusedLesson = null;
                      }
                  }
                  renderDialogues();
                  updateVisuals(); 
              };
          });
      };
      
      renderBookAndLessons();
      renderDialogues();
      updateVisuals();
      
      requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('open')));
      
      const closeFn = () => {
          const hasChanged = JSON.stringify(tempBook) !== JSON.stringify(App.state.bookFilter) || 
                             JSON.stringify(tempLessons) !== JSON.stringify(App.state.lessonFilter) ||
                             JSON.stringify(tempDialogues) !== JSON.stringify(App.state.dialogueFilter);

          if (hasChanged) {
              App.state.bookFilter = tempBook;
              App.state.lessonFilter = tempLessons;
              App.state.dialogueFilter = tempDialogues;
              App.state.modeCache = {}; // 🌟 CLEAR CACHE SO OTHER MODES REBUILD THEIR LISTS
              App.saveSettings(); 
              App.updateActiveList(); 
              UI.updateLessonBadge(); 
              UI.render(); 
          }
          
          document.getElementById('dynamicIsland')?.classList.remove('expanded');
          overlay.classList.remove('open');
          setTimeout(() => overlay.remove(), 300); 
      };

      overlay.querySelector('#closeCourseModal').onclick = closeFn;
      overlay.onclick = (e) => { if (e.target === overlay) closeFn(); };
  },

  closePopups() {
    document.querySelectorAll('.nav-popup').forEach(p => { p.classList.remove('active'); setTimeout(() => p.remove(), 200); });
  },

  updateNavHighlight() {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    let target = App.state.mode;
    if (target === 'list') target = 'study';
    if (target === 'builder') target = 'sentences';
    if (target === 'quiz-mc') target = 'quiz';
    if (target === 'listening') target = 'quiz';
    const btn = document.querySelector(`.nav-item[data-mode="${target}"]`);
    if (btn) btn.classList.add('active');
  },

  updateFlipState() {
    const card = document.querySelector('.card');
    if(card) {
      if (App.state.isFlipped) card.classList.add('flipped');
      else card.classList.remove('flipped');
    }
    if (typeof this.syncStudyDesktopExpansion === 'function') {
      this.syncStudyDesktopExpansion();
    }
  },

  updateSpeedButtons() {
    document.querySelectorAll('.speed-btn').forEach(btn => {
      const rate = parseFloat(btn.dataset.rate);
      btn.classList.toggle('active', rate === App.state.ttsRate);
    });
  },

  updateAutoPlayButton() {
    const btn = document.getElementById('autoPlayBtn');
    if (!btn) return;
    const allowed = ['study', 'sentences'].includes(App.state.mode);
    btn.classList.toggle('active', App.state.autoPlay);
    btn.classList.toggle('disabled', !allowed);
    btn.title = App.state.autoPlay ? 'Stop auto-play' : 'Auto-play cards';
    if (!allowed && App.state.autoPlay) App.stopAutoPlay();
  },

  updateStreak() {
    const isGame = ['quiz', 'quiz-mc', 'listening'].includes(App.state.mode);
    const oldBadge = document.getElementById('streakBadge');
    if (oldBadge) oldBadge.style.display = 'none';

    setTimeout(() => {
        let sticker = document.getElementById('streakSticker');
        
        if (!isGame || App.state.streak === 0) {
            if (sticker) sticker.classList.remove('visible');
            return;
        }

        if (!sticker) {
            sticker = document.createElement('div');
            sticker.id = 'streakSticker';
        }

        const container = document.querySelector('.quiz-card-group') || document.querySelector('.listening-card') || document.querySelector('.card-container');
        if (container) {
            container.style.position = 'relative';
            if (sticker.parentElement !== container) container.appendChild(sticker);
        } else {
            return;
        }

        let theme = 'theme-pink';
        let svgIcon = `<path d="M17.66 11.2c-.23-.3-.51-.56-.77-.82-.67-.6-1.43-1.03-2.07-1.66C13.33 7.26 13 4.85 13.95 3c-.95.23-1.78.75-2.49 1.32-2.59 2.08-3.61 5.75-2.39 8.9.04.1.08.2.08.33 0 .22-.15.42-.35.5-.22.1-.46.04-.64-.12a.83.83 0 0 1-.15-.17c-1.1-1.43-1.28-3.48-.53-5.12C5.89 10 5 12.3 5.14 14.47c.04.5.1 1 .27 1.5.14.6.4 1.2.72 1.73 1.04 1.73 2.87 2.97 4.84 3.22 2.1.27 4.35-.12 5.96-1.6 1.8-1.66 2.45-4.32 1.5-6.6l-.13-.26c-.2-.45-.47-.87-.78-1.25zm-3.1 6.3c-.28.24-.73.5-1.08.6-1.1.4-2.2-.16-2.87-1.14-.05-.06-.12-.13-.12-.23 0-.17.15-.3.33-.3.12 0 .24.06.33.14.45.45 1.14.62 1.7.53.64-.1 1.25-.6 1.4-1.28.1-.5-.04-1.03-.35-1.44a.7.7 0 0 1-.14-.3c-.04-.15.02-.32.14-.42.13-.1.3-.13.46-.07.45.18.84.5 1.15.88.58.74.63 1.8.15 2.64z"/>`;

        if (App.state.streak >= 5) {
            theme = 'theme-gold';
            svgIcon = `<path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>`;
        }
        if (App.state.streak >= 10) {
            theme = 'theme-cyan';
            svgIcon = `<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>`;
        }
        if (App.state.streak >= 20) {
            theme = 'theme-purple';
            svgIcon = `<path d="M2 19h20v2H2v-2zm1.26-2h17.48l-1.92-12.63c-.1-.66-.67-1.14-1.34-1.14h-1.63L12 8.7 8.15 3.23H6.52c-.67 0-1.24.48-1.34 1.14L3.26 17z"/>`;
        }

        sticker.className = `streak-sticker visible ${theme}`;
        
        sticker.innerHTML = `
            <div class="sticker-shine"></div>
            <svg viewBox="0 0 24 24" class="sticker-icon" fill="currentColor">${svgIcon}</svg>
            <div class="sticker-text">${App.state.streak}</div>
        `;

        sticker.style.animation = 'none';
        void sticker.offsetWidth; 
        sticker.style.animation = 'boingSticker 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)';
    }, 10);
  },

  updateNavVisibility() {
    const studyBtn = document.querySelector('.nav-item[data-mode="study"]');
    if (studyBtn) studyBtn.style.display = 'flex';
  },

  updateExamplePinyinState() {
      if (App.state.noExamplePinyin) {
          document.body.classList.add('hide-example-pinyin');
      } else {
          document.body.classList.remove('hide-example-pinyin');
      }
  },

  renderScrollHint() {
      if (App.state.mode === 'study' && window.matchMedia('(min-width: 768px) and (min-height: 700px)').matches) {
          if (this._scrollHintListener) {
              this.container.removeEventListener('scroll', this._scrollHintListener);
              this._scrollHintListener = null;
          }
          const existingHint = document.getElementById('scrollHint');
          if (existingHint) existingHint.remove();
          return;
      }

      // Ensure we clear out the previous listener before adding a new one
      if (this._scrollHintListener) {
          this.container.removeEventListener('scroll', this._scrollHintListener);
          this._scrollHintListener = null;
      }

      let hint = document.getElementById('scrollHint');
      if (!hint) {
          hint = document.createElement('div');
          hint.id = 'scrollHint';
          hint.className = 'scroll-hint';
          hint.innerHTML = `
              <span>Scroll to see example</span>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 13l5 5 5-5M7 6l5 5 5-5"/></svg>
          `;
          this.container.appendChild(hint);
      }
      
      hint.classList.remove('visible');
      
      setTimeout(() => {
          if (this.container.scrollHeight > this.container.clientHeight + 50) {
               requestAnimationFrame(() => hint.classList.add('visible'));
               
               this._scrollHintListener = () => {
                   const h = document.getElementById('scrollHint');
                   if (h) h.classList.remove('visible');
                   this.container.removeEventListener('scroll', this._scrollHintListener);
                   this._scrollHintListener = null;
               };
               this.container.addEventListener('scroll', this._scrollHintListener, {once: true});
          }
      }, 600);
  },

  showCopyFeedback() {
    const btn = document.getElementById('copyBtn');
    if (!btn) return;
    const originalTitle = btn.dataset.title || 'Copy (c)';
    btn.dataset.title = originalTitle;
    btn.classList.add('copied');
    btn.title = 'Copied!';
    setTimeout(() => { btn.classList.remove('copied'); btn.title = originalTitle; }, 1200);
  },
  showToast(msg, options = {}) {
    const { variant = 'default', duration = 1500 } = options;
    let toast = document.getElementById('appToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'appToast';
        toast.className = 'app-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.className = `app-toast${variant === 'strong' ? ' is-strong' : ''}`;
    toast.classList.remove('show');
    void toast.offsetWidth;
    toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
  },

  render() {
    if (!this.container) return;

    if (App.state.mode === 'list') {
        this.container.style.justifyContent = 'flex-start';
        this.container.style.paddingTop = '10px'; // 🌟 FIX: Removed the massive gap!
        this.container.style.alignItems = 'stretch';
    } else if (App.state.mode === 'writing') {
        this.container.style.justifyContent = 'center';
        this.container.style.paddingTop = '0';
        this.container.style.alignItems = 'stretch';
    } else {
            this.container.style.justifyContent = 'flex-start';
        this.container.style.paddingTop = '0';
        this.container.style.alignItems = 'center';
    }

    const isStudyMode = App.state.mode === 'study';
    const hasStudyContainer = this.container.querySelector('.card-container') && !this.container.querySelector('.card-container').style.maxWidth;
    
    const isListeningMode = App.state.mode === 'listening';
    const hasListeningContainer = this.container.querySelector('.listening-wrapper');
    
    const isWritingMode = App.state.mode === 'writing';
    const hasWritingContainer = this.container.querySelector('#writingAppWrapper');
    
    if (!(isStudyMode && hasStudyContainer) && !(isListeningMode && hasListeningContainer) && !(isWritingMode && hasWritingContainer)) {
        this.container.innerHTML = ''; 
    }
    
    if (App.state.activeList.length === 0 && App.state.mode !== 'list') {
      if (App.state.hideLearned && App.state.learnedItems.size > 0 && App.state.mode === 'study') {
          this.container.innerHTML = `<div style="text-align:center; padding:40px; color:var(--text-main);"><div style="font-size:4rem; margin-bottom:20px;">🎉</div><h2>All items learned!</h2><p style="color:var(--text-muted); margin-bottom:20px;">Great job clearing the list.</p><button class="btn-sec" onclick="App.state.hideLearned=false; App.saveSettings(); App.updateActiveList(); UI.render();">Review All</button></div>`;
      } else {
          this.container.innerHTML = `<div style="text-align:center; margin-top:50px; color:var(--text-muted)">No items found for this filter.</div>`;
      }
      return;
    }

    if (App.state.currentIndex >= App.state.activeList.length) App.state.currentIndex = 0;
    let item = App.state.activeList[App.state.currentIndex];
    
    if (!item) {
        App.state.currentIndex = 0;
        item = App.state.activeList[0];
        if (!item) return;
    }
    
    if (App.state.isFinished) {
        if (App.state.autoPlay) App.stopAutoPlay();
        this.renderSummary();
        return;
    }

    const showProgress = ['study', 'sentences', 'quiz', 'quiz-mc', 'listening', 'writing', 'builder', 'list'].includes(App.state.mode);
    const hasList = App.state.activeList && App.state.activeList.length > 0;
    const islandIsland = document.getElementById('dynamicIsland');
    
    if (islandIsland) {
        islandIsland.style.display = (showProgress && hasList) ? 'flex' : 'none';
    }

    if (showProgress && hasList) {
        const pct = ((App.state.currentIndex + 1) / App.state.activeList.length) * 100;
        document.querySelectorAll('.global-progress-fill').forEach(fill => {
            fill.style.width = `${pct}%`;
        });
        document.querySelectorAll('.global-progress-text').forEach(textEl => {
            textEl.textContent = `${App.state.currentIndex + 1} / ${App.state.activeList.length}`;
            textEl.style.color = 'var(--text-main)'; 
        });
    }

    this.updateAutoPlayButton();

    if (App.state.mode === 'study') {
        this.renderStudy(item);
        this.renderScrollHint();
    }
    else if (App.state.mode === 'sentences') this.renderSentences(item);
    else if (App.state.mode === 'quiz') this.renderQuiz(item);
    else if (App.state.mode === 'quiz-mc') this.renderQuizMC(item);
    else if (App.state.mode === 'builder') this.renderBuilder(item);
    else if (App.state.mode === 'listening') this.renderListening(item);
    else if (App.state.mode === 'writing') this.renderWriting(item);

    if (App.state.skipFadeInOnce) {
        App.state.skipFadeInOnce = false;
    }
    else if (App.state.mode === 'list') this.renderList();
   
    if (['quiz', 'quiz-mc', 'listening'].includes(App.state.mode)) {
        this.updateStreak();
    }

    // Auto-focus the input field in quiz mode
    if (App.state.mode === 'quiz') {
        setTimeout(() => {
            const input = this.container.querySelector('input[type="text"], input:not([type="radio"]):not([type="checkbox"])');
            if (input) input.focus();
        }, 50);
    }
  },

  celebrate() {
  },

  updateLessonBadge() {
    const badge = document.getElementById('lessonBadge');
    if (!badge) return;
    const books = Array.isArray(App.state.bookFilter) ? App.state.bookFilter : [App.state.bookFilter || '1'];
    const filters = Array.isArray(App.state.lessonFilter) ? App.state.lessonFilter : ['All'];
    const diaFilters = App.state.dialogueFilter || {};
    
    let lessonText = 'All';
    if (!filters.includes('All')) {
        if (filters.length > 3) {
            lessonText = `${filters.length} Lessons`;
        } else {
            lessonText = filters.map(l => {
                const parts = diaFilters[l];
                if (parts && parts.length > 0) return `L${l}(D${parts.join(',')})`;
                return `L${l}`;
            }).join(', ');
        }
    }
    
    const primaryBook = books[0] || '1';
    const bookText = books.length > 2 ? `${books.length} Books` : `B${books.join(',')}`;
    
    badge.textContent = `${bookText} • ${lessonText}`;
    badge.style.backgroundColor = Utils.getBookBg(primaryBook);
    badge.style.color = Utils.getBookColor(primaryBook);
    badge.style.transition = 'background-color 0.3s, color 0.3s';
  },

  renderSummary() {
    this.container.innerHTML = '';
    const sessionMistakes = App.state.sessionMistakes || [];
    const hasMistakes = sessionMistakes.length > 0;
    
    const html = `
      <div class="fade-in screen-message">
        <div class="screen-icon">🎉</div>
        <h2 class="screen-title">Lesson Complete!</h2>
        <p class="screen-subtitle">You've practiced all words in this session.</p>
        
        <div class="button-group-vertical">
            ${hasMistakes ? `
            <button class="btn-main" id="reviewSessionBtn" style="background:#ec4899;">
                Review Mistakes (${sessionMistakes.length})
            </button>` : ''}
            
            <button class="btn-sec" id="restartBtn">Restart Lesson</button>
            <button class="btn-sec" id="homeBtn">Back to Study</button>
        </div>
      </div>
    `;
    this.container.innerHTML = html;
    
    document.getElementById('restartBtn').onclick = () => {
        App.state.isFinished = false; // FIX: Ensure session un-finishes
        App.state.streak = 0; // FIX: Clear lingering streaks
        App.saveSettings();
        App.updateActiveList(); 
        UI.render();
    };
    
    document.getElementById('homeBtn').onclick = () => {
        App.setMode('study');
    };
    
    if (hasMistakes) {
        document.getElementById('reviewSessionBtn').onclick = () => {
            const mistakeItems = App.state.activeList.filter(i => sessionMistakes.includes(i.hanzi || i.zh));
            App.state.activeList = mistakeItems;
            App.state.sessionMistakes = []; 
            App.state.currentIndex = 0;
            App.state.isFinished = false; // FIX: Ensure session un-finishes
            App.state.streak = 0; // FIX: Clear lingering streaks
            App.saveSettings();
            if (App.state.shuffle) App.state.activeList.sort(() => Math.random() - 0.5);
            UI.render();
        };
    }

    setTimeout(() => {
        if (!App.state.isFinished) return;
        App.state.isFinished = false;
        App.state.streak = 0;
        App.saveSettings();
        App.updateActiveList();
        App.state.currentIndex = 0;
        App.state.isFlipped = false;
        UI.render();
    }, 900);
  }
};
window.UI = UI;
