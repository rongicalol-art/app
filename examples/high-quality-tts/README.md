# High-Quality zh-TW TTS Example

This example uses the unofficial `msedge-tts` Node wrapper on the server side and locks the voice to `zh-TW-HsiaoChenNeural`.

Why the backend exists:

- The current browser app in this repo uses `speechSynthesis`, which depends on whatever local voices the device exposes.
- The `msedge-tts` project notes that, as of December 2025, the Edge Read Aloud API requires an Edge-like user agent in browsers and still works in server-side runtimes.
- Using a backend route lets your React frontend request better audio without exposing any browser-only voice limitations.

## Install

Copy these files into a small Node backend folder or into your existing server project, then install:

```bash
npm install express msedge-tts
```

## Express.js route

From that backend folder, run the sample server:

```bash
node express-server.mjs
```

It exposes:

```text
GET /api/tts?text=你好，歡迎來到台灣華語學習。
```

If your React app runs on another origin during development, set:

```bash
CORS_ORIGIN=http://localhost:5173
```

## Vercel / Next.js serverless route

Copy [api/tts.js](/Users/macbookair/Desktop/app-main/app/examples/high-quality-tts/api/tts.js) into `pages/api/tts.js` in your Vercel project.

Also copy [shared/edgeTtsService.mjs](/Users/macbookair/Desktop/app-main/app/examples/high-quality-tts/shared/edgeTtsService.mjs) somewhere importable, then update the relative import inside `pages/api/tts.js`.

This example assumes a Node runtime, not an Edge runtime.

## Frontend `playAudio(text)`

Use [client/playAudio.js](/Users/macbookair/Desktop/app-main/app/examples/high-quality-tts/client/playAudio.js) from your React app:

```jsx
import { playAudio } from './client/playAudio';

export function ListenButton() {
  return (
    <button onClick={() => playAudio('請慢慢說一次。', { endpoint: 'http://localhost:3001/api/tts' })}>
      Play zh-TW audio
    </button>
  );
}
```

If your frontend and backend are on the same origin in production, you can leave `endpoint` as `/api/tts`.

## Notes

- `playAudio(text)` uses a GET URL on purpose so the browser can stream directly from the audio endpoint.
- The backend normalizes whitespace, limits text length, and XML-escapes the text before sending it to TTS.
- The voice is pinned to Traditional Chinese for Taiwan: `zh-TW-HsiaoChenNeural`.
- If you want the officially supported version instead of the unofficial Edge wrapper, Azure Speech free tier also exposes the same `zh-TW-HsiaoChenNeural` voice.
