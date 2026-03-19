/**
 * tutorial.js
 * A highly aesthetic, interactive glassmorphic onboarding experience.
 */

const Tutorial = {
    currentStep: 0,
    isMobile: false,
    steps: [
        {
            title: "Navigating Cards",
            desc: "Move through your deck at your own pace.",
            mobileAnim: `
                <div class="tut-phone-mock">
                    <div class="tut-tap-zone tut-left"></div>
                    <div class="tut-tap-zone tut-right"></div>
                    <div class="tut-hand tut-anim-tap-sides">👆</div>
                </div>
                <div class="tut-labels"><span>Tap Left: Back</span><span>Tap Right: Next</span></div>
            `,
            pcAnim: `
                <div class="tut-keyboard">
                    <div class="tut-key tut-anim-press">◀</div>
                    <div class="tut-key tut-anim-press-delay">▶</div>
                </div>
                <div class="tut-labels" style="justify-content: center; gap: 20px;"><span>Left Arrow: Back</span><span>Right Arrow: Next</span></div>
            `
        },
        {
            title: "Reveal the Answer",
            desc: "Ready to see if you got it right?",
            mobileAnim: `
                <div class="tut-phone-mock">
                    <div class="tut-tap-zone tut-center"></div>
                    <div class="tut-hand tut-anim-tap-center">👆</div>
                </div>
                <div class="tut-labels" style="justify-content: center;"><span>Tap Center: Show Card</span></div>
            `,
            pcAnim: `
                <div class="tut-keyboard">
                    <div class="tut-key tut-key-wide tut-anim-press">Spacebar</div>
                </div>
                <div class="tut-labels" style="justify-content: center;"><span>Spacebar: Show Card</span></div>
            `
        },
        {
            title: "Sort Your Mastery",
            desc: "Separate what you know from what needs work.",
            mobileAnim: `
                <div class="tut-phone-mock" style="overflow: visible;">
                    <div class="tut-card-mock tut-anim-swipe"></div>
                    <div class="tut-hand tut-anim-hand-swipe">👆</div>
                </div>
                <div class="tut-labels"><span>Swipe Left:<br>To Review</span><span>Swipe Right:<br>Learned</span></div>
            `,
            pcAnim: `
                <div class="tut-keyboard">
                    <div class="tut-key tut-anim-press">N</div>
                    <div class="tut-key tut-anim-press-delay">M</div>
                </div>
                <div class="tut-labels" style="justify-content: center; gap: 20px;"><span>'N': To Review</span><span>'M': Learned</span></div>
            `
        },
        {
            title: "Pro Shortcuts",
            desc: "Speed up your workflow with quick actions.",
            mobileAnim: `
                <div class="tut-icon-grid">
                    <div class="tut-icon-box"><span style="font-size:24px;">🔊</span><br>Tap Audio Icon</div>
                    <div class="tut-icon-box"><span style="font-size:24px;">✍️</span><br>Tap Writing Icon</div>
                </div>
            `,
            pcAnim: `
                <div class="tut-keyboard">
                    <div class="tut-key tut-anim-press">E</div>
                    <div class="tut-key tut-anim-press-delay">W</div>
                </div>
                <div class="tut-labels" style="justify-content: center; gap: 20px;"><span>'E': Play Audio(Ex.)</span><span>'W': Toggle Writing</span></div>
            `
        }
    ],

    init() {
        // Only show once
        if (localStorage.getItem('tutorialCompleted') === 'true') return;
        
        // Check if device is primarily touch based
        this.isMobile = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 768;
        
        this.injectStyles();
        this.render();
    },

    forceShow() {
        this.currentStep = 0;
        this.isMobile = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 768;
        if (!document.getElementById('tut-styles')) this.injectStyles();
        this.render();
    },

    render() {
        const existing = document.getElementById('tut-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'tut-overlay';
        overlay.className = 'tut-overlay';

        overlay.innerHTML = `
            <div class="tut-modal">
                <button class="tut-skip" onclick="Tutorial.close()">Skip</button>
                
                <div class="tut-content" id="tut-content">
                    ${this.getSlideHTML()}
                </div>

                <div class="tut-footer">
                    <div class="tut-dots">
                        ${this.steps.map((_, i) => `<div class="tut-dot ${i === this.currentStep ? 'active' : ''}"></div>`).join('')}
                    </div>
                    <button class="tut-btn-next" onclick="Tutorial.next()">
                        ${this.currentStep === this.steps.length - 1 ? "Let's Go!" : "Next"}
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // Animate in
        setTimeout(() => overlay.classList.add('visible'), 50);
    },

    getSlideHTML() {
        const step = this.steps[this.currentStep];
        const visual = this.isMobile ? step.mobileAnim : step.pcAnim;
        const deviceLabel = this.isMobile ? "Touch Controls" : "Keyboard Controls";

        return `
            <div class="tut-slide">
                <div class="tut-badge">${deviceLabel}</div>
                <h2 class="tut-title">${step.title}</h2>
                <p class="tut-desc">${step.desc}</p>
                
                <div class="tut-visual-container">
                    <div class="tut-glow-bg"></div>
                    ${visual}
                </div>
            </div>
        `;
    },

    next() {
        if (this.currentStep < this.steps.length - 1) {
            this.currentStep++;
            const content = document.getElementById('tut-content');
            content.style.opacity = '0';
            content.style.transform = 'translateY(10px) scale(0.98)';
            
            setTimeout(() => {
                content.innerHTML = this.getSlideHTML();
                this.updateDots();
                content.style.opacity = '1';
                content.style.transform = 'translateY(0) scale(1)';
            }, 300);
        } else {
            this.close(true);
        }
    },

    updateDots() {
        const dots = document.querySelectorAll('.tut-dot');
        dots.forEach((dot, index) => {
            dot.classList.toggle('active', index === this.currentStep);
        });
        const btn = document.querySelector('.tut-btn-next');
        btn.innerHTML = this.currentStep === this.steps.length - 1 ? "Let's Go!" : "Next";
    },

    close(fireConfetti = false) {
        const overlay = document.getElementById('tut-overlay');
        if (overlay) {
            overlay.style.opacity = '0';
            overlay.style.backdropFilter = 'blur(0px)';
            setTimeout(() => overlay.remove(), 400);
        }
        localStorage.setItem('tutorialCompleted', 'true');

        if (fireConfetti && window.confetti) {
            window.confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: ['#ff9eb5', '#ffffff', '#ff85a2'] });
        }
    },

    injectStyles() {
        const style = document.createElement('style');
        style.id = 'tut-styles';
        style.textContent = `
           .tut-overlay {
                position: fixed; inset: 0; z-index: 99999;
                /* Slight transparency like other modals */
                background: rgba(0, 0, 0, 0.78); 
                display: flex; align-items: center; justify-content: center;
                opacity: 0; transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
                padding: 20px; box-sizing: border-box;
            }
            .tut-overlay.visible {
                opacity: 1; 
                background: rgba(0, 0, 0, 0.78);
            }
            .tut-modal {
                background: #ffffff;
                backdrop-filter: none;
                border: 2px solid rgba(255, 255, 255, 0.9);
                border-radius: 32px; width: 100%; max-width: 420px;
                box-shadow: 0 24px 50px rgba(0,0,0,0.1), inset 0 4px 10px rgba(255,255,255,0.9);
                display: flex; flex-direction: column; overflow: hidden;
                position: relative; transform: translateY(20px); transition: transform 0.4s;
            }
            .tut-overlay.visible .tut-modal { transform: translateY(0); }
            
            .tut-skip {
                position: absolute; top: 20px; right: 24px; z-index: 10;
                background: rgba(255,255,255,0.5); border: none; padding: 6px 12px;
                border-radius: 12px; font-weight: 700; color: var(--text-muted, #b4aab5);
                cursor: pointer; font-size: 0.85rem; transition: 0.2s;
            }
            .tut-skip:hover { background: #fff; color: var(--text-main, #887888); }

            .tut-content { padding: 40px 30px 20px 30px; transition: all 0.3s; text-align: center; }
            
            .tut-badge {
                display: inline-block; padding: 6px 14px; background: rgba(255, 158, 181, 0.15);
                color: var(--primary-dark, #ff85a2); font-weight: 800; font-size: 0.75rem;
                text-transform: uppercase; letter-spacing: 1px; border-radius: 20px; margin-bottom: 16px;
            }
            
            .tut-title { margin: 0 0 8px 0; font-size: 1.8rem; font-weight: 900; color: var(--text-main); line-height: 1.2; letter-spacing: -0.5px;}
            .tut-desc { margin: 0; font-size: 0.95rem; color: var(--text-muted); font-weight: 600; line-height: 1.5; }

            .tut-visual-container {
                position: relative; width: 100%; height: 220px; margin-top: 30px;
                display: flex; flex-direction: column; align-items: center; justify-content: center;
            }
            
            .tut-glow-bg {
                position: absolute; width: 180px; height: 180px;
                background: radial-gradient(circle, rgba(255,158,181,0.3) 0%, rgba(255,255,255,0) 70%);
                border-radius: 50%; z-index: -1; animation: tutPulse 3s infinite alternate;
            }

            /* Mobile Mockups */
            .tut-phone-mock {
                width: 110px; height: 160px; border: 4px solid var(--text-muted); border-radius: 16px;
                position: relative; background: #fff; box-shadow: 0 10px 20px rgba(0,0,0,0.05);
            }
            .tut-tap-zone { position: absolute; background: rgba(255,158,181,0.2); border-radius: 8px; }
            .tut-left { top: 10px; bottom: 10px; left: 10px; width: 30px; }
            .tut-right { top: 10px; bottom: 10px; right: 10px; width: 30px; }
            .tut-center { top: 30px; bottom: 30px; left: 20px; right: 20px; }
            
            .tut-hand { position: absolute; font-size: 32px; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.2)); z-index: 5; }
            
            .tut-card-mock {
                position: absolute; top: 20px; left: 15px; right: 15px; height: 110px;
                background: var(--primary, #ff9eb5); border-radius: 8px;
            }

            .tut-icon-grid { display: flex; gap: 20px; }
            .tut-icon-box {
                background: #fff; padding: 16px; border-radius: 16px;
                box-shadow: 0 8px 16px rgba(0,0,0,0.05); font-size: 0.8rem; font-weight: 700; color: var(--text-main);
            }

            /* Keyboard Mockups */
            .tut-keyboard { display: flex; gap: 12px; align-items: center; justify-content: center; }
            .tut-key {
                width: 50px; height: 50px; background: #fff; border: 2px solid var(--text-muted);
                border-bottom-width: 6px; border-radius: 12px; display: flex; align-items: center; justify-content: center;
                font-size: 1.2rem; font-weight: 800; color: var(--text-main); box-shadow: 0 4px 10px rgba(0,0,0,0.05);
            }
            .tut-key-wide { width: 140px; font-size: 1rem; }
            
            .tut-labels { display: flex; justify-content: space-between; width: 100%; margin-top: 20px; font-size: 0.85rem; font-weight: 800; color: var(--text-main); text-transform: uppercase; letter-spacing: 1px;}

            /* Footer */
            .tut-footer {
                padding: 20px 30px 30px; display: flex; flex-direction: column; align-items: center; gap: 20px;
            }
            .tut-dots { display: flex; gap: 8px; }
            .tut-dot { width: 8px; height: 8px; border-radius: 4px; background: rgba(0,0,0,0.1); transition: 0.3s; }
            .tut-dot.active { width: 24px; background: var(--primary, #ff9eb5); }
            
            .tut-btn-next {
                width: 100%; padding: 18px; border: none; border-radius: 20px;
                background: var(--primary, #ff9eb5); color: #fff; font-size: 1.1rem; font-weight: 800;
                letter-spacing: 0.5px; cursor: pointer; box-shadow: 0 8px 20px rgba(255,158,181,0.4);
                transition: transform 0.2s, box-shadow 0.2s;
            }
            .tut-btn-next:hover { transform: translateY(-2px); box-shadow: 0 12px 25px rgba(255,158,181,0.5); }

            /* Animations */
            @keyframes tutPulse { from { transform: scale(0.8); opacity: 0.5; } to { transform: scale(1.2); opacity: 1; } }
            @keyframes tapSides { 0%, 100% { transform: translate(60px, 60px) scale(1); } 20% { transform: translate(60px, 60px) scale(0.8); } 50% { transform: translate(-10px, 60px) scale(1); } 70% { transform: translate(-10px, 60px) scale(0.8); } }
            @keyframes tapCenter { 0%, 100% { transform: translate(30px, 60px) scale(1); } 50% { transform: translate(30px, 60px) scale(0.8); } }
            @keyframes keyPress { 0%, 100% { transform: translateY(0); border-bottom-width: 6px; background: #fff; color: var(--text-main); } 50% { transform: translateY(4px); border-bottom-width: 2px; background: var(--primary); color: #fff; border-color: var(--primary-dark); } }
            @keyframes swipeCard { 0%, 100% { transform: translateX(0) rotate(0); opacity: 1; } 40% { transform: translateX(-60px) rotate(-10deg); opacity: 0; } 41% { transform: translateX(60px) rotate(10deg); opacity: 0; } }
            @keyframes handSwipe { 0%, 100% { transform: translate(30px, 60px); opacity: 1; } 40% { transform: translate(-30px, 60px); opacity: 0; } 41% { transform: translate(90px, 60px); opacity: 0; } }

            .tut-anim-tap-sides { animation: tapSides 3s infinite; }
            .tut-anim-tap-center { animation: tapCenter 1.5s infinite; }
            .tut-anim-swipe { animation: swipeCard 3s infinite; }
            .tut-anim-hand-swipe { animation: handSwipe 3s infinite; }
            .tut-anim-press { animation: keyPress 2s infinite; }
            .tut-anim-press-delay { animation: keyPress 2s infinite 1s; }
        `;
        document.head.appendChild(style);
    }
};

window.Tutorial = Tutorial;
