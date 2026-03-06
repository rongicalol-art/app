const UI = {
  container: document.getElementById('mainContainer'),
  
init() {
    this.applyPastelSettingsTheme(); 
    this.applyMobileUXTheme();
      
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
      btn.addEventListener('click', (e) => {
        const mode = btn.dataset.mode;
        const subModes = {
            'study': [
                { label: 'Cards', mode: 'study', icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h16v12zM6 10h12v2H6zm0 4h8v2H6z"/></svg>' },
                { label: 'List', mode: 'list', icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/></svg>' }
            ],
            'sentences': [
                { label: 'Read', mode: 'sentences', icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>' },
                { label: 'Build', mode: 'builder', icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/></svg>' }
            ],
            'quiz': [
                { label: 'Quiz', mode: 'quiz', icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/></svg>' },
                { label: 'Listen', mode: 'listening', icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 3v9.28c-.47-.17-.97-.28-1.5-.28C8.01 12 6 14.01 6 16.5S8.01 21 10.5 21c2.31 0 4.2-1.75 4.45-4H15V6h4V3h-7z"/></svg>' }
            ]
        };

        if (subModes[mode]) {
            e.stopPropagation();
            this.showNavPopup(btn, subModes[mode]);
        } else {
            App.setMode(mode);
        }
      });
    });

    document.addEventListener('click', () => {
        this.closePopups();
    });

    document.getElementById('settingsBtn')?.addEventListener('click', () => {
      const settingsContent = document.getElementById('settingsModalContent');
      if (settingsContent) settingsContent.scrollTop = 0;
      document.getElementById('settingsModal').classList.add('open');
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

    document.getElementById('lessonBadge')?.addEventListener('click', (e) => {
      e.stopPropagation();
      UI.showCourseSelector();
    });

    document.querySelectorAll('.modal-overlay').forEach(modal => {
      const closeBtn = modal.querySelector('.modal-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          modal.classList.remove('open');
        });
      }
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

    const island = document.getElementById('dynamicIsland');
    if (island) {
        island.addEventListener('click', (e) => {
            if (e.target.closest('#lessonBadge') || e.target.closest('#shuffleBtn') || e.target.closest('#settingsBtn')) return;
            island.classList.toggle('expanded');
        });
        
        document.addEventListener('click', (e) => {
            if (!island.contains(e.target) && island.classList.contains('expanded')) {
                island.classList.remove('expanded');
            }
        });
    }

    let touchstartX = 0, touchstartY = 0;
    document.addEventListener('touchstart', e => {
      touchstartX = e.changedTouches[0].screenX;
      touchstartY = e.changedTouches[0].screenY;
    }, {passive: true});
    
    document.addEventListener('touchend', e => {
      let touchendX = e.changedTouches[0].screenX;
      let touchendY = e.changedTouches[0].screenY;
      let dx = touchendX - touchstartX;
      let dy = touchendY - touchstartY;
      
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
          const target = document.activeElement;
          if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
          
          if (['study', 'sentences'].includes(App.state.mode)) {
              if (dx < 0) App.next(); 
              else App.prev();        
          }
      }
    }, {passive: true});

    bindToggle('quizDefOnlyToggle', 'quizDefOnly', () => { if (App.state.mode === 'quiz') UI.render(); });
    bindToggle('noPinyinToggle', 'noPinyin', () => UI.render());
    bindToggle('noHanziColorToggle', 'noHanziColor', () => UI.render());
    bindToggle('noTranslationToggle', 'noTranslation', () => UI.render());
    bindToggle('fastNextToggle', 'fastNext');
    bindToggle('listeningToneTestToggle', 'listeningToneTest', () => { if (App.state.mode === 'listening') UI.render(); });
    bindToggle('writingGuidelinesToggle', 'writingShowOutline', () => { if (App.state.mode === 'writing') UI.render(); });
    bindToggle('showHooksToggle', 'showHooks', () => UI.render());

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
        case 'prev': App.prev(); break;
        case 'next': App.next(); break;
        case 'show-char-details':
          e.stopPropagation();
          if (actionTarget.dataset.char) App.handleCharClick(e, actionTarget.dataset.char);
          break;
        case 'speak':
          if (actionTarget.dataset.text) Utils.speak(actionTarget.dataset.text, App.state.ttsRate);
          break;
        case 'speak-example':
          e.stopPropagation();
          if (App.state.currentExample) Utils.speak(App.state.currentExample.zh, App.state.ttsRate);
          break;
      }
    });

    document.addEventListener('keydown', (e) => {
      const isField = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable);
      
      if (!isField && (e.key === 'r' || e.key === 'R')) { e.preventDefault(); App.cycleSeparateMode(); return; }
      if (!isField && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        if (App.state.currentExample) Utils.speak(App.state.currentExample.zh, App.state.ttsRate);
        return;
      }
      if (!isField && (e.key === 'm' || e.key === 'M')) { if (App.state.mode === 'study') App.markLearned(true); }
      if (!isField && (e.key === 'n' || e.key === 'N')) { if (App.state.mode === 'study') App.markLearned(false); }
      if (App.state.mode === 'quiz' || isField) return;
      if ((e.key === 'c' || e.key === 'C') && !e.metaKey && !e.ctrlKey) { e.preventDefault(); App.copyCurrent(); return; }
      if (e.key === 'ArrowLeft') App.prev();
      if (e.key === 'ArrowRight') App.next();
      if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); App.toggleFlip(); }
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

      if (!document.getElementById('pastel-styles')) {
          const style = document.createElement('style');
          style.id = 'pastel-styles';
          style.innerHTML = `
              .pastel-modal-wrapper {
                  position: fixed; inset: 0; z-index: 9999;
                  display: flex; align-items: center; justify-content: center;
                  background: rgba(255, 255, 255, 0.6); 
                  backdrop-filter: blur(4px); 
                  -webkit-backdrop-filter: blur(4px);
                  will-change: opacity, backdrop-filter; 
                  padding: 20px;
                  opacity: 0; transition: opacity 0.3s ease;
              }
              .pastel-modal-wrapper.open { opacity: 1; }
              
              .pastel-modal {
                  background: #ffffff;
                  border-radius: 36px;
                  padding: 32px;
                  width: 100%; max-width: 600px;
                  box-shadow: 0 10px 30px rgba(0,0,0,0.08); 
                  display: flex; flex-direction: column; gap: 28px;
                  transform: scale(0.9) translateY(20px); 
                  transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); 
                  will-change: transform; 
              }

              .pastel-btn-icon {
                  background: #f8fafc; color: #94a3b8;
                  width: 44px; height: 44px; border-radius: 50%; border: 2px solid #f1f5f9;
                  display: flex; align-items: center; justify-content: center;
                  cursor: pointer; transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
              }
              .pastel-btn-icon:hover { 
                  background: #f1f5f9; 
                  color: #ef4444; 
                  transform: scale(1.1) rotate(90deg); 
              }
              .pastel-btn-icon:active { transform: scale(0.9); }

              @keyframes pastelPop {
                  0% { opacity: 0; transform: scale(0.8); }
                  100% { opacity: 1; transform: scale(1); }
              }

              .pastel-chip {
                  background: #ffffff; color: #94a3b8;
                  border: 2px solid #f1f5f9; border-radius: 20px; padding: 14px 20px;
                  font-family: 'Nunito', sans-serif; font-weight: 700; font-size: 1.05rem;
                  cursor: pointer; 
                  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
                  display: flex; align-items: center; justify-content: center; user-select: none;
                  opacity: 0;
                  animation: pastelPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
              }
              
              .pastel-chip:hover {
                  transform: translateY(-4px);
                  box-shadow: 0 8px 16px rgba(0,0,0,0.04);
                  border-color: #e2e8f0;
              }
              .pastel-chip:active { transform: scale(0.9); }

              .pastel-chip.active {
                  transform: translateY(-2px);
                  box-shadow: 0 6px 14px rgba(0,0,0,0.06);
              }

              .pastel-btn-main {
                  color: #ffffff; 
                  border: none; border-radius: 24px; padding: 18px;
                  font-size: 1.2rem; font-weight: 800; font-family: 'Nunito', sans-serif;
                  cursor: pointer; transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                  box-shadow: 0 10px 24px rgba(0,0,0,0.12);
                  margin-top: 8px;
              }
              .pastel-btn-main:hover { transform: translateY(-3px); box-shadow: 0 14px 28px rgba(0,0,0,0.15); }
              .pastel-btn-main:active { transform: scale(0.95); }
              
              .pastel-scroll::-webkit-scrollbar { width: 6px; }
              .pastel-scroll::-webkit-scrollbar-track { background: transparent; }
              .pastel-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
          `;
          document.head.appendChild(style);
      }

      const overlay = document.createElement('div');
      overlay.id = 'course-selector-modal';
      overlay.className = 'pastel-modal-wrapper';
      
      let tempBook = App.state.bookFilter;
      let tempLessons = [...App.state.lessonFilter];

      const books = Array.from(new Set(DATA.VOCAB.map(v => String(v.book)))).sort((a,b) => a.localeCompare(b));
      if(!books.includes('1')) books.unshift('1');

      overlay.innerHTML = `
          <div class="pastel-modal" onclick="event.stopPropagation()">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                  <h3 style="font-family:'Nunito', sans-serif; font-size:1.8rem; font-weight:800; color:#334155; margin:0;">Select Course</h3>
                  <button class="pastel-btn-icon" id="closeCourseModal">
                      <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                  </button>
              </div>
              
              <div class="pastel-scroll" style="display: flex; flex-direction: column; gap: 32px; max-height: 60vh; overflow-y: auto; padding: 4px; margin: -4px;">
                  <div>
                      <div style="font-family: 'Nunito', sans-serif; font-weight: 800; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1.5px; color: #cbd5e1; margin-bottom: 16px; margin-left: 4px;">Book</div>
                      <div id="bookContainer" style="display: flex; gap: 14px; flex-wrap: wrap;"></div>
                  </div>

                  <div>
                      <div style="font-family: 'Nunito', sans-serif; font-weight: 800; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1.5px; color: #cbd5e1; margin-bottom: 16px; margin-left: 4px;">Lessons</div>
                      <div id="lessonContainer" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(70px, 1fr)); gap: 14px;"></div>
                  </div>
              </div>
              
              <button id="applyCourseFilters" class="pastel-btn-main">Apply Filters</button>
          </div>
      `;
      
      document.body.appendChild(overlay);

      const bookContainer = overlay.querySelector('#bookContainer');
      const lessonContainer = overlay.querySelector('#lessonContainer');
      const applyBtn = overlay.querySelector('#applyCourseFilters');

      const updateLessonVisuals = () => {
          const isAllActive = tempLessons.includes('All');
          const currentBookColor = Utils.getBookColor(tempBook);
          const currentBookBg = Utils.getBookBg(tempBook);

          applyBtn.style.background = currentBookColor;
          applyBtn.style.boxShadow = `0 8px 20px ${currentBookColor}40`; 

          lessonContainer.querySelectorAll('.pastel-chip').forEach(btn => {
              const l = btn.dataset.lesson;
              const isActive = (l === 'All') ? isAllActive : (tempLessons.includes(l) && !isAllActive);

              if (isActive) {
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
      };

      const renderBookAndLessons = () => {
          bookContainer.innerHTML = books.map((b, i) => {
              const isActive = b === tempBook;
              const activeColor = Utils.getBookColor(b);
              const activeBg = Utils.getBookBg(b);
              const activeStyle = isActive ? `color: ${activeColor}; background: ${activeBg}; border-color: ${activeColor};` : '';
              
              return `
              <div class="pastel-chip ${isActive ? 'active' : ''}" data-book="${b}" style="${activeStyle} animation-delay: ${i * 0.04}s;">
                  Book ${b}
              </div>
              `;
          }).join('');

          bookContainer.querySelectorAll('.pastel-chip').forEach(btn => {
              btn.onclick = () => { 
                  if (window.Sound) window.Sound.play('click');
                  tempBook = btn.dataset.book; 
                  tempLessons = ['All']; 
                  renderBookAndLessons(); 
              };
          });

          const availableLessons = Array.from(new Set(DATA.VOCAB.filter(v => String(v.book) === tempBook).map(v => String(v.lesson)))).sort((a, b) => Number(a) - Number(b));
          
          let lessonHtml = `
              <div class="pastel-chip" data-lesson="All" style="animation-delay: 0s;">
                  All
              </div>
          `;

          lessonHtml += availableLessons.map((l, i) => {
              return `
              <div class="pastel-chip" data-lesson="${l}" style="animation-delay: ${(i + 1) * 0.02}s;">
                  ${l}
              </div>
              `;
          }).join('');
          
          lessonContainer.innerHTML = lessonHtml;
          updateLessonVisuals(); 

          lessonContainer.querySelectorAll('.pastel-chip[data-lesson]').forEach(btn => {
              btn.onclick = () => {
                  if (window.Sound) window.Sound.play('click');
                  const l = btn.dataset.lesson;
                  if (l === 'All') {
                      tempLessons = ['All'];
                  } else {
                      if (tempLessons.includes('All')) tempLessons = [];
                      if (tempLessons.includes(l)) {
                          tempLessons = tempLessons.filter(x => x !== l);
                      } else {
                          tempLessons.push(l);
                      }
                      if (tempLessons.length === 0) tempLessons = ['All'];
                  }
                  updateLessonVisuals(); 
              };
          });
      };
      
      renderBookAndLessons();
      
      requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('open')));
      
      const closeFn = () => {
          overlay.classList.remove('open');
          setTimeout(() => overlay.remove(), 300); 
      };

      const applyFn = () => {
          if (window.Sound) window.Sound.play('click');
          App.state.bookFilter = tempBook;
          App.state.lessonFilter = tempLessons;
          App.saveSettings(); 
          App.updateActiveList(); 
          UI.updateLessonBadge(); 
          UI.render(); 
          document.getElementById('dynamicIsland')?.classList.remove('expanded');
          closeFn();
      };

      overlay.querySelector('#closeCourseModal').onclick = closeFn;
      applyBtn.onclick = applyFn;
      overlay.onclick = (e) => { if (e.target === overlay) closeFn(); };
  },
applyMobileUXTheme() {
      if (document.getElementById('mobile-ux-styles')) return;
      const style = document.createElement('style');
      style.id = 'mobile-ux-styles';
      style.innerHTML = `
          #app { 
              padding-top: 85px !important; 
              overflow-x: hidden !important;
          } 
          
          body.focus-mode #app {
              padding-top: max(20px, env(safe-area-inset-top)) !important;
          }
          
          .modal-overlay { z-index: 3000 !important; }

          .dynamic-island-wrapper {
              position: fixed; 
              top: max(20px, env(safe-area-inset-top) + 5px);
              left: 0; right: 0;
              display: flex; justify-content: center; z-index: 1000; pointer-events: none;
          }
          
          .dynamic-island {
              background: rgba(255, 255, 255, 0.8); 
              backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
              border: 1.5px solid rgba(255, 158, 181, 0.3); 
              border-radius: 25px;
              padding: 0 16px; 
              width: 90%; max-width: 360px;
              pointer-events: auto; cursor: pointer;
              display: flex; flex-direction: column; overflow: hidden;
              transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
              height: 44px; 
              box-sizing: border-box;
          }
          
          .dynamic-island.expanded {
              height: 160px;
              background: rgba(255, 255, 255, 0.98);
              border-radius: 30px;
          }
          
          .island-header { 
              display: flex; align-items: center; justify-content: space-between; 
              height: 44px; gap: 12px; flex-shrink: 0;
          }
          
          .island-progress-container { 
              flex: 1; height: 6px; background: #fff0f5; 
              border-radius: 10px; overflow: hidden; 
          }
          
          .global-progress-fill { 
              height: 100%; background: linear-gradient(90deg, #ff9eb5, #ff8fa3); 
              transition: width 0.3s cubic-bezier(0.2, 0.8, 0.2, 1); 
          }
          
          .island-stats { 
              display: flex; align-items: center; gap: 8px; 
              font-family: 'Nunito', sans-serif; font-size: 0.85rem; 
          }
          
          .island-chevron { 
              transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); 
              color: #ff9eb5; display: flex; align-items: center; height: 100%;
          }
          
          .dynamic-island.expanded .island-chevron { transform: rotate(180deg); }
          
          .island-body { 
              opacity: 0; transform: translateY(-5px); transition: all 0.3s ease; 
              pointer-events: none; margin-top: 10px; display: flex; flex-direction: column; gap: 8px; 
          }
          
          .dynamic-island.expanded .island-body { opacity: 1; transform: translateY(0); pointer-events: auto; }
          
          .island-lesson-btn { 
              background: #fff0f5; color: #ec4899; border: none; padding: 10px; 
              border-radius: 15px; font-family: 'Nunito', sans-serif; font-weight: 800; 
              font-size: 0.9rem; cursor: pointer; 
          }
          
          .island-actions { display: flex; gap: 8px; }
          .island-action-btn { 
              flex: 1; background: #ffffff; color: #ff9eb5; border: 1px solid #fff0f5; 
              padding: 8px; border-radius: 15px; font-family: 'Nunito', sans-serif; 
              font-weight: 800; font-size: 0.85rem; display: flex; align-items: center; 
              justify-content: center; gap: 6px; 
          }
          .island-action-btn.active { background: #ff9eb5; color: white; }

          .streak-sticker {
              position: absolute; top: -10px; right: -10px;
              border: 3px solid rgba(255, 255, 255, 0.9); border-radius: 18px;
              padding: 4px 10px; display: flex; align-items: center; gap: 6px;
              transform: rotate(6deg); z-index: 100; opacity: 0;
              pointer-events: none; overflow: hidden;
          }
          .streak-sticker.visible { opacity: 1; }
          
          .streak-sticker.theme-pink { background: linear-gradient(135deg, #ffb3c6, #ff8da1); box-shadow: 0 4px 12px rgba(255, 107, 139, 0.15); }
          .streak-sticker.theme-gold { background: linear-gradient(135deg, #fde68a, #fbbf24); box-shadow: 0 4px 12px rgba(245, 158, 11, 0.15); }
          .streak-sticker.theme-cyan { background: linear-gradient(135deg, #a5f3fc, #22d3ee); box-shadow: 0 4px 12px rgba(6, 182, 212, 0.15); }
          .streak-sticker.theme-purple { background: linear-gradient(135deg, #d8b4fe, #a855f7); box-shadow: 0 4px 12px rgba(147, 51, 234, 0.15); }

          .sticker-icon { width: 14px; height: 14px; color: white; opacity: 0.9; }
          .sticker-text { font-family: 'Nunito', sans-serif; font-weight: 800; font-size: 1rem; color: white; line-height: 1; opacity: 0.95; }
          
          .sticker-shine {
              position: absolute; top: 0; left: -100%; width: 50%; height: 100%;
              background: linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,0.4) 50%, rgba(255,255,255,0) 100%);
              transform: skewX(-20deg); animation: shineSticker 3s infinite;
          }
          
          @keyframes shineSticker { 0% { left: -100%; } 20% { left: 200%; } 100% { left: 200%; } }
          @keyframes boingSticker {
              0% { transform: scale(0.5) rotate(0deg); opacity: 0; }
              60% { transform: scale(1.1) rotate(10deg); opacity: 1; }
              100% { transform: scale(1) rotate(6deg); opacity: 1; }
          }

          .example-zh { font-size: 1.5rem !important; line-height: 1.5 !important; margin-bottom: 8px !important; }
          .example-py { font-size: 0.95rem !important; font-weight: 800 !important; margin-bottom: 4px !important; }
          .example-en { font-size: 0.95rem !important; color: var(--text-muted) !important; font-weight: 600 !important;}
          
          .sentence-hanzi { font-size: 1.8rem !important; line-height: 1.5 !important; }
          .sentence-hanzi-back { font-size: 1.6rem !important; line-height: 1.5 !important; margin-bottom: 12px !important; }
          
          .example-section { margin-top: 20px !important; padding-top: 15px !important; padding-bottom: 5px !important; }

          @media (max-width: 768px) {
              .study-card-container, .card-container:not(.sentence-card-container) { 
                  max-width: 75vw !important; width: 75vw !important; 
              }
              
              .sentence-card-container {
                  max-width: 90vw !important; width: 90vw !important;
                  aspect-ratio: auto !important; min-height: 180px !important;
              }
              .sentence-card-container .card__face {
                  min-height: 180px !important; padding: 24px 16px !important;
              }

              .card:hover .card__face { animation: none !important; }
              
              .study-hz-lg { font-size: clamp(5rem, 60vw, 15rem) !important; line-height: 1.1 !important; }
              .study-hz-lg-back { font-size: clamp(4.5rem, 50vw, 12rem) !important; margin: 0 0 0.5rem 0 !important; }
             .quiz-reveal-hz { font-size: clamp(2.5rem, 15vw, 4rem) !important; }
              
              .example-zh { font-size: 1.35rem !important; }
              .sentence-hanzi { font-size: 1.5rem !important; }
              .sentence-hanzi-back { font-size: 1.35rem !important; }
              .def-display { font-size: 1.05rem !important; line-height: 1.4 !important; }
              .pinyin-display { font-size: 1.15rem !important; }
              
              .quiz-input-container { width: 85vw !important; max-width: 100% !important; }
          }
      `;
      document.head.appendChild(style);
  },
  applyPastelSettingsTheme() {
      if (document.getElementById('pastel-settings-styles')) return;
      
      const style = document.createElement('style');
      style.id = 'pastel-settings-styles';
      style.innerHTML = `
          #settingsModal.modal-overlay {
              display: flex !important;
              align-items: center !important;
              justify-content: center !important;
              background: rgba(255, 255, 255, 0.6) !important;
              backdrop-filter: blur(4px) !important;
              -webkit-backdrop-filter: blur(4px) !important;
              will-change: opacity, backdrop-filter !important;
              padding: 20px !important;
          }
          
          #settingsModal .modal-sheet {
              position: relative !important;
              bottom: auto !important;
              background: #ffffff !important;
              border-radius: 36px !important;
              padding: 32px !important;
              width: 100% !important;
              max-width: 600px !important;
              box-shadow: 0 10px 30px rgba(0,0,0,0.08) !important;
              transform: scale(0.9) translateY(20px) !important; 
              transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
              will-change: transform !important;
              max-height: 85vh !important;
              display: flex !important;
              flex-direction: column !important;
          }
          #settingsModal.open .modal-sheet { transform: scale(1) translateY(0) !important; }
          
          #settingsModal .modal-close {
              position: absolute !important; top: 24px !important; right: 24px !important;
              background: #f8fafc !important; color: #94a3b8 !important;
              width: 44px !important; height: 44px !important;
              border-radius: 50% !important; border: 2px solid #f1f5f9 !important;
              display: flex !important; align-items: center !important; justify-content: center !important;
              font-family: 'Nunito', sans-serif !important; font-weight: 800 !important;
              font-size: 1.4rem !important; line-height: 0 !important; padding-bottom: 4px !important;
              cursor: pointer !important; transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
          }
          #settingsModal .modal-close:hover { 
              background: #f1f5f9 !important; color: #ef4444 !important; 
              transform: scale(1.1) rotate(90deg) !important; 
          }
          #settingsModal .modal-close:active { transform: scale(0.9) !important; }
          
          #settingsModalContent {
              overflow-y: auto !important; padding-right: 8px !important; margin-right: -4px !important;
          }
          #settingsModalContent::-webkit-scrollbar { width: 6px !important; }
          #settingsModalContent::-webkit-scrollbar-track { background: transparent !important; }
          #settingsModalContent::-webkit-scrollbar-thumb { background: #cbd5e1 !important; border-radius: 10px !important; }
          
          #settingsModal .settings-header { border-bottom: none !important; margin-bottom: 24px !important; padding: 0 !important;}
          #settingsModal .settings-header h2 {
              font-family: 'Nunito', sans-serif !important; font-size: 1.8rem !important;
              font-weight: 800 !important; color: #334155 !important; margin: 0 !important;
          }
          #settingsModal .settings-section-title {
              font-family: 'Nunito', sans-serif !important; font-weight: 800 !important;
              font-size: 0.85rem !important; text-transform: uppercase !important;
              letter-spacing: 1.5px !important; color: #cbd5e1 !important; margin: 0 0 16px 12px !important;
          }
          
          #settingsModal .setting-card {
              background: #ffffff !important; border: 2px solid #f1f5f9 !important;
              border-radius: 24px !important; padding: 8px 20px !important;
              box-shadow: 0 8px 16px rgba(0,0,0,0.02) !important; margin-bottom: 28px !important;
          }
          #settingsModal .setting-row { border-bottom: 2px dashed #f1f5f9 !important; padding: 18px 0 !important; margin: 0 !important;}
          #settingsModal .setting-row:last-child { border-bottom: none !important; }
          
          #settingsModal .setting-name {
              font-family: 'Nunito', sans-serif !important; font-weight: 800 !important;
              color: #475569 !important; font-size: 1.05rem !important;
          }
          #settingsModal .setting-desc {
              font-family: 'Nunito', sans-serif !important; font-weight: 700 !important;
              color: #94a3b8 !important; font-size: 0.85rem !important;
          }
          
          #settingsModal .switch { width: 54px !important; height: 32px !important; }
          #settingsModal .slider {
              background-color: #f1f5f9 !important; border-radius: 30px !important;
              box-shadow: inset 0 2px 4px rgba(0,0,0,0.05) !important;
          }
          #settingsModal .slider:before {
              height: 24px !important; width: 24px !important; left: 4px !important; bottom: 4px !important;
              background-color: white !important; border-radius: 50% !important;
              box-shadow: 0 4px 8px rgba(0,0,0,0.1) !important; transition: .3s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
          }
          #settingsModal input:checked + .slider { background-color: #6ea1c6 !important; }
          #settingsModal input:checked + .slider:before { transform: translateX(22px) !important; }
          
          #settingsModal .speed-group { background: transparent !important; padding: 0 !important; gap: 8px !important; flex-wrap: wrap !important; }
          #settingsModal .speed-btn {
              background: #ffffff !important; color: #94a3b8 !important; border: 2px solid #f1f5f9 !important;
              border-radius: 16px !important; padding: 10px 14px !important;
              font-family: 'Nunito', sans-serif !important; font-weight: 800 !important; font-size: 0.95rem !important;
              transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) !important; cursor: pointer !important;
          }
          #settingsModal .speed-btn:hover { transform: translateY(-3px) !important; box-shadow: 0 6px 12px rgba(0,0,0,0.04) !important; border-color: #e2e8f0 !important; }
          #settingsModal .speed-btn:active { transform: scale(0.9) !important; }
          #settingsModal .speed-btn.active {
              background: #e0f2fe !important; color: #6ea1c6 !important; border-color: #6ea1c6 !important;
              transform: translateY(-2px) !important; box-shadow: 0 8px 16px rgba(110,161,198,0.2) !important;
          }
      `;
      document.head.appendChild(style);
  },

  closePopups() {
    document.querySelectorAll('.nav-popup').forEach(p => { p.classList.remove('active'); setTimeout(() => p.remove(), 200); });
  },

  updateNavHighlight() {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    let target = App.state.mode;
    if (target === 'list') target = 'study';
    if (target === 'builder') target = 'sentences';
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
  },

  updateSpeedButtons() {
    document.querySelectorAll('.speed-btn').forEach(btn => {
      const rate = parseFloat(btn.dataset.rate);
      btn.classList.toggle('active', rate === App.state.ttsRate);
    });
  },

  updateStreak() {
    const isGame = ['quiz', 'listening'].includes(App.state.mode);
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

        const container = document.querySelector('.card-container') || document.querySelector('.listening-card');
        if (container) {
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
    if (App.state.quizType === 'translate' && DATA.SENTENCES.length > 0) {
      studyBtn.style.display = 'none';
      if (App.state.mode === 'study') App.setMode('sentences');
    } else {
      studyBtn.style.display = 'flex';
    }
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
  showToast(msg) {
    let toast = document.getElementById('appToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'appToast';
        toast.style.cssText = `position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.7); color: white; padding: 10px 20px; border-radius: 20px; font-size: 0.9rem; pointer-events: none; opacity: 0; transition: opacity 0.3s; z-index: 3000;`;
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => toast.style.opacity = '0', 1500);
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
        this.container.style.justifyContent = 'center';
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
        this.renderSummary();
        return;
    }

    const showProgress = ['study', 'sentences', 'quiz', 'listening', 'writing', 'builder', 'list'].includes(App.state.mode);
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

    if (App.state.mode === 'study') this.renderStudy(item);
    else if (App.state.mode === 'sentences') this.renderSentences(item);
    else if (App.state.mode === 'quiz') this.renderQuiz(item);
    else if (App.state.mode === 'builder') this.renderBuilder(item);
    else if (App.state.mode === 'listening') this.renderListening(item);
    else if (App.state.mode === 'writing') this.renderWriting(item);
    else if (App.state.mode === 'list') this.renderList();
   
    if (['quiz', 'listening'].includes(App.state.mode)) {
        this.updateStreak();
    }
  },

  celebrate() {
    const colors = ['#ec4899', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];
    for(let i=0; i<30; i++) {
      const el = document.createElement('div');
      el.className = 'confetti';
      el.style.left = Math.random() * 100 + 'vw';
      el.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      el.style.animationDuration = (Math.random() * 2 + 1.5) + 's';
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 4000);
    }
  },

  updateLessonBadge() {
    const badge = document.getElementById('lessonBadge');
    if (!badge) return;
    const book = App.state.bookFilter;
    const filters = App.state.lessonFilter;
    const lessonText = filters.includes('All') ? 'All' : filters.map(l => `L${l}`).join(', ');
    
    badge.textContent = `Book ${book} ${lessonText}`;
    badge.style.backgroundColor = Utils.getBookBg(book);
    badge.style.color = Utils.getBookColor(book);
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
            App.state.isFinished = false;
            if (App.state.shuffle) App.state.activeList.sort(() => Math.random() - 0.5);
            UI.render();
        };
    }
  }
};
window.UI = UI;