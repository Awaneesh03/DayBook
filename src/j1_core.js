/* =====================================================================
   Helpers
   ===================================================================== */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  if (props) for (const k in props) {
    const v = props[k];
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) { if (c == null || c === false) continue; e.append(c.nodeType ? c : String(c)); }
  return e;
}
const clone = o => JSON.parse(JSON.stringify(o));
const pad = n => String(n).padStart(2, '0');
const toId = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const fromId = id => { const p = id.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
const todayId = () => toId(new Date());
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const niceDate = id => { const d = fromId(id); return DAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()]; };
const longDate = id => { const d = fromId(id); return DAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); };
const shortDate = id => { const d = fromId(id); return d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3) + (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''); };
const countWords = s => ((s || '').match(/\S+/g) || []).length;
const plural = (n, a, b) => n.toLocaleString() + ' ' + (n === 1 ? a : (b || a + 's'));
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = ease;
const easeOutQuad = t => 1 - (1 - t) * (1 - t);
const motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
const reduceMotion = () => motionQuery.matches; // live, and cheap enough to call every frame
function hashStr(s) { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; }
function rng(seed) { let a = (seed >>> 0) || 1; return function () { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const newId = (p) => (p || 'j') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
function makeCanvas(w, hgt, draw) { const c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, hgt | 0); const x = c.getContext('2d'); if (draw) draw(x, c.width, c.height); return c; }
function hexToRgb(hex) { const m = String(hex).replace('#', ''); const n = parseInt(m.length === 3 ? m.split('').map(c => c + c).join('') : m, 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function shade(hex, amt) { const [r, g, b] = hexToRgb(hex); const f = v => clamp(Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt), 0, 255); return 'rgb(' + f(r) + ',' + f(g) + ',' + f(b) + ')'; }
function luminance(hex) { const [r, g, b] = hexToRgb(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }
function chipRow(container, opts, current, onPick, iconFn) {
  container.textContent = '';
  Object.keys(opts).forEach(id => {
    const b = h('button', { type: 'button', class: 'chip', 'aria-pressed': id === current ? 'true' : 'false', onclick: () => onPick(id) });
    if (iconFn) { const ic = iconFn(id); if (ic) b.append(ic); }
    b.append(typeof opts[id] === 'string' ? opts[id] : opts[id].name);
    container.append(b);
  });
  return container;
}

let toastTimer = null;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3000); }

/* =====================================================================
   Catalogue
   ===================================================================== */
const PENS = {
  fountain:    { name: 'Fountain pen', note: 'Wet, flowing ink', font: "'Caveat', cursive", size: 25, weight: 500, snd: 'scratch' },
  ballpoint:   { name: 'Ballpoint', note: 'Neat everyday hand', font: "'Kalam', cursive", size: 18, weight: 300, snd: 'smooth' },
  gel:         { name: 'Gel pen', note: 'Smooth and bold', font: "'Patrick Hand', cursive", size: 21, weight: 400, snd: 'smooth' },
  pencil:      { name: 'Pencil', note: 'Soft graphite', font: "'Kalam', cursive", size: 18, weight: 300, snd: 'pencil' },
  marker:      { name: 'Felt marker', note: 'Loose and quick', font: "'Reenie Beanie', cursive", size: 29, weight: 400, snd: 'felt' },
  brush:       { name: 'Brush pen', note: 'Bold strokes', font: "'Nanum Brush Script', cursive", size: 30, weight: 400, snd: 'felt' },
  calligraphy: { name: 'Calligraphy', note: 'Formal script', font: "'Dancing Script', cursive", size: 23, weight: 500, snd: 'scratch' },
  quill:       { name: 'Feather quill', note: 'Old-world hand', font: "'Homemade Apple', cursive", size: 17, weight: 400, snd: 'scratch' },
  typewriter:  { name: 'Typewriter', note: 'Mechanical keys', font: "'Special Elite', monospace", size: 16, weight: 400, snd: 'type' }
};
const PEN_SVG = {
  fountain: '<path d="M0 12 L20 6.5 Q24 12 20 17.5 Z" fill="#D8B160"/><path d="M2 12 L16 12" stroke="#6b4e14" stroke-width=".8"/><circle cx="14" cy="12" r="1.2" fill="#6b4e14"/><rect x="20" y="7" width="14" height="10" rx="2" fill="#151418"/><rect x="34" y="5.5" width="96" height="13" rx="6" fill="#23202a"/><rect x="36" y="6.5" width="92" height="3" rx="1.5" fill="rgba(255,255,255,.16)"/><rect x="96" y="5.5" width="4" height="13" fill="#C9A54C"/><path d="M104 4 h28 v3 h-28z" fill="#C9A54C"/><rect x="128" y="6" width="20" height="12" rx="6" fill="#151418"/>',
  ballpoint: '<path d="M0 12 L9 10.2 L9 13.8Z" fill="#8b949e"/><path d="M9 9.5 L22 8 L22 16 L9 14.5Z" fill="#cfd5dc"/><rect x="22" y="7" width="26" height="10" rx="3" fill="currentColor" opacity=".85"/><rect x="48" y="6.5" width="84" height="11" rx="5" fill="#f4f4f6"/><rect x="50" y="7.5" width="80" height="2.5" rx="1" fill="rgba(0,0,0,.06)"/><rect x="132" y="8" width="14" height="8" rx="3" fill="currentColor"/><path d="M100 4.5 h34 v2.5 h-34z" fill="#b8bec7"/>',
  gel: '<path d="M0 12 L8 10.5 L8 13.5Z" fill="#666"/><rect x="8" y="9" width="14" height="6" rx="2" fill="#bbb"/><rect x="22" y="6.5" width="110" height="11" rx="5" fill="rgba(225,232,240,.7)" stroke="rgba(0,0,0,.18)"/><rect x="24" y="10.5" width="104" height="3" rx="1.5" fill="currentColor"/><rect x="132" y="6" width="16" height="12" rx="4" fill="currentColor"/>',
  pencil: '<path d="M0 12 L7 10 L7 14Z" fill="#333"/><path d="M7 10 L22 6.5 L22 17.5 L7 14Z" fill="#E8C9A0"/><rect x="22" y="6.5" width="96" height="11" fill="#F2C230"/><rect x="22" y="10.5" width="96" height="2.4" fill="#D9A91F"/><rect x="118" y="6" width="10" height="12" fill="#B9BEC6"/><rect x="128" y="6.5" width="14" height="11" rx="3" fill="#E58A9A"/>',
  marker: '<path d="M0 10 L8 8 L8 16 L0 14Z" fill="currentColor"/><rect x="8" y="5" width="12" height="14" rx="2" fill="#2b2b2f"/><rect x="20" y="4" width="112" height="16" rx="7" fill="#ececef"/><rect x="60" y="4" width="30" height="16" fill="currentColor" opacity=".9"/><rect x="132" y="5" width="14" height="14" rx="5" fill="currentColor"/>',
  brush: '<path d="M0 12 Q8 7.5 20 7.5 L20 16.5 Q8 16.5 0 12Z" fill="currentColor"/><rect x="20" y="7.5" width="12" height="9" fill="#C0C4CA"/><path d="M32 8 L146 9.5 L146 14.5 L32 16Z" fill="#7A4A2A"/><rect x="120" y="9.3" width="26" height="5.4" fill="#C9A54C"/>',
  calligraphy: '<path d="M0 12 L16 5 L19 12 L16 19Z" fill="#c9cdd4"/><path d="M1 12 L14 12" stroke="#666" stroke-width=".7"/><rect x="19" y="8.5" width="10" height="7" rx="2" fill="#B8892E"/><path d="M29 8.5 L146 10 L146 14 L29 15.5Z" fill="#5B3A22"/>',
  quill: '<path d="M0 12 L12 11 L12 13Z" fill="#2a1d10"/><path d="M12 12 L148 12" stroke="#cdbb95" stroke-width="1.6"/><path d="M34 12 C64 -3, 112 -5, 148 5 C120 9, 72 12, 34 12Z" fill="#F3ECDD" stroke="#c8b892" stroke-width=".6"/><path d="M34 12 C70 22, 118 23, 146 17 C118 14, 72 12, 34 12Z" fill="#E4D8C0"/><path d="M60 11 L74 4 M80 11 L96 2 M100 11 L116 2 M70 13 L84 20 M92 13 L108 21" stroke="#cdbb95" stroke-width=".6"/>',
  typewriter: ''
};
const penSvg = id => '<svg viewBox="0 0 150 24" aria-hidden="true">' + (PEN_SVG[id] || '') + '</svg>';
const INKS = [
  { id: 'midnight', name: 'Midnight blue', c: '#1E2F6B' }, { id: 'black', name: 'Black', c: '#1B1A1F' },
  { id: 'sepia', name: 'Sepia', c: '#6B4423' }, { id: 'forest', name: 'Forest green', c: '#1F5135' },
  { id: 'burgundy', name: 'Burgundy', c: '#7A1F2B' }, { id: 'violet', name: 'Violet', c: '#4B2D82' },
  { id: 'teal', name: 'Teal', c: '#0F5E63' }, { id: 'rose', name: 'Rose', c: '#A63D63' },
  { id: 'graphite', name: 'Graphite', c: '#4B4B52' }, { id: 'white', name: 'White gel', c: '#F2EFE8', light: true },
  { id: 'gold', name: 'Gold gel', c: '#D9B45A', light: true }, { id: 'silver', name: 'Silver gel', c: '#C9CFD8', light: true }
];
const inkOf = id => INKS.find(i => i.id === id) || INKS[0];
const PAPERS = {
  fresh:    { name: 'Fresh white', bg: '#FBFBF8', rule: 'rgba(64,104,168,.32)', tex: 'clean' },
  cream:    { name: 'Ivory', bg: '#F4ECD8', rule: 'rgba(122,96,58,.28)', tex: 'soft' },
  old:      { name: 'Old parchment', bg: '#E3CF9F', rule: 'rgba(110,78,36,.32)', tex: 'aged' },
  kraft:    { name: 'Brown kraft', bg: '#BF9566', rule: 'rgba(68,42,16,.34)', tex: 'fiber' },
  rose:     { name: 'Rose', bg: '#F3DAD7', rule: 'rgba(150,70,80,.27)', tex: 'soft' },
  sky:      { name: 'Sky blue', bg: '#DAE6F2', rule: 'rgba(50,90,140,.28)', tex: 'soft' },
  mint:     { name: 'Mint', bg: '#DAEDE0', rule: 'rgba(40,110,70,.27)', tex: 'soft' },
  lavender: { name: 'Lavender', bg: '#E4DDF0', rule: 'rgba(90,70,140,.27)', tex: 'soft' },
  butter:   { name: 'Butter yellow', bg: '#F5EAC0', rule: 'rgba(140,110,30,.28)', tex: 'soft' },
  midnight: { name: 'Midnight black', bg: '#1E2129', rule: 'rgba(255,255,255,.15)', tex: 'dark', dark: true }
};
const RULINGS = { lined: 'Lined', dotted: 'Dotted', grid: 'Grid', blank: 'Blank' };
const SCALES = [{ v: .9, name: 'Small' }, { v: 1, name: 'Medium' }, { v: 1.15, name: 'Large' }];
const MOODS = ['Rough', 'Low', 'Okay', 'Good', 'Great'];
const MOOD_C = ['#C0504D', '#E08A3C', '#9AA3B5', '#3E9E7E', '#3D7BD9'];
const COVER_COLORS = ['#1F3A5F', '#6E1F2A', '#23463A', '#7A9A7E', '#3D2752', '#B7832F', '#A47148', '#2D2D33', '#1F5F63', '#C98B8B', '#7FA6C9', '#A493C4', '#E3D6BA', '#141418', '#A2462F', '#D4A63A'];
const MATERIALS = { leather: 'Leather', linen: 'Linen', velvet: 'Velvet', kraft: 'Kraft card', marble: 'Marbled', cloth: 'Canvas' };
const PATTERNS = { none: 'Plain', frame: 'Frame', corners: 'Corners', band: 'Band', stripes: 'Stripes', dots: 'Dots', stars: 'Stars', waves: 'Waves' };
const EMBLEMS = { none: 'None', moon: 'Moon', sun: 'Sun', star: 'Star', heart: 'Heart', leaf: 'Leaf', flower: 'Flower', feather: 'Feather', compass: 'Compass', mountain: 'Mountain' };
const FOILS = {
  gold: { name: 'Gold', g: ['#F6DD94', '#B8892E', '#F2D27E'] }, silver: { name: 'Silver', g: ['#F7F8FA', '#9EA6B2', '#E4E8EE'] },
  copper: { name: 'Copper', g: ['#F3B78E', '#A0552B', '#E8A174'] }, rose: { name: 'Rose gold', g: ['#F8D3CA', '#B26F66', '#EFBBAF'] },
  ink: { name: 'Black ink', g: ['#1D1B22'] }, cream: { name: 'Cream', g: ['#F4ECDB'] }
};
const TITLE_FONTS = { serif: 'Classic', script: 'Script', hand: 'Handwritten', sans: 'Modern', type: 'Typewriter' };
const TEXT_FONTS = { serif: 'Classic', script: 'Script', hand: 'Caveat', sans: 'Modern', type: 'Typewriter', brush: 'Brush', apple: 'Scrawl', dancing: 'Flowing' };
const SIZES = { pocket: { name: 'Pocket', h: .215, w: .15 }, a5: { name: 'A5', h: .255, w: .18 }, tall: { name: 'Tall', h: .29, w: .195 } };
const THICKS = { slim: { name: 'Slim', t: .026 }, regular: { name: 'Regular', t: .04 }, thick: { name: 'Thick', t: .058 } };
const RIBBONS = ['#8E2A2A', '#1F3A5F', '#C9A54C', '#2F6B4F', '#5B3F8C', '#D98BA0', '#1B1B1F', '#E8DCC2'];
const BM_COLORS = ['#C0392B', '#E67E22', '#D4AC0D', '#27AE60', '#2E86C1', '#8E44AD', '#E84393', '#34495E'];
const ART_COLORS = ['#1B1A1F', '#FFFFFF', '#F4ECDB', '#C0392B', '#E67E22', '#F1C40F', '#27AE60', '#2E86C1', '#8E44AD', '#E84393', '#7A4A2A', '#1F5F63'];
const HL_COLORS = ['#FFE45C', '#FF9EC4', '#9BF0B0', '#9CD3FF', '#FFC27A'];
const STICKERS = ['🌙', '⭐', '✨', '☀️', '🌸', '🌷', '🌻', '🍂', '🌿', '🍀', '🌈', '☁️', '🌧️', '❄️', '🔥', '🌊', '🏔️', '🌵', '☕', '🍵', '🍰', '🍓', '🍋', '🍕', '📚', '✏️', '🖋️', '📷', '🎧', '🎵', '🎨', '🧵', '✈️', '🚲', '🗺️', '🏠', '💌', '❤️', '💛', '💜', '🦋', '🐝', '🐾', '🐈', '🐶', '🦊', '🕯️', '🗝️', '🎀', '🎈', '🏆', '💡', '🌟', '😊', '😴', '🥳'];
const TAPES = [
  { c: '#F2C6C2', p: 'stripe' }, { c: '#BFD8EA', p: 'dots' }, { c: '#F5E1A4', p: 'plain' }, { c: '#C9E4C5', p: 'grid' },
  { c: '#D9C8EE', p: 'stripe' }, { c: '#F7B98B', p: 'dots' }, { c: '#E8E0D0', p: 'grid' }, { c: '#9AD1C9', p: 'plain' }
];
function tapeBg(t) {
  const c = t.c;
  if (t.p === 'stripe') return 'repeating-linear-gradient(45deg,' + c + ' 0 8px, rgba(255,255,255,.55) 8px 14px)';
  if (t.p === 'dots') return 'radial-gradient(circle, rgba(255,255,255,.75) 2px, transparent 2.5px) 0 0/12px 12px,' + c;
  if (t.p === 'grid') return 'linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px) 0 0/10px 10px, linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px) 0 0/10px 10px,' + c;
  return c;
}
const PROMPTS = [
  'What took most of your energy today?', 'What are you glad is finished?', 'What did you notice today that you usually walk past?',
  'What are you putting off, and what is the smallest first step?', 'Who did you talk to today, and what stayed with you?',
  'What would make tomorrow a good day?', 'What are three things you are grateful for right now?', 'What did you learn today, big or small?',
  'What surprised you today?', 'If today had a title, what would it be?', 'Describe the room you are sitting in.', 'What is on your mind that you have not said out loud?',
  'What made you laugh recently?', 'Write a letter to yourself one year from now.', 'What does a perfect slow morning look like?', 'What are you looking forward to this week?',
  'What is one small thing you did well today?', 'Where did you feel most like yourself today?', 'What would you tell a friend having your day?', 'What song fits today, and why?'
];
const TEMPLATES = [
  { name: 'Daily reflection', note: 'Best part, hard part, lesson', text: 'Today in three words:\n\nThe best part of today:\n\nSomething that was hard:\n\nWhat I learned:\n\nTomorrow I want to:\n' },
  { name: 'Gratitude', note: 'Three good things', text: 'Three things I am grateful for\n1. \n2. \n3. \n\nSomeone who made my day better:\n' },
  { name: 'Morning pages', note: 'Start the day clear', text: 'This morning I feel\n\nOne thing I will do today:\n\nWhat is on my mind:\n' },
  { name: 'Dream log', note: 'Catch it before it fades', text: 'Dream title:\n\nWhat happened:\n\nPeople and places:\n\nHow I felt when I woke up:\n' },
  { name: 'Travel day', note: 'Places, food, moments', text: 'Where I am:\n\nWhat I saw:\n\nWhat I ate:\n\nA moment to remember:\n' },
  { name: 'Weekly review', note: 'Wins and next steps', text: 'Wins this week:\n\nWhat did not go to plan:\n\nWhat I learned:\n\nFocus for next week:\n' },
  { name: 'To-do list', note: 'Boxes to tick', text: 'To do\n☐ \n☐ \n☐ \n☐ \n' },
  { name: 'Letter to future me', note: 'Open it in a year', text: 'Dear future me,\n\n\n\nLove,\nme\n' },
  { name: 'Mood check-in', note: 'Name it, then let it be', text: 'Right now I feel\nBecause\nWhat my body needs:\nOne kind thing I can do for myself:\n' },
  { name: 'Book notes', note: 'Quotes and thoughts', text: 'Book:\nAuthor:\n\nFavourite line:\n\nWhat it made me think about:\n' }
];
const BADGES = [
  { id: 'first', icon: '🖋️', name: 'First page', note: 'Write your first page' },
  { id: 's3', icon: '🔥', name: '3-day streak', note: 'Write 3 days in a row' },
  { id: 's7', icon: '🌟', name: 'One week', note: '7-day streak' },
  { id: 's30', icon: '🏆', name: 'One month', note: '30-day streak' },
  { id: 'w1k', icon: '📜', name: '1,000 words', note: 'Write 1,000 words' },
  { id: 'w10k', icon: '📚', name: '10,000 words', note: 'Write 10,000 words' },
  { id: 'p25', icon: '📖', name: '25 pages', note: 'Fill 25 pages' },
  { id: 'cover', icon: '🎨', name: 'Cover artist', note: 'Decorate a cover' },
  { id: 'photo', icon: '📷', name: 'Scrapbooker', note: 'Add a photo to a page' },
  { id: 'owl', icon: '🦉', name: 'Night owl', note: 'Write after 11 pm' },
  { id: 'bird', icon: '🐦', name: 'Early bird', note: 'Write before 7 am' },
  { id: 'shelf', icon: '🗂️', name: 'Collector', note: 'Keep 6 journals' }
];
const MILESTONES = [3, 7, 14, 30, 50, 100, 200, 365];
const dimsOf = j => ({ t: (THICKS[j.thick] || THICKS.regular).t, h: (SIZES[j.size] || SIZES.a5).h, w: (SIZES[j.size] || SIZES.a5).w });
const CLOCK_STYLES = {
  daybook: { name: 'Daybook Italic', roman: false, font: 'Cormorant Garamond', rim: '#2B2420' },
  roman: { name: 'Classic Roman', roman: true, font: 'Cormorant Garamond', rim: '#1A1714' },
  minimal: { name: 'Modern Minimal', roman: false, font: 'Manrope', ticks: true, rim: '#2B2824' },
  brass: { name: 'Station Brass', roman: false, font: 'Special Elite', brass: true, rim: '#8A6D3B' }
};
const CURTAIN_COLORS = {
  ochre: ['Amber velvet', '#B4823E', '#785020'],
  cream: ['Ivory linen', '#DED6C5', '#9E9480'],
  sage: ['Sage green', '#5B7A6A', '#3C5548'],
  navy: ['Midnight navy', '#2A3B56', '#1A263B'],
  burgundy: ['Deep wine', '#782631', '#4F151E']
};
const TOUR_STOPS = [
  { id: 'desk', label: 'Desk & Journal', desc: 'Your writing desk, lined with warm wood and ready for today\'s words.', pos: [0, .78 + .42, -1.05], target: [0, .78 + .02, -1.52] },
  { id: 'shelf', label: 'Bookshelf', desc: 'Handcrafted volumes resting on brass brackets, storing all your memories.', pos: [0, 1.48, -1.15], target: [0, 1.41, -1.88] },
  { id: 'window', label: 'Window & Skyline', desc: 'Looking out across the quiet rooftops under the changing sky.', pos: [1.32, 1.52, -1.35], target: [1.48, 1.5, -2.0] },
  { id: 'clock', label: 'Wall Clock', desc: 'Keeping gentle company with the rhythm of the day.', pos: [-1.02, 1.84, -1.45], target: [-1.34, 1.84, -1.97] },
  { id: 'lamp', label: 'Desk Lamp', desc: 'Solid brass with green enamel shade, casting a warm reading pool.', pos: [-.38, .78 + .38, -1.35], target: [-.6, .78 + .22, -1.74] },
  // the globe (top shelf), plant and radio (desk) span about a metre each way: a three-quarter view from the right fits them
  // above the tour bar; tall screens see far less across, so they get a wider pose
  { id: 'decor', label: 'Study Keepsakes', desc: 'The spinning globe, miniature potted greens, and vintage radio.', pos: [.9, 1.97, -.07], target: [.05, 1.17, -1.86],
    portrait: { pos: [1.0, 1.95, 1.15], target: [.15, 1.32, -1.86] } }
];

// dim: least sky darkness this weather allows (0 day .. 1 night); night: only shows after dark, so it forces night.
// ambient: the matching room ambience, only ever suggested, never started for the user.
const WEATHER_MODES = {
  clear: { name: 'Clear Sky', icon: '☀️', dim: 0 },
  rain: { name: 'Gentle Rain', icon: '🌧️', dim: .4, ambient: 'rain' },
  cloudy: { name: 'Drifting Clouds', icon: '☁️', dim: .25 },
  starry: { name: 'Starry Twilight', icon: '✨', dim: 0, night: true, ambient: 'crickets' }
};

const FINISH_STYLES = {
  satin: { name: 'Satin Luster', rough: .52, metal: .08 },
  matte: { name: 'Raw Matte', rough: .86, metal: .02 },
  gloss: { name: 'Polished Varnish', rough: .24, metal: .22 }
};

const LAMP_STYLES = {
  brass: { name: 'Vintage Brass', shade: '#1F3B33', arm: '#B3893C' },
  banker: { name: "Banker's Emerald", shade: '#145A32', arm: '#C9A54C' },
  chrome: { name: 'Brushed Chrome', shade: '#3A444C', arm: '#A4B0B8' },
  black: { name: 'Matte Industrial', shade: '#202022', arm: '#38383C' }
};

const ART_STYLES = {
  quiet_focus: { name: 'Quiet Focus', p1: '#2A3B37', p2: '#BFA780', p3: '#DED6C5' },
  botanical: { name: 'Botanical Fern', p1: '#1F402B', p2: '#E8DEC8', p3: '#8A6D3B' },
  mountain: { name: 'Mountain Mist', p1: '#3A4856', p2: '#9EB0C2', p3: '#ECE8E1' },
  celestial: { name: 'Celestial Chart', p1: '#161A29', p2: '#E6C687', p3: '#344668' }
};

const POT_STYLES = {
  terracotta: { name: 'Terracotta', color: '#B5674D', rough: .8, metal: 0 },
  white_ceramic: { name: 'White Glaze', color: '#EAE6DD', rough: .3, metal: .05 },
  slate: { name: 'Slate Gray', color: '#3A3E45', rough: .7, metal: .05 },
  brass: { name: 'Solid Brass', color: '#B3893C', rough: .35, metal: .6 }
};

const MOVABLE_OBJECTS = {
  globe: { name: 'Study Globe', surface: 'shelf', defaultPos: [.56, 0, -1.86], defaultRot: 0 },
  plant: { name: 'Desk Plant', surface: 'desk', defaultPos: [-.3, 0, -1.86], defaultRot: 0 },
  radio: { name: 'Vintage Radio', surface: 'desk', defaultPos: [.27, 0, -1.86], defaultRot: 0 },
  cup: { name: 'Pen Cup', surface: 'desk', defaultPos: [.68, 0, -1.76], defaultRot: 0 },
  mug: { name: 'Coffee Mug', surface: 'desk', defaultPos: [.47, 0, -1.4], defaultRot: 0 }
};

const STARTER_PRESETS = [
  {
    id: 'cozy_night',
    name: 'Cozy Night',
    desc: 'Amber lamplight and quiet night skies with dark walnut furniture.',
    icon: '🌙',
    settings: {
      sky: 'night', weather: 'clear', lamp: true, lampTone: 'amber',
      wall: 'navy', wood: 'walnut', woodFinish: 'satin', lampStyle: 'brass',
      windowOpen: false, curtainsOpen: false, curtainColor: 'ochre',
      showClock: true, clockStyle: 'daybook', clockMode: 'analog'
    }
  },
  {
    id: 'rainy_evening',
    name: 'Rainy Evening',
    desc: 'Soft rain falling outside the casement window with warm glowing light.',
    icon: '🌧️',
    settings: {
      sky: 'night', weather: 'rain', lamp: true, lampTone: 'warm',
      wall: 'charcoal', wood: 'ebony', woodFinish: 'satin', lampStyle: 'banker',
      windowOpen: true, curtainsOpen: true, curtainColor: 'navy',
      showClock: true, clockStyle: 'roman', clockMode: 'analog'
    }
  },
  {
    id: 'morning_focus',
    name: 'Morning Focus',
    desc: 'Bright natural daylight and refreshing sage green tones for deep work.',
    icon: '☀️',
    settings: {
      sky: 'day', weather: 'clear', lamp: false, lampTone: 'neutral',
      wall: 'sage', wood: 'oak', woodFinish: 'matte', lampStyle: 'chrome',
      windowOpen: true, curtainsOpen: true, curtainColor: 'cream',
      showClock: true, clockStyle: 'minimal', clockMode: 'both'
    }
  },
  {
    id: 'warm_library',
    name: 'Warm Library',
    desc: 'Rich cherry wood, classic Roman clock, and velvet curtain atmosphere.',
    icon: '📚',
    settings: {
      sky: 'night', weather: 'cloudy', lamp: true, lampTone: 'warm',
      wall: 'terracotta', wood: 'cherry', woodFinish: 'gloss', lampStyle: 'brass',
      windowOpen: false, curtainsOpen: true, curtainColor: 'burgundy',
      showClock: true, clockStyle: 'roman', clockMode: 'analog'
    }
  },
  {
    id: 'minimal_study',
    name: 'Minimal Study',
    desc: 'Clean whitewashed wood, modern Bauhaus clock, and quiet linen drapery.',
    icon: '🌿',
    settings: {
      sky: 'day', weather: 'clear', lamp: false, lampTone: 'cool',
      wall: 'cream', wood: 'white', woodFinish: 'matte', lampStyle: 'black',
      windowOpen: false, curtainsOpen: true, curtainColor: 'cream',
      showClock: true, clockStyle: 'minimal', clockMode: 'digital'
    }
  }
];

