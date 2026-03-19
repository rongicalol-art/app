/**
 * Keybinds.js
 * Press 'w' to toggle between Study and Writing modes using the existing navigation.
 */
(function() {
    'use strict';
    console.log('[Keybinds] Script loaded. Press "w" to toggle Writing mode.'); 

    document.addEventListener('keydown', function(e) {
        // Ignore if typing in an input box
        if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

        // Check for 'w' key
        if (e.key.toLowerCase() === 'w') {
            console.log('[Keybinds] "W" pressed'); 
            
            // Find the existing navigation buttons
            const writingBtn = document.querySelector('.nav-item[data-mode="writing"]');
            const studyBtn = document.querySelector('.nav-item[data-mode="study"]');

            if (writingBtn) {
                // Check if we are already in writing mode (button has 'active' class)
                if (writingBtn.classList.contains('active')) {
                    // If already in Writing mode, switch back to Study mode
                    if (studyBtn) {
                        console.log('[Keybinds] Switching back to Study.');
                        studyBtn.click();
                    }
                } else {
                    // If not in Writing mode, click the Writing button
                    console.log('[Keybinds] Switching to Writing.');
                    writingBtn.click();
                }
            } else {
                console.warn('[Keybinds] Writing navigation button not found.');
            }
        }
    });
})();
