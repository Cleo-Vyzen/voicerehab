// VoiceRehab — speaking, listening and understanding what the patient says.
// Uses the browser's built-in Web Speech API, so no API keys are needed.
(function () {
  const VR = (window.VR = window.VR || {});
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  function pickVoice() {
    if (!('speechSynthesis' in window)) return null;
    const voices = speechSynthesis.getVoices();
    return voices.find((v) => v.lang === 'en-IN') ||
      voices.find((v) => /^en/i.test(v.lang)) || null;
  }

  VR.voice = {
    supported: !!SR,
    micBlocked: false,
    rate: 0.95,
    _pending: null,

    // Say something out loud and show it on screen. Resolves when finished.
    speak(text) {
      VR.ui.say(text);
      return new Promise((resolve) => {
        if (!('speechSynthesis' in window)) { setTimeout(resolve, 600 + text.length * 40); return; }
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'en-IN';
        u.rate = this.rate;
        const v = pickVoice();
        if (v) u.voice = v;
        let done = false;
        const finish = () => { if (!done) { done = true; resolve(); } };
        u.onend = finish;
        u.onerror = finish;
        setTimeout(finish, 2000 + text.length * 90); // safety net if onend never fires
        speechSynthesis.speak(u);
      });
    },

    stopSpeaking() {
      if ('speechSynthesis' in window) speechSynthesis.cancel();
    },

    // Listen once. Resolves with {alts, source} or null if the patient said nothing.
    // Taps on fallback buttons and typed text also resolve it (see provide()).
    listen(timeoutMs) {
      return new Promise((resolve) => {
        let settled = false;
        let rec = null;
        let timer = null;
        const finish = (val) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          this._pending = null;
          VR.ui.setListening(false);
          if (rec) { try { rec.abort(); } catch (e) { /* ignore */ } }
          resolve(val);
        };
        this._pending = finish;
        VR.ui.setListening(true);

        if (!SR || this.micBlocked) return; // wait for tap or typed input

        rec = new SR();
        rec.lang = 'en-IN';
        rec.interimResults = false;
        rec.continuous = false;
        rec.maxAlternatives = 3;
        rec.onresult = (e) => {
          const r = e.results[0];
          const alts = [];
          for (let i = 0; i < r.length; i++) alts.push(clean(r[i].transcript));
          VR.ui.heard(r[0].transcript);
          finish({ alts, source: 'voice' });
        };
        rec.onerror = (e) => {
          if (e.error === 'no-speech') finish(null);
          else if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
            this.micBlocked = true;
            clearTimeout(timer);
            VR.ui.micBlocked();
          } else if (e.error !== 'aborted') finish({ alts: [], source: 'voice', error: e.error });
        };
        rec.onend = () => { if (!settled && !this.micBlocked) finish(null); };
        try { rec.start(); } catch (e) { /* already started */ }
        timer = setTimeout(() => finish(null), timeoutMs || 10000);
      });
    },

    // Called by fallback buttons or the type box.
    provide(text) {
      if (!this._pending) return false;
      VR.ui.heard(text);
      this._pending({ alts: [clean(text)], source: 'tap' });
      return true;
    },

    cancelListen() {
      if (this._pending) this._pending(null);
    },
  };

  function clean(s) {
    return String(s).toLowerCase().replace(/[.,!?;:]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // ---------- Understanding intent ----------
  // Phrases include common Indian English and Hinglish words patients mix in.
  const PHRASES = {
    emergency: ['severe pain', 'very bad pain', 'too much pain', 'unbearable', "can't move", 'cant move',
      'cannot move', 'i fell', 'fell down', 'i have fallen', 'emergency', 'bleeding', 'chest pain',
      'help me', 'bahut dard'],
    start: ['start my exercises', 'start exercise', 'start', 'begin', "let's go", 'lets go', 'exercise',
      'exercises', 'shuru'],
    ready: ['ready', "i'm ready", 'i am ready', 'yes', 'ok', 'okay', 'go', 'start', 'begin', 'haan', 'chalo'],
    repeat: ['repeat', 'again', 'say that again', 'one more time', 'pardon', 'what', 'phir se', 'dobara'],
    slower: ['slower', 'slow down', 'too fast', 'slowly', 'dheere'],
    faster: ['faster', 'speed up', 'quicker', 'too slow', 'jaldi'],
    skip: ['skip', 'next', 'move on', 'next one', 'aage'],
    stop: ['stop', 'end', 'finish', 'quit', 'exit', "that's enough", 'enough', 'bas', 'band karo'],
    call: ['call my physio', 'call physio', 'call the physio', 'call doctor', 'call the doctor',
      'call my doctor', 'talk to physio', 'call therapist', 'call my therapist'],
    yes: ['yes', 'yeah', 'yep', 'correct', 'right', "that's right", 'ok', 'okay', 'sure', 'haan', 'ha', 'ji'],
    no: ['no', 'nope', 'wrong', 'not right', 'incorrect', 'nahi', 'nahin'],
    continue: ['continue', 'resume', 'go on', 'carry on', 'ready', 'start', "i'm back", 'chalo'],
    remind: ['remind', 'reminder', 'alarm'],
  };

  function has(alt, phrase) {
    return (' ' + alt + ' ').indexOf(' ' + phrase + ' ') !== -1;
  }

  const NUM_WORDS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
    eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, twenty: 20, ek: 1, teen: 3, char: 4,
    paanch: 5, panch: 5, chhe: 6, che: 6, saat: 7, aath: 8, nau: 9, das: 10 };

  VR.intents = {
    isEmergency(alts) {
      return alts.some((a) => PHRASES.emergency.some((p) => has(a, p)));
    },

    // Returns the first allowed intent found in any recognition alternative.
    match(alts, allowed) {
      for (const alt of alts) {
        for (const intent of allowed) {
          if ((PHRASES[intent] || []).some((p) => has(alt, p))) return intent;
        }
      }
      return null;
    },

    // Pain score 0–10 from words, digits or ranges. "5 or 6" -> 6 (the higher, to be safe).
    parsePain(alts) {
      for (const raw of alts) {
        const alt = raw.replace(/out of (10|ten)|by (10|ten)|\/\s*10/g, ' ');
        if (/\b(no pain|nothing|none|zero)\b/.test(alt)) return 0;
        const nums = [];
        (alt.match(/\d+(\.\d+)?/g) || []).forEach((n) => nums.push(parseFloat(n)));
        alt.split(' ').forEach((w) => { if (w in NUM_WORDS) nums.push(NUM_WORDS[w]); });
        if (!nums.length) continue;
        const v = Math.round(Math.max.apply(null, nums));
        if (v > 10) return { invalid: true, value: v };
        return v;
      }
      return null;
    },

    // "remind me at 7 in the morning" -> "7:00 AM"
    parseTime(alts) {
      for (const alt of alts) {
        const m = alt.match(/(\d{1,2})(?:[: ](\d{2}))?\s*(am|pm|a m|p m)?/) ||
          alt.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/);
        if (!m) continue;
        let h = isNaN(parseInt(m[1], 10)) ? NUM_WORDS[m[1]] : parseInt(m[1], 10);
        const min = m[2] || '00';
        if (h < 1 || h > 23) continue;
        let pm = /pm|p m|evening|night|afternoon/.test(alt);
        if (h > 12) { h -= 12; pm = true; }
        return h + ':' + min + (pm ? ' PM' : ' AM');
      }
      return null;
    },
  };
})();
