window.DialogueAudioEngine = {
  warmedVoices: new Set(),

  async waitForVoices(timeoutMs = 1600) {
    if (!window.speechSynthesis) return [];

    let voices = window.speechSynthesis.getVoices().filter(Boolean);
    if (voices.length) return voices;

    await new Promise(resolve => {
      let settled = false;
      const previousHandler = window.speechSynthesis.onvoiceschanged;

      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timerId);
        if (typeof window.speechSynthesis.removeEventListener === 'function') {
          window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
        } else if (window.speechSynthesis.onvoiceschanged === handleVoicesChanged) {
          window.speechSynthesis.onvoiceschanged = previousHandler || null;
        }
        resolve();
      };

      const handleVoicesChanged = () => {
        voices = window.speechSynthesis.getVoices().filter(Boolean);
        if (voices.length) finish();
      };

      const timerId = window.setTimeout(finish, timeoutMs);

      if (typeof window.speechSynthesis.addEventListener === 'function') {
        window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged, { once: true });
      } else {
        window.speechSynthesis.onvoiceschanged = () => {
          if (typeof previousHandler === 'function') previousHandler();
          handleVoicesChanged();
        };
      }

      try {
        window.speechSynthesis.getVoices();
      } catch (e) {
        finish();
      }
    });

    return window.speechSynthesis.getVoices().filter(Boolean);
  },

  buildPreparationKey(app, timeline) {
    return JSON.stringify({
      sessionKey: app._dialoguePlayerRuntime.sessionKey,
      sessionId: app._dialoguePlayerRuntime.sessionId,
      lineCount: timeline.length,
      contentType: app.state.dialoguePlayerContentType,
      voiceMode: app.state.dialoguePlayerVoiceMode,
      pacing: app.state.dialoguePlayerPacing,
      speed: typeof app.getDialoguePlayerSpeed === 'function' ? app.getDialoguePlayerSpeed() : 1,
      ttsVoiceZh: app.state.ttsVoiceZh || '',
      ttsVoiceEn: app.state.ttsVoiceEn || ''
    });
  },

  buildPlan(app, timeline) {
    const segments = timeline
      .map(segment => {
        const line = app.parseDialoguePlayerLine(segment.text);
        const lang = app.getDialoguePlayerSpeechLang(line.speechText);
        const voice = app.getDialoguePlayerSpeakerVoice(line.speaker, lang);
        const speechText = app.formatDialoguePlayerSpeechText(line.speechText, lang);

        return {
          ...segment,
          line,
          lang,
          voice,
          speechText
        };
      })
      .filter(segment => segment.speechText);

    const warmups = [];
    const seen = new Set();

    segments.forEach(segment => {
      const voiceName = segment.voice?.name || 'default';
      const key = `${segment.lang || 'und'}::${voiceName}`;
      if (seen.has(key)) return;
      seen.add(key);
      warmups.push({
        key,
        lang: segment.lang || segment.voice?.lang || 'zh-TW',
        voice: segment.voice || null
      });
    });

    return {
      key: this.buildPreparationKey(app, timeline),
      segments,
      warmups
    };
  },

  async warmVoice(warmup) {
    if (!window.speechSynthesis) return;

    const primer = String(warmup.lang || '').toLowerCase().startsWith('zh') ? '好。' : 'Ready.';

    await new Promise(resolve => {
      const utterance = new SpeechSynthesisUtterance(primer);
      let settled = false;

      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        window._tts_utterances = (window._tts_utterances || []).filter(entry => entry !== utterance);
        resolve();
      };

      const timeoutId = window.setTimeout(() => {
        try {
          window.speechSynthesis.cancel();
        } catch (e) {}
        finish();
      }, 2200);

      utterance.lang = warmup.lang || warmup.voice?.lang || 'zh-TW';
      utterance.rate = 1;
      utterance.volume = 0.01;
      if (warmup.voice) utterance.voice = warmup.voice;
      utterance.onend = finish;
      utterance.onerror = finish;

      window._tts_utterances = window._tts_utterances || [];
      window._tts_utterances.push(utterance);

      try {
        window.speechSynthesis.speak(utterance);
      } catch (e) {
        finish();
      }
    });
  },

  async prepare(app, options = {}) {
    const runtime = app._dialoguePlayerRuntime;
    const timeline = app.ensureDialoguePlayerSession(options.forceNewSession === true);
    const wantsWarmup = options.warm !== false;
    const silent = options.silent === true;
    const env = (window.App && typeof App.getDialoguePlayerSpeechEnvironment === 'function')
      ? App.getDialoguePlayerSpeechEnvironment()
      : { isMobile: false, isIOS: false, isAndroid: false, isWebKitShell: false };
    const shouldWarmVoices = wantsWarmup && !(env.isMobile || env.isWebKitShell);
    const prepTimeoutMs = env.isMobile ? 2500 : 5000;

    if (!timeline.length || !window.speechSynthesis) {
      if (!silent) {
        app.updateDialoguePlayerPreparationState({
          isPreparing: false,
          progress: 0,
          label: ''
        });
      }
      return timeline.length > 0;
    }

    const initialPlan = this.buildPlan(app, timeline);
    const alreadyWarm = initialPlan.warmups.every(warmup => this.warmedVoices.has(warmup.key));
    if (!options.force && runtime.preparedKey === initialPlan.key && runtime.preparedPlan && (!shouldWarmVoices || alreadyWarm)) {
      if (!silent) {
        app.updateDialoguePlayerPreparationState({
          isPreparing: false,
          progress: 1,
          label: 'Ready'
        });
      }
      return true;
    }

    if (!options.force && runtime.preparePromise && runtime.prepareKey === initialPlan.key) {
      return runtime.preparePromise;
    }

    const prepareToken = ++runtime.prepareToken;
    runtime.prepareKey = initialPlan.key;

    if (!shouldWarmVoices) {
      runtime.preparedKey = initialPlan.key;
      runtime.preparedPlan = initialPlan;
      if (!silent) {
        app.updateDialoguePlayerPreparationState({
          isPreparing: false,
          progress: 1,
          label: 'Ready'
        });
      }
      return true;
    }

    if (!silent) {
      app.updateDialoguePlayerPreparationState({
        isPreparing: true,
        progress: 0.08,
        label: 'Checking voices...'
      });
    }

    runtime.preparePromise = (async () => {
      const timeoutPromise = new Promise(resolve => {
        window.setTimeout(() => resolve(false), prepTimeoutMs);
      });

      const workPromise = (async () => {
        await this.waitForVoices(Math.min(1600, prepTimeoutMs));
        if (prepareToken !== runtime.prepareToken) return false;

        const plan = this.buildPlan(app, timeline);
        runtime.preparedKey = plan.key;
        runtime.preparedPlan = plan;

        if (!silent) {
          app.updateDialoguePlayerPreparationState({
            isPreparing: shouldWarmVoices && plan.warmups.length > 0,
            progress: shouldWarmVoices && plan.warmups.length > 0 ? 0.18 : 0.92,
            label: shouldWarmVoices && plan.warmups.length > 0 ? 'Warming voices...' : 'Readying queue...'
          });
        }

        if (shouldWarmVoices && plan.warmups.length) {
          const total = plan.warmups.length;
          let completed = 0;

          for (const warmup of plan.warmups) {
            if (prepareToken !== runtime.prepareToken) return false;

            if (!this.warmedVoices.has(warmup.key)) {
              await this.warmVoice(warmup);
              if (prepareToken !== runtime.prepareToken) return false;
              this.warmedVoices.add(warmup.key);
            }

            completed += 1;

            if (!silent) {
              const progress = 0.18 + (completed / total) * 0.74;
              app.updateDialoguePlayerPreparationState({
                isPreparing: true,
                progress,
                label: `Preparing audio... ${Math.round(progress * 100)}%`
              });
            }
          }
        }

        if (prepareToken !== runtime.prepareToken) return false;

        if (!silent) {
          app.updateDialoguePlayerPreparationState({
            isPreparing: false,
            progress: 1,
            label: 'Ready'
          });
        }

        return true;
      })();

      const result = await Promise.race([workPromise, timeoutPromise]);
      if (result === false && prepareToken === runtime.prepareToken && !silent) {
        app.updateDialoguePlayerPreparationState({
          isPreparing: false,
          progress: 1,
          label: 'Ready'
        });
      }
      return result !== false;
    })().catch(() => {
      if (!silent && prepareToken === runtime.prepareToken) {
        app.updateDialoguePlayerPreparationState({
          isPreparing: false,
          progress: 0,
          label: ''
        });
      }
      return false;
    }).finally(() => {
      if (prepareToken === runtime.prepareToken) {
        runtime.preparePromise = null;
      }
    });

    return runtime.preparePromise;
  },

  cancel(app, options = {}) {
    const runtime = app._dialoguePlayerRuntime;
    runtime.prepareToken += 1;
    runtime.preparePromise = null;

    if (options.keepPrepared !== true) {
      runtime.preparedKey = '';
      runtime.preparedPlan = null;
      runtime.prepareKey = '';
    }

    app.updateDialoguePlayerPreparationState({
      isPreparing: false,
      progress: 0,
      label: ''
    }, {
      updateUI: options.updateUI !== false
    });

    try {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    } catch (e) {}
  }
};
