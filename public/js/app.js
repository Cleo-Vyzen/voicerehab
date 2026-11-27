// VoiceRehab — patient app: the voice-guided exercise session.
(function () {
  const VR = (window.VR = window.VR || {});
  const $ = (id) => document.getElementById(id);
  const ABORT = new Error('aborted');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const S = {
    patient: null, plan: [], results: [], paceMs: 1800,
    running: false, aborted: false, emergency: false, callback: false,
  };

  // ---------- Screen helpers ----------
  VR.ui = {
    say(text) { $('botSays').textContent = text; },
    heard(text) { $('youSaid').textContent = text ? 'You said: "' + text + '"' : ''; },
    setListening(on) { $('listening').hidden = !on; $('micBtn').classList.toggle('live', on); },
    micBlocked() {
      banner('Microphone is blocked. Allow mic access in your browser, or use the buttons and type box below.', 'warn');
      VR.ui.setOptions(VR.ui._lastOptions || [], true);
    },
    _lastOptions: [],
    setOptions(options, visible) {
      VR.ui._lastOptions = options;
      const box = $('options');
      box.innerHTML = '';
      if (!visible || !options.length) return;
      options.forEach((label) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'opt';
        b.textContent = label;
        b.onclick = () => VR.voice.provide(label);
        box.appendChild(b);
      });
    },
  };

  function banner(text, kind) {
    const b = $('banner');
    b.textContent = text;
    b.className = 'banner ' + (kind || 'info');
    b.hidden = false;
  }

  function show(screen) {
    ['home', 'session', 'summary'].forEach((s) => { $(s).hidden = s !== screen; });
    $('stopBtn').hidden = screen !== 'session';
  }

  const say = (t) => VR.voice.speak(t);
  const fallbackNeeded = () => !VR.voice.supported || VR.voice.micBlocked;

  // ---------- Core: ask a question and get a valid answer ----------
  // Handles silence, unclear speech, emergencies and the tap fallback.
  async function ask(prompt, opts) {
    let fails = 0;
    let silences = 0;
    await say(prompt);
    for (;;) {
      if (S.aborted) throw ABORT;
      VR.ui.setOptions(opts.options || [], fails >= 2 || fallbackNeeded());
      const r = await VR.voice.listen(10000);
      if (S.aborted) throw ABORT;

      if (r === null) { // silence
        silences++;
        if (silences === 1) { await say('Are you still there? ' + (opts.short || prompt)); continue; }
        if (silences === 2) continue; // wait quietly a little longer (about 30 seconds in total)
        await pauseUntilContinue();
        silences = 0;
        await say(prompt);
        continue;
      }
      silences = 0;

      if (VR.intents.isEmergency(r.alts)) { await emergency(r.alts[0]); throw ABORT; }

      const val = opts.parse ? opts.parse(r.alts) : VR.intents.match(r.alts, opts.allowed);
      if (val !== null && !(val && val.invalid)) { VR.ui.setOptions([], false); return val; }

      fails++;
      if (val && val.invalid) await say(val.value + ' is more than 10. Please say a number from 0 to 10.');
      else if (fails >= 2) await say("Sorry, I didn't catch that. You can say it again, or tap a button.");
      else await say("Sorry, I didn't catch that. Please say it again.");
    }
  }

  async function pauseUntilContinue() {
    await say("I'll pause here. Say continue when you're ready.");
    $('exState').textContent = 'Paused';
    for (;;) {
      VR.ui.setOptions(['Continue', 'Stop'], true);
      const r = await VR.voice.listen(60000);
      if (S.aborted) throw ABORT;
      if (!r) continue;
      if (VR.intents.isEmergency(r.alts)) { await emergency(r.alts[0]); throw ABORT; }
      const it = VR.intents.match(r.alts, ['stop', 'continue']);
      if (it === 'stop') { S.aborted = true; throw ABORT; }
      if (it === 'continue') { $('exState').textContent = ''; VR.ui.setOptions([], false); return; }
    }
  }

  async function emergency(heard) {
    S.aborted = true;
    S.emergency = true;
    VR.store.addFlag({ type: 'emergency', patientId: S.patient.id, text: heard, at: new Date().toISOString() });
    banner('Physiotherapist alerted. Please stop and rest.', 'danger');
    await VR.voice.speak("Please stop and rest. I'm alerting your physiotherapist now.");
  }

  async function callPhysio() {
    S.callback = true;
    VR.store.addFlag({ type: 'callback', patientId: S.patient.id, at: new Date().toISOString() });
    banner('Call-back requested. Your physiotherapist will call you soon.', 'info');
    await say("I've asked your physiotherapist to call you back." + (S.running ? " Let's carry on." : ''));
  }

  // ---------- One exercise ----------
  async function doExercise(ex, i, n) {
    $('exCount').textContent = 'Exercise ' + (i + 1) + ' of ' + n;
    $('exName').textContent = ex.name;
    $('exInstr').textContent = ex.instruction;
    $('rep').textContent = '0';
    $('repOf').textContent = 'of ' + ex.reps;
    $('repBar').style.width = '0%';
    $('overall').style.width = Math.round((i / n) * 100) + '%';

    const intro = 'Exercise ' + (i + 1) + ': ' + ex.name + ', ' + ex.reps + ' times. ' +
      ex.instruction + " Say ready when you're ready.";

    for (;;) {
      const it = await ask(intro, {
        allowed: ['ready', 'repeat', 'slower', 'faster', 'skip', 'stop', 'call'],
        options: ['Ready', 'Repeat', 'Skip', 'Stop'],
        short: "Say ready when you're ready.",
      });
      if (it === 'repeat') continue;
      if (it === 'slower') { S.paceMs = 3200; await say("Okay, I'll count slower."); continue; }
      if (it === 'faster') { S.paceMs = 1200; await say("Okay, I'll count a little faster."); continue; }
      if (it === 'call') { await callPhysio(); continue; }
      if (it === 'stop') return { stop: true };
      if (it === 'skip') { await say('Okay, skipping ' + ex.name + '.'); return { id: ex.id, status: 'skipped' }; }
      break; // ready
    }

    // Count reps aloud
    await say("Let's start.");
    for (let k = 1; k <= ex.reps; k++) {
      if (S.aborted) throw ABORT;
      $('rep').textContent = String(k);
      $('repBar').style.width = Math.round((k / ex.reps) * 100) + '%';
      await say(String(k));
      await sleep(S.paceMs);
    }

    // Pain score, confirmed back
    let pain;
    for (;;) {
      pain = await ask('Well done. How much pain did you feel, from 0 to 10?', {
        parse: VR.intents.parsePain,
        options: ['0', '2', '4', '6', '8', '10'],
        short: 'How much pain, from 0 to 10?',
      });
      const ok = await ask('Pain ' + pain + '. Is that right?', {
        allowed: ['yes', 'no'], options: ['Yes', 'No'], short: 'Pain ' + pain + '. Yes or no?',
      });
      if (ok === 'yes') break;
      await say("Okay, let's try again.");
    }
    if (pain >= 7) await say("Pain " + pain + " is high. I'll let your physiotherapist know. Please go gently.");
    else await say('Pain ' + pain + ', saved.');
    return { id: ex.id, status: 'done', reps: ex.reps, pain };
  }

  // ---------- Full session ----------
  async function runSession() {
    if (S.running) return;
    S.running = true;
    S.aborted = false;
    S.emergency = false;
    S.callback = false;
    S.results = [];
    S.paceMs = 1800;
    show('session');
    const n = S.plan.length;
    try {
      await say('Hello ' + S.patient.first + '. Today you have ' + n + " exercises. Let's begin.");
      for (let i = 0; i < n; i++) {
        const r = await doExercise(S.plan[i], i, n);
        if (r.stop) break;
        S.results.push(r);
      }
    } catch (e) {
      if (e !== ABORT) console.error(e);
    }
    finishSession();
  }

  function finishSession() {
    S.running = false;
    VR.voice.cancelListen();
    VR.ui.setOptions([], false);
    const done = S.results.filter((r) => r.status === 'done');
    const pains = done.map((r) => r.pain);
    const session = {
      patientId: S.patient.id, date: VR.dayKey(0), completed: done.length, total: S.plan.length,
      pains, maxPain: pains.length ? Math.max.apply(null, pains) : null,
      emergency: S.emergency, at: new Date().toISOString(),
    };
    if (done.length || S.emergency) VR.store.addSession(session);
    renderSummary(session);
    show('summary');
    $('overall').style.width = '100%';
    if (!S.emergency) {
      const msg = done.length === S.plan.length
        ? 'Great work today. You completed all ' + done.length + " exercises. I'll send this to your physiotherapist."
        : 'You completed ' + done.length + ' of ' + S.plan.length + " exercises. I'll share this with your physiotherapist.";
      say(msg);
    }
  }

  function renderSummary(s) {
    $('sumTitle').textContent = s.emergency ? 'Session stopped for your safety' :
      (s.completed === s.total ? 'All done for today!' : 'Session saved');
    const rows = S.plan.map((ex) => {
      const r = S.results.find((x) => x.id === ex.id);
      const status = !r ? 'Not done' : r.status === 'skipped' ? 'Skipped' : r.reps + ' reps · pain ' + r.pain + '/10';
      return '<li><span>' + ex.name + '</span><b>' + status + '</b></li>';
    });
    $('sumList').innerHTML = rows.join('');
    $('sumNote').textContent = 'Sent to your physiotherapist' + (S.callback ? ' · call-back requested' : '') + '.';
  }

  // ---------- Home screen commands ----------
  async function homeCommand(alts) {
    if (VR.intents.isEmergency(alts)) {
      S.aborted = false;
      try { await emergency(alts[0]); } catch (e) { /* ignore */ }
      return;
    }
    const it = VR.intents.match(alts, ['remind', 'call', 'start']);
    if (it === 'start') return runSession();
    if (it === 'call') { S.aborted = false; return callPhysio(); }
    if (it === 'remind') {
      let t = VR.intents.parseTime(alts);
      if (!t) {
        await say('What time should I remind you every day?');
        const r = await VR.voice.listen(10000);
        t = r && VR.intents.parseTime(r.alts);
      }
      if (!t) return say("Sorry, I didn't get the time. Try saying: remind me at 7 in the morning.");
      VR.store.setReminder(S.patient.id, t);
      renderHome();
      return say("Okay. I'll remind you every day at " + t + '.');
    }
    return say('You can say: start my exercises, remind me at 7 in the morning, or call my physio.');
  }

  async function onMic() {
    if (S.running) return;
    if (VR.voice._pending) { VR.voice.cancelListen(); return; }
    await say('Hello ' + S.patient.first + '. What would you like to do?');
    VR.ui.setOptions(['Start my exercises', 'Remind me at 7 AM', 'Call my physio'], fallbackNeeded());
    const r = await VR.voice.listen(10000);
    VR.ui.setOptions([], false);
    if (!r) return say('Tap the microphone whenever you want to start.');
    homeCommand(r.alts);
  }

  function renderHome() {
    $('pname').textContent = S.patient.first;
    $('pcond').textContent = S.patient.condition;
    $('planList').innerHTML = S.plan.map((e) => '<li>' + e.name + ' <span>× ' + e.reps + '</span></li>').join('');
    const rem = VR.store.reminder(S.patient.id);
    $('reminderInfo').textContent = rem ? 'Daily reminder: ' + rem : 'No reminder set';
  }

  function loadPatient(id) {
    S.patient = VR.patientById(id);
    S.plan = VR.planFor(S.patient);
    VR.store.setCurrent(S.patient.id);
    renderHome();
  }

  // Simple in-app reminder while the page is open.
  function checkReminder() {
    const rem = VR.store.reminder(S.patient.id);
    if (!rem || S.running) return;
    const now = new Date();
    let h = now.getHours();
    const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    const cur = h + ':' + String(now.getMinutes()).padStart(2, '0') + ' ' + ap;
    if (cur === rem && checkReminder.last !== cur) {
      checkReminder.last = cur;
      banner('Time for your exercises! Tap the microphone and say "start my exercises".', 'info');
      say('Hello ' + S.patient.first + ', it is time for your exercises.');
    }
  }

  // ---------- Wire up ----------
  document.addEventListener('DOMContentLoaded', () => {
    const sel = $('patientSel');
    sel.innerHTML = VR.PATIENTS.map((p) => '<option value="' + p.id + '">' + p.name + '</option>').join('');
    sel.value = VR.store.current();
    sel.onchange = () => loadPatient(sel.value);
    loadPatient(sel.value);

    $('micBtn').onclick = onMic;
    $('againBtn').onclick = () => { show('home'); $('banner').hidden = true; };
    $('stopBtn').onclick = () => {
      S.aborted = true;
      VR.voice.stopSpeaking();
      VR.voice.cancelListen();
    };
    $('typeForm').onsubmit = (e) => {
      e.preventDefault();
      const input = $('typeInput');
      const text = input.value.trim();
      input.value = '';
      if (!text) return;
      if (!VR.voice.provide(text) && !S.running) { VR.ui.heard(text); homeCommand([text.toLowerCase()]); }
    };

    if (!VR.voice.supported) {
      banner('Voice input works best in Google Chrome. You can still use the buttons and type box.', 'warn');
    }
    if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => {};
    show('home');
    VR.ui.say('Tap the microphone and say "Start my exercises".');
    setInterval(checkReminder, 20000);
  });
})();
