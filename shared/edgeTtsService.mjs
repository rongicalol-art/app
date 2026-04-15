import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

export const TTS_VOICE = 'zh-TW-HsiaoChenNeural';
export const TTS_LOCALE = 'zh-TW';
export const TTS_CONTENT_TYPE = 'audio/mpeg';

const MAX_TEXT_LENGTH = 500;
const OUTPUT_FORMAT_MP3 = OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3;
const XML_ESCAPE_MAP = {
  '&': '&',
  '<': '<',
  '>': '>',
  '"': '"'
};

function escapeXml(value) {
  return value.replace(/[&<>"]/g, character => XML_ESCAPE_MAP[character] || character);
}

export function normalizeIncomingText(value) {
  if (typeof value !== 'string') return '';
  return value.normalize('NFC').trim().replace(/\s+/g, ' ');
}

export function assertValidText(text) {
  if (!text) {
    const error = new Error('Missing text query parameter.');
    error.statusCode = 400;
    throw error;
  }

  if (text.length > MAX_TEXT_LENGTH) {
    const error = new Error(`Text must be ${MAX_TEXT_LENGTH} characters or fewer.`);
    error.statusCode = 400;
    throw error;
  }
}

export async function createSpeechStream(text) {
  const normalizedText = normalizeIncomingText(text);
  assertValidText(normalizedText);

  const tts = new MsEdgeTTS();
  await tts.setMetadata(TTS_VOICE, OUTPUT_FORMAT_MP3, {
    voiceLocale: TTS_LOCALE
  });

  const { audioStream } = await tts.toStream(escapeXml(normalizedText), {
    rate: 0.96
  });

  return {
    audioStream,
    close() {
      try {
        tts.close();
      } catch (error) {}
    }
  };
}
