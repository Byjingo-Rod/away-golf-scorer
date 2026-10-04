function gesShowAcceptedCard(course) {
  const host = document.getElementById('modalContent');
  host.replaceChildren();
  const add = (parent, tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    parent.append(node);
    return node;
  };
  const close = add(host, 'button', 'Close', 'primary');
  close.id = 'closeApprovedCard';
  close.onclick = () => document.getElementById('modalShade').classList.remove('open');
  add(host, 'h2', course?.name || 'Course');
  add(host, 'p', 'Owner-approved scorecards · Par, Index and Metres');
  const order = ['back', 'middle', 'front'];
  const cards = Object.entries(course?.teeScorecards || {}).sort(([a], [b]) => {
    const rank = key => order.includes(key) ? order.indexOf(key) : order.length;
    return rank(a) - rank(b) || a.localeCompare(b);
  });
  for (const [tee, card] of cards) {
    const info = course.teeDetails?.[tee] || {};
    const section = add(host, 'section', undefined, 'gesAcceptedCard');
    add(section, 'h3', `${info.name || tee}${info.colour ? ' · ' + info.colour : ''} tee`);
    const sum = field => (card[field] || []).reduce((total, value) => total + (Number(value) || 0), 0);
    add(section, 'p', `Slope: ${info.slope || '—'} · Scratch: ${info.scratch || '—'} · Total par: ${sum('par')} · Total metres: ${sum('metres')}`);
    const wrap = add(section, 'div', undefined, 'gesAcceptedScroll');
    const table = add(wrap, 'table');
    const head = add(table, 'thead');
    const sides = add(head, 'tr');
    for (const name of ['Front Nine', 'Back Nine']) { const th = add(sides, 'th', name); th.colSpan = 4; }
    const labels = add(head, 'tr');
    for (const name of ['Hole', 'Par', 'Index', 'Metres', 'Hole', 'Par', 'Index', 'Metres']) add(labels, 'th', name).scope = 'col';
    const body = add(table, 'tbody');
    for (let row = 0; row < 9; row++) {
      const tr = add(body, 'tr');
      for (const hole of [row, row + 9]) {
        add(tr, 'th', hole + 1, 'gesAcceptedHole').scope = 'row';
        for (const field of ['par', 'index', 'metres']) add(tr, 'td', card[field]?.[hole] ?? '—');
      }
    }
  }
  document.getElementById('modalShade').classList.add('open');
}
