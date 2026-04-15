import express from 'express';
import {
  createSpeechStream,
  TTS_CONTENT_TYPE,
  TTS_LOCALE,
  TTS_VOICE
} from './shared/edgeTtsService.mjs';

const app = express();
const port = Number(process.env.PORT || 3001);

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }

  next();
});

app.get('/api/tts', async (req, res) => {
  let cleanup = () => {};

  try {
    const { audioStream, close } = await createSpeechStream(req.query.text);
    let closed = false;

    cleanup = () => {
      if (closed) return;
      closed = true;
      close();
    };

    res.status(200);
    res.setHeader('Content-Type', TTS_CONTENT_TYPE);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Disposition', 'inline; filename="tts.mp3"');
    res.setHeader('X-TTS-Locale', TTS_LOCALE);
    res.setHeader('X-TTS-Voice', TTS_VOICE);

    audioStream.on('end', cleanup);
    audioStream.on('close', cleanup);
    audioStream.on('error', error => {
      cleanup();

      if (res.headersSent) {
        res.destroy(error);
        return;
      }

      res.status(500).json({ error: 'TTS streaming failed.' });
    });

    res.on('close', cleanup);
    audioStream.pipe(res);
  } catch (error) {
    cleanup();
    res.status(error.statusCode || 500).json({
      error: error.message || 'TTS request failed.'
    });
  }
});

app.listen(port, () => {
  console.log(`High-quality TTS server listening on http://localhost:${port}`);
});
