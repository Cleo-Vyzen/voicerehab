// VoiceRehab — clinic dashboard for physiotherapists.
(function () {
  const VR = window.VR;
  const $ = (id) => document.getElementById(id);
  const DAYS = 14;

  function latestPerDay(sessions) {
    const byDay = {};
    sessions.forEach((s) => { byDay[s.date] = s; });
    return byDay;
  }

  function analyse(p, data) {
    const mine = data.sessions.filter((s) => s.patientId === p.id);
    const byDay = latestPerDay(mine);
    const series = [];
    for (let i = DAYS - 1; i >= 0; i--) {
      const s = byDay[VR.dayKey(i)];
      series.push(s && s.maxPain !== null ? s.maxPain : null);
    }
    const today = byDay[VR.dayKey(0)];
    const status = !today ? 'Not done' : today.completed >= today.total ? 'Done' : 'Partial';
    const fullDays = Object.keys(byDay).filter((d) => {
      const s = byDay[d];
      return s.completed >= s.total && d >= VR.dayKey(DAYS - 1);
    }).length;

    const recorded = series.filter((v) => v !== null);
    const last = recorded.length ? recorded[recorded.length - 1] : null;
    const flags = [];
    const myFlags = data.flags.filter((f) => f.patientId === p.id);
    if (myFlags.some((f) => f.type === 'emergency')) flags.push({ cls: 'danger', text: 'Reported severe pain or fall' });
    if (last !== null && last >= 7) flags.push({ cls: 'danger', text: 'High pain (' + last + '/10)' });
    const r = recorded.slice(-3);
    if (r.length === 3 && r[0] < r[1] && r[1] < r[2]) flags.push({ cls: 'warn', text: 'Pain rising 3 sessions in a row' });
    if (fullDays / DAYS < 0.5) flags.push({ cls: 'warn', text: 'Low adherence' });
    if (myFlags.some((f) => f.type === 'callback')) flags.push({ cls: 'info', text: 'Call-back requested' });

    return { status, series, last, adherence: Math.round((fullDays / DAYS) * 100), flags };
  }

  function sparkline(series) {
    const w = 220, h = 64, pad = 6;
    const x = (i) => pad + (i * (w - pad * 2)) / (series.length - 1);
    const y = (v) => h - pad - (v / 10) * (h - pad * 2);
    let path = '';
    let dots = '';
    series.forEach((v, i) => {
      if (v === null) return;
      path += (path ? ' L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1);
      dots += '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(v).toFixed(1) + '" r="2.6" class="' + (v >= 7 ? 'hi' : '') + '"/>';
    });
    return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="Pain over the last 14 days">' +
      '<line x1="' + pad + '" x2="' + (w - pad) + '" y1="' + y(7) + '" y2="' + y(7) + '" class="limit"/>' +
      '<path d="' + path + '"/>' + dots + '</svg>';
  }

  function render() {
    const data = VR.store.get();
    const rows = VR.PATIENTS.map((p) => ({ p, a: analyse(p, data) }));
    // Most urgent first
    const score = (a) => a.flags.filter((f) => f.cls === 'danger').length * 10 + a.flags.length;
    rows.sort((m, n) => score(n.a) - score(m.a));

    $('statDone').textContent = rows.filter((r) => r.a.status === 'Done').length + ' / ' + rows.length;
    $('statFlags').textContent = rows.filter((r) => r.a.flags.some((f) => f.cls === 'danger')).length;
    $('statAdh').textContent = Math.round(rows.reduce((t, r) => t + r.a.adherence, 0) / rows.length) + '%';

    $('patients').innerHTML = rows.map(({ p, a }) =>
      '<article class="card prow">' +
        '<div class="pinfo"><h3>' + p.name + '</h3><p class="muted">' + p.age + ' yrs · ' + p.condition + '</p>' +
          '<span class="status s-' + a.status.replace(' ', '').toLowerCase() + '">Today: ' + a.status + '</span>' +
          '<span class="pill">14-day adherence ' + a.adherence + '%</span></div>' +
        '<div class="ptrend"><p class="muted small">Pain, last 14 days (line = 7)</p>' + sparkline(a.series) +
          '<p class="small">Latest pain: <b>' + (a.last === null ? '—' : a.last + '/10') + '</b></p></div>' +
        '<div class="pflags">' + (a.flags.length
          ? a.flags.map((f) => '<span class="flag ' + f.cls + '">' + f.text + '</span>').join('')
          : '<span class="flag ok">On track</span>') + '</div>' +
      '</article>').join('');
  }

  document.addEventListener('DOMContentLoaded', () => {
    render();
    $('resetBtn').onclick = () => { VR.store.reset(); render(); };
    // Refresh when the patient app (another tab) saves a session
    window.addEventListener('storage', render);
    setInterval(render, 5000);
  });
})();
