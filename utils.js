const Utils = {
  formatNumberedPinyin(pinyinStr) {
      if (!pinyinStr || pinyinStr === "_stroke") return "";
      const toneMap = {
          a: ['ā', 'á', 'ǎ', 'à', 'a'],
          e: ['ē', 'é', 'ě', 'è', 'e'],
          i: ['ī', 'í', 'ǐ', 'ì', 'i'],
          o: ['ō', 'ó', 'ǒ', 'ò', 'o'],
          u: ['ū', 'ú', 'ǔ', 'ù', 'u'],
          v: ['ǖ', 'ǘ', 'ǚ', 'ǜ', 'ü'],
          ü: ['ǖ', 'ǘ', 'ǚ', 'ǜ', 'ü']
      };
      
      let match = pinyinStr.match(/([a-zA-Züv]+)(\d)/);
      if (!match) return pinyinStr;
      
      let text = match[1].toLowerCase();
      let tone = parseInt(match[2]) - 1;
      
      let targetVowel = 'a';
      if (text.includes('a')) targetVowel = 'a';
      else if (text.includes('e')) targetVowel = 'e';
      else if (text.includes('ou')) targetVowel = 'o';
      else targetVowel = text.match(/[aeiouvü]/g)?.pop() || 'a';
      
      return text.replace(targetVowel, toneMap[targetVowel][tone] || targetVowel);
  },

  buildPremiumTree(node) {
      if (!node) return '';
      const char = node.component || '?';
      const meaning = (node.meaning || 'Component').split(/[,;]/)[0]; 
      const pinyinRaw = Array.isArray(node.pinyin) ? node.pinyin[0] : (node.pinyin || '');
      const pinyin = this.formatNumberedPinyin(pinyinRaw);
      const hasChildren = node.children && node.children.length > 0;

      let icon = hasChildren 
          ? `<div class="p-chevron"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg></div>`
          : `<div class="p-leaf-dot"></div>`;

      let childrenHTML = '';
      if (hasChildren) {
          let innerHTML = '';
          node.children.forEach(child => { innerHTML += this.buildPremiumTree(child); });
          childrenHTML = `<div class="p-children-wrapper"><div class="p-children-inner">${innerHTML}</div></div>`;
      }

      const cursor = hasChildren ? 'cursor: pointer;' : 'cursor: default;';
      const onClick = hasChildren ? `onclick="this.parentElement.classList.toggle('expanded'); event.stopPropagation();"` : `onclick="event.stopPropagation();"`;

      return `
      <div class="p-node">
          <div class="p-node-header" style="${cursor}" ${onClick}>
              ${icon}
              <div class="p-char">${char}</div>
              <div class="p-info">
                  ${pinyin ? `<div class="p-py">${pinyin}</div>` : ''}
                  <div class="p-def">${meaning}</div>
              </div>
          </div>
          ${childrenHTML}
      </div>`;
  },
  
  colors: ['#ec4899', '#8b5cf6'],
  
  getBookColor(bookId) {
    switch(String(bookId)) {
        case '2': return '#fb923c'; 
        case '3': return '#a855f7'; 
        case '4': return '#6eaa73'; 
        default: return '#6ea1c6'; 
    }
  },

  getBookBg(bookId) {
    switch(String(bookId)) {
        case '2': return '#ffedd5'; 
        case '3': return '#f3e8ff'; 
        case '4': return '#dcfce7'; 
        default: return '#e0f2fe'; 
    }
  },

  normalizeSearch(str) {
    if (!str) return '';
    return String(str).toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[()\s]/g, '');
  },

  createBreakdown(text) {
    if (!text) return '';
    const componentRegex = /([\p{Script=Han}]+)(\s*\([^)]+\))?/gu;
    return text.replace(componentRegex, (match, char, desc) => {
      const description = desc || '';
      return `<span class="interactive-char" data-action="show-char-details" data-char="${char}">${char}</span>${description}`;
    });
  },
  
  createInteractiveHanzi(text, colorize = true, highlightSource = null) {
    if(!text) return '';
    const parts = text.match(/(\(.*?\)|（.*?）|.)/g) || [];
    const allowColor = colorize && !(window.App && App.state.noHanziColor);
    const separate = window.App && App.state.separateMode !== 'off' && parts.length > 1;

    const highlightIndices = new Set();
    if (highlightSource) {
        const terms = (Array.isArray(highlightSource) ? highlightSource : [highlightSource])
            .flatMap(s => String(s).split(/[\/，,]/))
            .map(t => t.replace(/[（(].*?[）)]/g, '').trim())
            .filter(t => t);

        terms.forEach(term => {
            if (!term) return;
            let pos = 0;
            while ((pos = text.indexOf(term, pos)) !== -1) {
                let currentLen = 0;
                for (let i = 0; i < parts.length; i++) {
                    const partLen = parts[i].length;
                    const partStart = currentLen;
                    const partEnd = currentLen + partLen;
                    
                    if (partEnd > pos && partStart < pos + term.length) {
                        highlightIndices.add(i);
                    }
                    currentLen += partLen;
                }
                pos += 1;
            }
        });
    }

    return parts.map((c, i) => {
       const color = allowColor ? this.colors[i % this.colors.length] : 'inherit';
       const cls = `interactive-char${separate ? ' separated' : ''}`;
       
       let style = `color:${color};`;
       if (highlightIndices.has(i)) {
           style = `color: #a2a2fd; font-weight: bold;`;
       }

       return `<span class="${cls}" data-action="show-char-details" data-char="${c}" style="${style}">${c}</span>`;
    }).join('');
  },

  createInteractiveSentence(text, highlightSource = null) {
    if (!text) return '';

    if (!this._vocabSet || this._vocabSet.size === 0) {
        this._vocabSet = new Set();
        if (typeof DATA !== 'undefined' && DATA.VOCAB) {
            DATA.VOCAB.forEach(v => {
                v.hanzi.split(/[\/，,]/).forEach(w => {
                    const clean = w.replace(/[（(].*?[）)]/g, '').trim();
                    if (clean.length > 1) this._vocabSet.add(clean);
                });
            });
        }
    }

    let targetWords = [];
    if (highlightSource) {
        targetWords = (Array.isArray(highlightSource) ? highlightSource : [highlightSource])
            .flatMap(s => String(s).split(/[\/，,]/))
            .map(t => t.replace(/[（(].*?[）)]/g, '').trim())
            .filter(t => t);
    }

    if (window.Intl && Intl.Segmenter) {
        const segmenter = new Intl.Segmenter('zh-TW', { granularity: 'word' });
        const segments = Array.from(segmenter.segment(text));
        
        let html = '';
        let currentIndex = 0;

        while (currentIndex < text.length) {
            let matchedTarget = targetWords.find(tw => text.startsWith(tw, currentIndex));
            
            if (matchedTarget) {
                // ✨ Clean CSS classes instead of inline styles
                html += `<span class="interactive-word highlighted" data-action="show-char-details" data-char="${matchedTarget}">${matchedTarget}</span>`;
                currentIndex += matchedTarget.length;
                continue;
            }

            const segmentData = segments.find(s => s.index === currentIndex);
            if (!segmentData) { 
                html += text[currentIndex];
                currentIndex++;
                continue;
            }

            const segment = segmentData.segment;
            
            if (!segmentData.isWordLike || /[，。！？、；：“”‘’（）《》〈〉【】\s]/.test(segment)) {
                html += segment; 
            } else if (segment.length > 1) {
                if (this._vocabSet.has(segment)) {
                    // ✨ Clean CSS class
                    html += `<span class="interactive-word" data-action="show-char-details" data-char="${segment}">${segment}</span>`;
                } else {
                    for (let c of segment) {
                         html += `<span class="interactive-char" data-action="show-char-details" data-char="${c}">${c}</span>`;
                    }
                }
            } else {
                let isTargetHalf = false;
                targetWords.forEach(tw => {
                    if (tw.length === 2 && tw.includes(segment)) isTargetHalf = true;
                });
                
                const cls = isTargetHalf ? 'interactive-word highlighted' : 'interactive-char';
                html += `<span class="${cls}" data-action="show-char-details" data-char="${segment}">${segment}</span>`;
            }
            
            currentIndex += segment.length;
        }
        return html;
    }

    let html = '';
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const isPunctuation = /[，。！？、；：“”‘’（）《》〈〉【】\s]/.test(char);
        if (isPunctuation) {
            html += char;
        } else {
            html += `<span class="interactive-char" data-action="show-char-details" data-char="${char}">${char}</span>`;
        }
    }
    return html;
  },

  colorPinyin(text) {
    if(!text) return '';
    const converted = this.convertTones(text);
    return `<span style="color:#a78bfa">${converted}</span>`;
  },

  convertTones(text) {
    if (!text) return ''; 
    const map = { 'a': 'āáǎà', 'e': 'ēéěè', 'i': 'īíǐì', 'o': 'ōóǒò', 'u': 'ūúǔù', 'v': 'ǖǘǚǜ', 'ü': 'ǖǘǚǜ' };
    return text.replace(/([a-z:üv]+)([1-5])/gi, (match, syl, num) => {
      const tone = parseInt(num) - 1;
      if (tone >= 4) return syl; 
      
      if (syl.includes('a')) return syl.replace('a', map['a'][tone]);
      if (syl.includes('e')) return syl.replace('e', map['e'][tone]);
      if (syl.includes('ou')) return syl.replace('o', map['o'][tone]);
      
      for (let i = syl.length - 1; i >= 0; i--) {
        if (map[syl[i]]) return syl.substring(0, i) + map[syl[i]][tone] + syl.substring(i + 1);
      }
      return syl;
    });
  },

  colorHanzi(text) {
    return this.createInteractiveHanzi(text, true);
  },

  async copyToClipboard(text) {
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise((resolve, reject) => {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const success = document.execCommand('copy');
        document.body.removeChild(ta);
        success ? resolve() : reject(new Error('execCommand failed'));
      } catch (err) {
        reject(err);
      }
    });
  },

  speak(text, rate, audioFile) {
    window.speechSynthesis.cancel();
    
    if (audioFile) {
      const audio = new Audio(`audio/${audioFile}`);
      audio.playbackRate = rate * 2; 
      audio.play().catch(err => {
        console.warn("Audio file failed, falling back to TTS", err);
        this.speakTTS(text, rate);
      });
    } else {
      this.speakTTS(text, rate);
    }
  },

  speakTTS(text, rate) {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-TW';
      u.rate = rate;
  
      const voices = window.speechSynthesis.getVoices();
      const googleVoice = voices.find(v => v.name.includes('Google') && v.lang.includes('zh-TW'));
      if (googleVoice) u.voice = googleVoice;
  
      window.speechSynthesis.speak(u);
  },

  normalizeQuizInput(str) {
    if (!str) return '';
    return str.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") 
      .replace(/ü/g, 'u').replace(/v/g, 'u') 
      .replace(/[0-9]/g, '') 
      .replace(/[^a-z0-9]/g, ''); 
  },

  checkAnswer(input, target) {
    if (!input || !target) return false;
    const normInput = this.normalizeQuizInput(input);
    
    const options = target.split(/[\/;|]/).map(t => t.trim()).filter(Boolean);
    const variations = new Set();
    
    options.forEach(opt => {
      variations.add(this.normalizeQuizInput(opt)); 
      variations.add(this.normalizeQuizInput(opt.replace(/\([^)]+\)/g, ''))); 
      variations.add(this.normalizeQuizInput(opt.replace(/[()]/g, ''))); 
    });

    return variations.has(normInput);
  },

  expandVocabToChars(items, { includeSingles = true } = {}) {
    const expanded = [];
    const seen = new Set();

    items.forEach(item => {
      const hanzi = (item.hanzi || '').replace(/\s+/g, '');
      const base = hanzi.replace(/[（(].*?[）)]/g, '').replace(/[^\u4e00-\u9fa5]/g, '');
      const chars = [...base];

      if (chars.length <= 1) {
        if (includeSingles) {
            if (base && !seen.has(base)) {
                expanded.push(item);
                seen.add(base);
            }
        }
        return;
      }

      let pinyinParts = (item.pinyin || '').trim().split(/\s+/).filter(Boolean);
      const useCharLookup = pinyinParts.length !== chars.length;

      chars.forEach((char, idx) => {
        if (seen.has(char)) return;

        const py = (!useCharLookup ? pinyinParts[idx] : null)
          || (DATA.CHARS && DATA.CHARS[char]?.pinyin)
          || item.pinyin 
          || '';
        const def = (DATA.CHARS && DATA.CHARS[char]?.def)
          || (DATA.FALLBACK_DEFS && DATA.FALLBACK_DEFS[char]?.d)
          || item.def;
        const hook = (DATA.CHARS && DATA.CHARS[char]?.hook) || '';

        const charItem = {
          ...item,
          hanzi: char,
          pinyin: py,
          def,
          hook,
          __parent: item.hanzi,
          id: `${item.id}-char-${idx}`
        };
        charItem.searchKey = this.normalizeSearch(`${char}${py}${def}`);
        expanded.push(charItem);
        seen.add(char);
      });
    });
    return expanded;
  },

  generateToneDistractors(correctPinyin) {
    const groups = {
        'a': 'āáǎàa', 'e': 'ēéěèe', 'i': 'īíǐìi', 'o': 'ōóǒòo', 'u': 'ūúǔùu', 'ü': 'ǖǘǚǜü', 'v': 'ǖǘǚǜü'
    };
    
    const charToTone = {};
    Object.keys(groups).forEach(base => {
        const chars = groups[base];
        for(let i=0; i<chars.length; i++) {
            charToTone[chars[i]] = { base, tone: i };
        }
    });

    const distractors = new Set();
    let attempts = 0;
    const syllables = correctPinyin.split(/\s+/);
    
    const getTargetVowel = (syl) => {
        for (let i = 0; i < syl.length; i++) {
            const info = charToTone[syl[i]];
            if (info && info.tone < 4) {
                return { index: i, base: info.base, currentTone: info.tone };
            }
        }
        const priorities = ['a', 'e', 'o'];
        for (const v of priorities) {
            const idx = syl.indexOf(v);
            if (idx > -1) return { index: idx, base: v, currentTone: 4 };
        }
        for (let i = syl.length - 1; i >= 0; i--) {
            const c = syl[i];
            if ('iuvü'.includes(c)) {
                const base = (c === 'v' || c === 'ü') ? 'ü' : c;
                return { index: i, base, currentTone: 4 };
            }
        }
        return null;
    };

    while (distractors.size < 3 && attempts < 100) {
        attempts++;
        
        const newSyllables = syllables.map(syl => {
            if (syllables.length > 1 && Math.random() > 0.5) return syl;

            const target = getTargetVowel(syl);
            if (!target) return syl;

            const possibleTones = [0, 1, 2, 3, 4].filter(t => t !== target.currentTone);
            const newTone = possibleTones[Math.floor(Math.random() * possibleTones.length)];
            const newChar = groups[target.base][newTone];
            
            return syl.substring(0, target.index) + newChar + syl.substring(target.index + 1);
        });

        const candidate = newSyllables.join(' ');
        if (candidate !== correctPinyin) {
            distractors.add(candidate);
        }
    }
    return Array.from(distractors);
  }
};

window.Utils = Utils;