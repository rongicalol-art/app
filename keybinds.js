/**
 * Keybinds.js - Reader Mode Safe
 * Press 'w' to toggle between Study and Writing modes.
 * Uses safe DOM access to prevent crashes in Reader Mode.
 */
(function() {
    'use strict';
    console.log('[Keybinds] Script loaded. Press "w" to toggle Writing mode.');

    // Safe DOM helpers
    const getEl = (selector) => {
        try { return document?.querySelector?.(selector) ?? null; } catch { return null; }
    };

    document?.addEventListener?.('keydown', function(e) {
        // Ignore if typing in an input box
        const activeTag = document.activeElement?.tagName;
        if (['INPUT', 'TEXTAREA'].includes(activeTag)) return;

        // Check for 'w' key
        if (e.key?.toLowerCase?.() === 'w') {
            console.log('[Keybinds] "W" pressed');
            
            // Find buttons safely
            const writingBtn = getEl('.nav-item[data-mode="writing"]');
            const studyBtn = getEl('.nav-item[data-mode="study"]');

            if (writingBtn) {
                if (writingBtn?.classList?.contains?.('active')) {
                    if (studyBtn) {
                        console.log('[Keybinds] Switching back to Study.');
                        studyBtn?.click?.();
                    }
                } else {
                    console.log('[Keybinds] Switching to Writing.');
                    writingBtn?.click?.();
                }
            } else {
                console.warn('[Keybinds] Writing navigation button not found.');
            }
        }
    });
})();
