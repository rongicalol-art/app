let currentAudio = null;

export async function playAudio(text, options = {}) {
  const normalizedText = String(text || '').trim();

  if (!normalizedText) return null;

  const endpoint = options.endpoint || '/api/tts';
  const params = new URLSearchParams({ text: normalizedText });

  if (!currentAudio) {
    currentAudio = new Audio();
    currentAudio.preload = 'auto';
    currentAudio.crossOrigin = 'anonymous';
  }

  currentAudio.pause();
  currentAudio.currentTime = 0;
  currentAudio.src = `${endpoint}?${params.toString()}`;

  await currentAudio.play();
  return currentAudio;
}

export function stopAudio() {
  if (!currentAudio) return;

  currentAudio.pause();
  currentAudio.currentTime = 0;
  currentAudio.removeAttribute('src');
  currentAudio.load();
}
