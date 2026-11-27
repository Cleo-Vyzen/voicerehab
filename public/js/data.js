// VoiceRehab — sample patients, exercise library and local storage.
(function () {
  const VR = (window.VR = window.VR || {});

  // Exercise library. A physiotherapist assigns a plan from these.
  const EX = {
    kneeBend: { id: 'kneeBend', name: 'Seated knee bends', reps: 10,
      instruction: 'Sit on a chair. Slowly straighten your leg, hold for a moment, then lower it.' },
    slr: { id: 'slr', name: 'Straight leg raise', reps: 10,
      instruction: 'Lie on your back. Keep one leg straight and lift it to the height of the other knee, then lower it slowly.' },
    ankle: { id: 'ankle', name: 'Ankle pumps', reps: 15,
      instruction: 'Point your toes away from you, then pull them back towards you.' },
    pelvicTilt: { id: 'pelvicTilt', name: 'Pelvic tilts', reps: 10,
      instruction: 'Lie on your back with knees bent. Gently flatten your lower back into the floor, then relax.' },
    bridge: { id: 'bridge', name: 'Bridges', reps: 8,
      instruction: 'Lie on your back with knees bent. Lift your hips off the floor, hold for two seconds, then lower.' },
    kneeToChest: { id: 'kneeToChest', name: 'Knee to chest', reps: 8,
      instruction: 'Lie on your back. Hug one knee gently towards your chest, then lower it.' },
    pendulum: { id: 'pendulum', name: 'Shoulder pendulum', reps: 10,
      instruction: 'Lean forward with one hand on a table. Let the other arm hang and swing it in small circles.' },
    wallSlide: { id: 'wallSlide', name: 'Wall finger walk', reps: 8,
      instruction: 'Face a wall. Walk your fingers up the wall as high as is comfortable, then walk them down.' },
    shoulderRoll: { id: 'shoulderRoll', name: 'Shoulder rolls', reps: 10,
      instruction: 'Sit tall. Roll both shoulders up, back and down in a slow circle.' },
  };

  VR.PATIENTS = [
    { id: 'p1', name: 'Lakshmi Rao', first: 'Lakshmi', age: 64, condition: 'Knee replacement, week 3',
      plan: ['kneeBend', 'slr', 'ankle'] },
    { id: 'p2', name: 'Ramesh Kumar', first: 'Ramesh', age: 58, condition: 'Lower back pain',
      plan: ['pelvicTilt', 'bridge', 'kneeToChest'] },
    { id: 'p3', name: 'Fatima Sheikh', first: 'Fatima', age: 71, condition: 'Frozen shoulder',
      plan: ['pendulum', 'wallSlide', 'shoulderRoll'] },
  ];

  VR.patientById = (id) => VR.PATIENTS.find((p) => p.id === id) || VR.PATIENTS[0];
  VR.planFor = (p) => p.plan.map((id) => EX[id]);

  // Local date key, e.g. 2026-11-27
  VR.dayKey = function (offset) {
    const d = new Date();
    d.setDate(d.getDate() - (offset || 0));
    return d.toLocaleDateString('en-CA');
  };

  // Demo history for the last 13 days. null = missed day.
  // Lakshmi improves, Ramesh's pain is rising, Fatima often misses sessions.
  const HISTORY = {
    p1: [6, 6, 5, null, 5, 5, 4, 4, null, 4, 3, 3, 3],
    p2: [3, 3, 4, null, null, 4, 3, null, 4, 5, null, 6, 7],
    p3: [5, null, 5, null, null, 4, null, null, 5, null, null, 4, null],
  };

  function seed() {
    const sessions = [];
    Object.keys(HISTORY).forEach((pid) => {
      const total = VR.patientById(pid).plan.length;
      HISTORY[pid].forEach((pain, i) => {
        if (pain === null) return;
        const partial = pid === 'p3' && i % 3 === 0;
        const completed = partial ? total - 1 : total;
        const pains = [pain, Math.max(0, pain - 1), pain].slice(0, completed);
        sessions.push({ patientId: pid, date: VR.dayKey(13 - i), completed, total,
          pains, maxPain: Math.max.apply(null, pains), emergency: false, demo: true });
      });
    });
    return { sessions, flags: [], reminders: { p1: '7:00 AM' }, currentPatient: 'p1' };
  }

  // Storage: browser storage can be unavailable, so fall back to memory.
  const KEY = 'voicerehab.v1';
  let mem = null;

  function read() {
    if (mem) return mem;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) mem = JSON.parse(raw);
    } catch (e) { /* storage blocked */ }
    if (!mem) { mem = seed(); write(); }
    return mem;
  }
  function write() {
    try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) { /* ignore */ }
  }

  VR.store = {
    get: read,
    addSession(s) { read().sessions.push(s); write(); },
    addFlag(f) { read().flags.push(f); write(); },
    setReminder(pid, t) { read().reminders[pid] = t; write(); },
    reminder(pid) { return read().reminders[pid] || null; },
    current() { return read().currentPatient || 'p1'; },
    setCurrent(id) { read().currentPatient = id; write(); },
    reset() { mem = seed(); write(); },
  };
})();
