/* Notebook boards: one person (Rohit) with his notes, in three spaces: Personal, Northwind, Pilot Farm. Shared by every P-* board. */
(function () {
  var SP = {
    me: { id: 'me', name: 'Personal', personal: true, initials: 'P', sub: 'Just you' },
    nw: { id: 'nw', name: 'Northwind', color: '#3d5a80', initials: 'N', sub: '19 people' },
    pf: { id: 'pf', name: 'Pilot Farm', color: '#7a4e7e', initials: 'PF', sub: '6 people' }
  };
  var T = {
    nw38: { id: 'NW-38', title: 'Write up what we learned from the onboarding interviews', space: SP.nw },
    nw41: { id: 'NW-41', title: 'Sync with Meera on onboarding copy', space: SP.nw },
    nw65: { id: 'NW-65', title: 'Plan the team offsite agenda', space: SP.nw },
    pf12: { id: 'PF-12', title: 'Check the staging backup restore', space: SP.pf },
    me58: { id: 'ME-58', title: 'Pay the electricity bill', space: SP.me },
    me62: { id: 'ME-62', title: 'Call the bank about the card', space: SP.me }
  };
  var INTERVIEWS = '<h2>Five pilot interviews</h2><p>Same thing came up four times: people don’t know what a <strong>space</strong> is until they have two.</p><ul><li>Anil: wants the Backlog to be the default, not Today</li><li>Meera’s team: invite email lands in spam (check SPF)</li><li>Nobody found Quick Add without being told</li></ul><h3>To do from this</h3><ul class="tp-checks" data-type="taskList"><li data-checked="true">Share the raw notes with Meera</li><li data-checked="false">Draft the write-up for Thursday</li></ul><blockquote><p>“I’d use it every day if it opened the second I thought of something.”</p></blockquote>';
  var PADS = {
    interviews: { id: 'interviews', title: 'Onboarding interview notes', path: ['Northwind'], where: 'Northwind', edited: '1h', words: 418, links: 2, linked: [T.nw38, T.nw41], html: INTERVIEWS, text: 'five pilot interviews space backlog quick add spam' },
    demo: { id: 'demo', title: 'Quick Add demo script', path: ['Northwind'], where: 'Northwind', edited: 'Thu', words: 212, links: 1, linked: [T.nw41], html: '<p>Open with the shortcut from Slack. Don’t touch the mouse.</p><ol><li>⌘⇧N from anywhere</li><li>Type the task, Tab to the day</li><li>Show it landing on Today</li></ol>' },
    braindump: { id: 'braindump', title: 'Q4 planning braindump', path: ['Northwind', 'Planning'], where: 'Northwind / Planning', edited: 'Thu', words: 960, links: 0, linked: [], html: '<p>Big rocks: All spaces, the notebook, Jira per account. Small: copy pass on empty states.</p>' },
    agenda: { id: 'agenda', title: 'Offsite agenda draft', path: ['Northwind', 'Planning', 'Offsite'], where: 'Northwind / Planning / Offsite', edited: '4m', words: 136, links: 1, linked: [T.nw65], html: '<h2>Day one</h2><ul><li>9:30 coffee, no laptops</li><li>10:00 what shipped, what didn’t</li><li>14:00 roadmap, one page each</li></ul>' },
    venues: { id: 'venues', title: 'Venue shortlist', path: ['Northwind', 'Planning', 'Offsite'], where: 'Northwind / Planning / Offsite', edited: 'Mon', words: 74, links: 1, linked: [T.nw65], html: '<ul><li>The Old Mill: 24 people, has a garden</li><li>Hallway Studio: cheaper, no parking</li></ul>' },
    flat: { id: 'flat', title: 'Things to fix in the flat', path: ['Home'], where: 'Home', edited: '12 Oct', words: 58, links: 0, linked: [], html: '<ul class="tp-checks" data-type="taskList"><li data-checked="false">Bathroom tap drips</li><li data-checked="true">Hall light</li></ul>' },
    gifts: { id: 'gifts', title: 'Gift ideas', path: ['Home'], where: 'Home', edited: 'Sep', words: 31, links: 0, linked: [], html: '<p>Mum: the blue teapot from the market. Arjun: a good notebook.</p>' },
    shapeup: { id: 'shapeup', title: 'Shape Up, notes', path: ['Reading'], where: 'Reading', edited: 'Aug', words: 640, links: 0, linked: [], html: '<p>Appetite, not estimates. Fixed time, variable scope.</p>' },
    sunday: { id: 'sunday', title: '', first: 'Sunday scribbles', path: [], where: 'Not in a folder', edited: 'Yesterday', words: 44, links: 0, linked: [], html: '<p>Sunday scribbles</p><p>Call the bank about the card, ask about the fee too.</p>' },
    bank: { id: 'bank', title: 'Card fee question', path: [], where: 'Not in a folder', edited: 'Fri', words: 22, links: 1, linked: [T.me62], html: '<p>They charged ₹750 twice. Ask for a reversal.</p>' }
  };
  Object.keys(PADS).forEach(function (k) { var p = PADS[k]; p.text = String(p.html || '').replace(/<\/(p|li|h2|h3|blockquote)>/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); });
  var FOLDERS = [
    { id: 'f-nw', name: 'Northwind', folders: [
      { id: 'f-plan', name: 'Planning', folders: [
        { id: 'f-off', name: 'Offsite', folders: [], pads: [PADS.agenda, PADS.venues] }
      ], pads: [PADS.braindump] }
    ], pads: [PADS.interviews, PADS.demo] },
    { id: 'f-home', name: 'Home', folders: [], pads: [PADS.flat, PADS.gifts] },
    { id: 'f-read', name: 'Reading', folders: [], pads: [PADS.shapeup] },
    { id: 'f-new', name: 'Ideas', folders: [], pads: [] }
  ];
  var LOOSE = [PADS.sunday, PADS.bank];
  var RECENT = [PADS.agenda, PADS.interviews, PADS.sunday, PADS.braindump, PADS.flat];
  var TASKS = [T.nw38, T.nw41, T.nw65, T.pf12, T.me58, T.me62].map(function (t) { return Object.assign({ key: t.id, sub: t.space.name }, t); });
  var ALLPADS = Object.keys(PADS).map(function (k) { var p = PADS[k]; return { key: p.id, id: '', title: p.title || p.first, sub: p.where + ' · ' + p.edited }; });
  window.PadDemo = { NOTEBOOK: { folders: FOLDERS, loose: LOOSE, pads: PADS, open: { 'f-nw': true, 'f-plan': true, 'f-off': true } }, SP: SP, T: T, PADS: PADS, FOLDERS: FOLDERS, LOOSE: LOOSE, RECENT: RECENT, TASKS: TASKS, ALLPADS: ALLPADS,
    OPEN: { 'f-nw': true, 'f-plan': true, 'f-off': true, 'f-home': false },
    SPACES: [SP.me, SP.nw, SP.pf],
    week: [1, 2, 3, 4, 5].map(function (n) { var d = new Date(2026, 9, 25 + n); return { value: 'day:' + n, date: String(d.getDate()), label: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()] }; }),
    nav: [{ value: 'today', label: 'Today', icon: 'today' }, { value: 'week', label: 'Week', icon: 'week' }, { value: 'backlog', label: 'Backlog', icon: 'backlog' }, { value: 'people', label: 'People', icon: 'team' }]
  };
})();
