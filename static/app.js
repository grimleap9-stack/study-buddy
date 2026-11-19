/* ==========================================================================
   LOFI STUDY BUDDY — app.js  (ito ang "utak" ng buong website)
   --------------------------------------------------------------------------
   PAANO ITO GUMAGANA (para sa beginners):
   1. Pagbukas ng page, kinukuha ng load() ang data sa Flask (na nakakonekta sa MongoDB).
   2. Ang data ay inilalagay sa object na S ("state" = ang memorya ng app).
   3. Ang render() ang gumuguhit ng page sa screen base sa laman ng S.
   4. Kapag may pinindot ka, tatawag ang function sa Flask (api), tapos load() ulit para mag-refresh.
   MGA BAHAGI NG FILE: helpers > views (Home, Folder, Archive/Trash, Calendar, To-do) > popups > actions > theme > effects > music
   SHORTCUTS: N = bagong note | / = search | Ctrl+S = save | Esc = isara
   ========================================================================== */
// ===== Lofi Study Buddy — one script: data, views, effects, music =====
// Shortcut: $('#id') = kunin ang isang HTML element. sleep(ms) = maghintay ng ilang millisecond.
const $ = s => document.querySelector(s), sleep = ms => new Promise(r => setTimeout(r, ms));
// esc = nililinis ang tinype ng user para hindi masira o ma-hack ang page (hal. ang mga < > na character).
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// store = taga-save ng settings sa browser (localStorage) para hindi mawala kapag nag-refresh.
const store = { get: (k, d) => { try { return localStorage.getItem(k) ?? d } catch (e) { return d } }, set: (k, v) => { try { localStorage.setItem(k, v) } catch (e) {} } };
// Listahan ng mga kulay ng note, at mga emoji na pwedeng maging icon ng folder.
const COLORS = ['blue', 'pink', 'yellow', 'peach'], ICONS = ['📖', '📚', '🎬', '🎧', '✏️', '🧪', '🌸', '⭐'];
// Date helpers: pad = nilalagyan ng 0 sa unahan (5 → 05); iso = petsa na ganito ang format: 2026-11-18.
const pad = n => String(n).padStart(2, '0'), iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// fdate = ipinapakita bilang MM/DD/YYYY; ftime = oras tulad ng 12:00 PM.
const fdate = s => { const d = new Date(s); return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}` };
const ftime = s => new Date(s).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
// Estado ng item: active / archived / trashed. Kung wala pa, 'active' ang default.
const st = x => x.state || 'active';
// S = STATE = ang memorya ng app: anong page ang bukas, anong kulay ang napili, ang listahan ng notes/folders/tasks, atbp.
const S = { view: store.get('view', 'home'), tf: 'all', guard: null, color: store.get('color', 'pink'), q: '', fr: 'week', nr: 'today', folder: null, notes: [], folders: [], tasks: [], sched: [], cal: new Date(), day: iso(new Date()), enter: true };

// TOAST = maliit na mensahe sa ibaba. Kapag may 'undo' function, may Undo button na lalabas.
let tt;
function toast(m, undo) {
    const t = $('#toast'); t.textContent = m;
    if (undo) { const b = document.createElement('button'); b.textContent = 'Undo'; b.onclick = () => { t.classList.remove('show'); undo() }; t.append(b) }
    t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), undo ? 5000 : 2600);
}
// Taga-usap sa Flask backend gamit ang fetch. Kapag may error, magpapakita ng toast at magbabalik ng null (hindi magcra-crash).
async function api(url, method = 'GET', body) {                     // returns null (and shows a toast) on any error
    try {
        // Ipinapadala ang request sa Flask (GET = kumuha, POST = gumawa, PUT = mag-edit, DELETE = magbura).
        const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
        const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Something went wrong'); return j;
    } catch (e) { toast(e instanceof TypeError ? 'Cannot reach Flask. Is it running?' : e.message); return null }
}
// Kinukuha ang LAHAT ng data (notes, folders, tasks, schedules) mula sa MongoDB sa isang bagsakan, tapos tatawagin ang render().
async function load() {
    // Sabay-sabay ang 4 na request (Promise.all) para mas mabilis.
    const [n, f, t, s] = await Promise.all([api('/api/notes?q=' + encodeURIComponent(S.q)), api('/api/folders'), api('/api/tasks'), api('/api/schedules')]);
    S.notes = n || []; S.folders = f || []; S.tasks = t || []; S.sched = s || []; render();
}
// Sinasala ayon sa Today / This Week / This Month tab: tinitingnan kung pasok ang petsa ng item.
function inR(d, r) {                                                   // Today / This Week / This Month filter
    const t = new Date(d), n = new Date(), s = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    if (r === 'today') return t >= s;
    if (r === 'week') { const w = new Date(s); w.setDate(s.getDate() - s.getDay()); return t >= w }
    return t.getFullYear() === n.getFullYear() && t.getMonth() === n.getMonth();
}
// Hanapin ang folder na kinabibilangan ng isang note.
const folderOf = n => S.folders.find(f => f._id === n.folder_id);
// Ipakita lang ang note kung tama ang estado niya at hindi nakatago ang folder niya.
const visible = (n, state) => st(n) === state && (!n.folder_id || !folderOf(n) || st(folderOf(n)) === 'active');

// ---------- views ----------
// Gumagawa ng 4 na bilog na kulay (color picker). Ang may 'sel' ang napili.
const dotsHTML = cur => COLORS.map(c => `<button class="dot d-${c}${c === cur ? ' sel' : ''}" data-c="${c}" aria-label="${c}"></button>`).join('');
// Gumagawa ng heading at ng Today / This Week / This Month tabs.
const sec = (t, key) => `<div class="sec"><h2>${t}</h2><div class="tabs">${[['today', 'Today'], ['week', 'This Week'], ['month', 'This Month']].map(([v, l]) => `<button data-tab="${key}:${v}" class="${S[key] === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>`;
// Ang dashed na card na pindutan para gumawa ng bago (New folder / New Note).
const newCard = (k, ico, label) => `<button class="card new ${k === 'note' ? 'nn' : ''}" data-new="${k}"><span>${ico}</span>${label}</button>`;
// Gumagawa ng HTML ng isang card (folder o note). Ang mode ay home / archive / trash — iba-iba ang mga button sa bawat mode.
function card(k, it, mode, i) {
    const c = `c-${it.color || 'blue'}`, x = mode === 'home' ? '<button class="x" data-a="trash" data-tip="Move to Trash" aria-label="Move to Trash">✕</button>' : '';
    // Mga button sa ilalim ng card sa Archive (Unarchive/Trash) at Trash (Restore/Delete forever).
    const foot = mode === 'archive' ? '<div class="row"><button data-a="restore">Unarchive</button><button data-a="trash">Trash</button></div>'
        : mode === 'trash' ? '<div class="row"><button data-a="restore">Restore</button><button data-a="purge">Delete forever</button></div>' : '';
    const when = it.updated_at || it.created_at;
    return k === 'folder'
        ? `<article class="card folder ${c}" style="--i:${i}" data-k="folder" data-id="${it._id}" tabindex="0"><div class="ico">${it.icon || '📁'}</div>${x}<h3>${esc(it.name)}</h3><time>${fdate(when)}</time>${foot}</article>`
        : `<article class="card note ${c}" style="--i:${i}" data-k="note" data-id="${it._id}" tabindex="0"><time>${it.pinned ? '📌 ' : ''}${fdate(when)}</time>${x}<h3>${esc(it.title)}</h3><p>${esc(it.content)}</p><footer>⏱ ${ftime(when)}</footer>${foot}</article>`;
}
// Pinagsasama-sama: nasa unahan ang mga naka-pin na note.
const byPin = (a, b) => !!b.pinned - !!a.pinned;
// Ibinabalot ang mga card sa grid layout.
const grid = h => `<div class="grid">${h}</div>`;
// HOME PAGE: Recent Folders + My Notes (o ang resulta ng search kapag may tinype sa search box).
function rHome() {
    if (S.q) { const r = S.notes.filter(n => st(n) === 'active').sort(byPin); return `<div class="sec"><h2>Results for “${esc(S.q)}”</h2></div>` + (r.length ? grid(r.map((n, i) => card('note', n, 'home', i)).join('')) : '<p class="empty">No notes match your search.</p>') }
    const fo = S.folders.filter(f => st(f) === 'active' && inR(f.updated_at || f.created_at, S.fr));
    const no = S.notes.filter(n => visible(n, 'active') && !n.folder_id && inR(n.updated_at || n.created_at, S.nr)).sort(byPin);
    return sec('Recent Folders', 'fr') + grid(fo.map((f, i) => card('folder', f, 'home', i)).join('') + newCard('folder', '📁', 'New folder'))
        + sec('My Notes', 'nr') + grid(no.map((n, i) => card('note', n, 'home', i)).join('') + newCard('note', '✏️', 'New Note'));
}
// LOOB NG ISANG FOLDER: ang mga note niya at ang mga button (Back, Rename, Archive, Trash).
function rFolder() {
    const f = S.folders.find(x => x._id === S.folder); if (!f) { S.folder = null; return rHome() }
    const ns = S.notes.filter(n => n.folder_id === f._id && st(n) === 'active').sort(byPin);
    return `<div class="bar"><button class="pill" data-back>← Back to Home</button><h2>${f.icon || '📁'} ${esc(f.name)}</h2><button class="pill" data-rename>✏️ Rename</button><button class="pill" data-fa="archived">📁 Archive folder</button><button class="pill" data-fa="trashed">🗑️ Trash folder</button></div>`
        + grid(ns.map((n, i) => card('note', n, 'home', i)).join('') + newCard('note', '✏️', 'New Note'));
}
// ARCHIVE at TRASH page. Iisang function lang para sa dalawa; ang state ang nagpapaiba.
function rBin(state) {
    const fo = S.folders.filter(f => st(f) === state), no = S.notes.filter(n => visible(n, state)), mode = state === 'archived' ? 'archive' : 'trash';
    const all = fo.map((f, i) => card('folder', f, mode, i)).join('') + no.map((n, i) => card('note', n, mode, i + fo.length)).join('');
    const empty = state === 'archived' ? 'Nothing archived yet. Archive a note from its editor.' : 'Trash is empty.';
    return (mode === 'trash' && all ? '<div class="bar"><h2>Items in Trash</h2><button class="pill" data-empty>Empty Trash</button></div>' : '') + (all ? grid(all) : `<p class="empty">${empty}</p>`);
}
// CALENDAR PAGE: buwanang grid, at panel ng schedule at task ng napiling araw.
function rCal() {
    const y = S.cal.getFullYear(), m = S.cal.getMonth(), first = new Date(y, m, 1).getDay(), last = new Date(y, m + 1, 0).getDate(), today = iso(new Date());
    // Bumubuo ng mga kahon ng araw; ang blangkong <i> ay pang-espasyo bago ang unang araw ng buwan.
    let cells = '<i></i>'.repeat(first);
    for (let d = 1; d <= last; d++) {
        const k = `${y}-${pad(m + 1)}-${pad(d)}`, e = S.sched.filter(s => s.date === k).length, t = S.tasks.filter(x => x.due_date === k).length;
        cells += `<button class="day${k === today ? ' today' : ''}${k === S.day ? ' sel' : ''}" style="--i:${d % 7}" data-day="${k}">${d}<span>${'<b class="b-e"></b>'.repeat(Math.min(e, 3))}${'<b class="b-t"></b>'.repeat(Math.min(t, 3))}</span></button>`;
    }
    const ev = S.sched.filter(s => s.date === S.day), tk = S.tasks.filter(x => x.due_date === S.day), any = S.tasks.filter(x => !x.due_date);
    const taskRow = t => `<div class="item${t.status === 'Completed' ? ' done' : ''}"><input type="checkbox" data-tog="${t._id}" ${t.status === 'Completed' ? 'checked' : ''}><span>${esc(t.title)}</span><button data-dt="${t._id}" aria-label="Delete task">✕</button></div>`;
    const label = new Date(S.day + 'T00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    return `<div class="cal"><div><div class="bar" style="margin:0"><h2>${S.cal.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h2><button class="pill" data-m="-1" aria-label="Previous month">‹</button><button class="pill" data-m="0">Today</button><button class="pill" data-m="1" aria-label="Next month">›</button></div>
      <div class="days">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => `<div>${d}</div>`).join('')}${cells}</div></div>
      <div class="panel"><h2>${label}</h2><h3>Schedule</h3>
      ${ev.map(s => `<div class="item"><small>${s.start_time}–${s.end_time}</small><span>${esc(s.activity)}</span><button data-ds="${s._id}" aria-label="Delete event">✕</button></div>`).join('') || '<p class="empty" style="padding:0">No events.</p>'}
      <div class="frm"><input type="text" id="ea" placeholder="Activity"><input type="time" id="es" value="09:00"><input type="time" id="ee" value="10:00"><button class="pill pri" data-add="s">Add event</button></div>
      <h3>To-do</h3>${tk.map(taskRow).join('') + any.map(taskRow).join('') || '<p class="empty" style="padding:0">No tasks.</p>'}
      <div class="frm"><input type="text" id="tt" placeholder="New task for this day"><button class="pill pri" data-add="t">Add task</button></div></div></div>`;
}
// TO-DO PAGE: sariling page para sa mga task (dating nasa Calendar lang)
function rTodo() {
    const today = iso(new Date()), total = S.tasks.length, done = S.tasks.filter(t => t.status === 'Completed').length;   // bilang ng lahat at tapos na
    const list = S.tasks.filter(t => S.tf === 'all' || (S.tf === 'done') === (t.status === 'Completed'))                   // sala ayon sa All / Pending / Done tab
        .sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'));                                       // pinakamaagang due date ang nasa taas
    const row = t => {                                                                                                     // isang linya ng task
        const late = t.due_date && t.due_date < today && t.status !== 'Completed';                                         // lampas na ba sa due date?
        return `<div class="item${t.status === 'Completed' ? ' done' : ''}"><input type="checkbox" data-tog="${t._id}" ${t.status === 'Completed' ? 'checked' : ''} aria-label="Mark as done"><span>${esc(t.title)}</span><small class="${late ? 'late' : ''}">${t.due_date ? (late ? 'Overdue: ' : 'Due ') + fdate(t.due_date + 'T00:00') : 'No due date'}</small><button data-dt="${t._id}" data-tip="Delete task" aria-label="Delete task">✕</button></div>`;
    };
    return `<div class="bar"><h2>To-do list</h2><button class="pill" data-clear data-tip="Delete all finished tasks">🧹 Clear completed</button></div>
      <div class="prog" aria-hidden="true"><i style="width:${total ? Math.round(done / total * 100) : 0}%"></i></div><p class="hint">${done} of ${total} tasks done</p>
      <div class="frm tf"><input type="text" id="tn" placeholder="What do you need to do?" maxlength="100"><input type="date" id="td" aria-label="Due date (optional)"><button class="pill pri" data-todo-add>+ Add task</button></div>
      <div class="tabs" style="margin:20px 0 12px">${[['all', 'All'], ['pending', 'Pending'], ['done', 'Done']].map(([v, l]) => `<button data-tf="${v}" class="${S.tf === v ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="list">${list.map(row).join('') || '<p class="empty">Nothing here yet. Add a task above.</p>'}</div>`;
}
// render = iguhit ang tamang page sa screen base sa S.view. Tinatawag tuwing may nagbago sa data.
function render() {
    const v = S.view;
    document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
    $('#title').textContent = { home: S.folder ? 'FOLDER' : 'MY NOTES', calendar: 'CALENDAR', todo: 'TO-DO LIST', archive: 'ARCHIVE', trash: 'TRASH' }[v];
    $('#dots').innerHTML = dotsHTML(S.color);
    // Tandaan kung nagta-type ka para hindi ka mawala sa input pagkatapos mag-refresh ng screen.
    const f = document.activeElement, keep = f && f.id && $('#view').contains(f) ? { id: f.id, val: f.value } : null;
    $('#view').className = S.enter ? 'enter' : ''; S.enter = false;
    // Dito talaga ipinapasok ang HTML ng napiling page sa screen.
    $('#view').innerHTML = ({ home: S.folder ? rFolder : rHome, calendar: rCal, todo: rTodo, archive: () => rBin('archived'), trash: () => rBin('trashed') })[v]();
    if (keep) { const e = document.getElementById(keep.id); if (e) { e.value = keep.val; e.focus() } }
}
// Lumipat ng page (Home/Calendar/To-do/Archive/Trash) at tandaan ang huling binuksan.
function go(v) { S.view = v; store.set('view', v); S.folder = null; S.enter = true; render() }

// ---------- modals ----------
// MODAL = popup window. Dito ipinapasok ang HTML ng popup at ipinapakita.
function modal(h) { const m = $('#modal'); m.innerHTML = `<div class="box">${h}</div>`; m.hidden = false; requestAnimationFrame(() => m.classList.add('show')) }
// Isara ang popup; magtatanong muna kung may hindi pa na-save na pagbabago.
function askClose() { if (S.guard && !S.guard()) return; closeModal() }
// Isara ang popup nang may fade-out.
function closeModal() { S.guard = null; const m = $('#modal'); m.classList.remove('show'); setTimeout(() => { m.hidden = true; m.innerHTML = '' }, 200) }
// NOTE EDITOR (popup). Kapag n ay walang laman = bagong note; kapag may laman = ineedit na note
function editNote(n) {
    const isNew = !n; n = n || { title: '', content: '', folder_id: S.folder || '' };            // blangkong note kung bago
    let col = n.color || S.color, pin = !!n.pinned;                                                // kasalukuyang kulay at kung naka-pin
    const opts = S.folders.filter(f => st(f) === 'active').map(f => `<option value="${f._id}"${f._id === n.folder_id ? ' selected' : ''}>${f.icon || '📁'} ${esc(f.name)}</option>`).join('');   // listahan ng folder
    modal(`<h2>${isNew ? 'New note' : 'Edit note'}</h2><input id="mt" placeholder="Title" maxlength="80" value="${esc(n.title)}">
      <textarea id="mc" rows="7" placeholder="Write your note here">${esc(n.content)}</textarea><small class="hint" id="wc"></small>
      <label class="lbl">Folder <select id="mf"><option value="">No folder</option>${opts}</select></label>
      <div class="lbl">Color <span class="dots" id="md">${dotsHTML(col)}</span></div>
      <div class="row"><button class="pri" id="ms" data-tip="Shortcut: Ctrl + S">💾 Save note</button><button id="mp"></button>${isNew ? '' : '<button id="ma">📁 Archive</button><button id="mr">🗑️ Trash</button>'}<button id="mx">Cancel</button></div>`);
    const snap = () => [$('#mt').value, $('#mc').value, col, pin, $('#mf').value].join('|');     // "litrato" ng laman ngayon
    const start = snap(); S.guard = () => snap() === start || confirm('Discard your unsaved changes?');   // kung iba na sa simula, magtatanong bago isara
    const count = () => { const v = $('#mc').value; $('#wc').textContent = `${v.trim().split(/\s+/).filter(Boolean).length} words, ${v.length} characters` };   // bilang ng salita
    const pinLabel = () => { $('#mp').textContent = pin ? '📌 Unpin' : '📌 Pin to top' };           // palitan ang label ng pin button
    count(); pinLabel(); $('#mt').focus(); $('#mc').oninput = count;
    $('#mp').onclick = () => { pin = !pin; pinLabel() };                                            // pin / unpin
    $('#md').onclick = e => { const b = e.target.closest('[data-c]'); if (b) { col = b.dataset.c; $('#md').innerHTML = dotsHTML(col) } };   // piliin ang kulay
    $('#mx').onclick = askClose;                                                                    // Cancel
    $('#ms').onclick = async () => {                                                                // SAVE
        const body = { title: $('#mt').value.trim() || 'Untitled', content: $('#mc').value, color: col, pinned: pin, folder_id: $('#mf').value || null };
        if (await (isNew ? api('/api/notes', 'POST', body) : api('/api/notes/' + n._id, 'PUT', body))) { closeModal(); toast('Note saved'); load() }
    };
    if (!isNew) {
        const mv = state => async () => {                                                           // Archive o Trash galing sa editor
            if (!await api('/api/notes/' + n._id, 'PUT', { state })) return;
            closeModal(); load();
            toast(state === 'archived' ? 'Note archived' : 'Moved to Trash', async () => { await api('/api/notes/' + n._id, 'PUT', { state: 'active' }); load() });   // may Undo
        };
        $('#ma').onclick = mv('archived'); $('#mr').onclick = mv('trashed');
    }
}
// FOLDER FORM: pang-gawa ng bagong folder (f = wala) O pang-rename (f = folder)
function folderForm(f) {
    modal(`<h2>${f ? 'Rename folder' : 'New folder'}</h2><input id="fn" placeholder="Folder name" maxlength="40" value="${esc(f ? f.name : '')}"><div class="row"><button class="pri" id="fs">${f ? '💾 Save name' : '+ Create folder'}</button><button id="fc">Cancel</button></div>`);
    $('#fn').focus(); $('#fc').onclick = closeModal;
    const make = async () => {
        const name = $('#fn').value.trim(); if (!name) return toast('Give the folder a name');   // bawal walang pangalan
        const ok = f ? await api('/api/folders/' + f._id, 'PUT', { name }) : await api('/api/folders', 'POST', { name, color: S.color, icon: ICONS[Math.floor(Math.random() * ICONS.length)] });
        if (ok) { closeModal(); toast(f ? 'Folder renamed' : 'Folder created'); load() }
    };
    $('#fs').onclick = make; $('#fn').onkeydown = e => { if (e.key === 'Enter') make() };   // Enter = i-save
}

// ---------- actions ----------
// Para sa mga button ng card: trash (itapon), restore (ibalik), purge (burahin nang tuluyan).
async function cardAction(a, el) {
    const prev = S.view === 'archive' ? 'archived' : 'active', id = el.dataset.id, base = (el.dataset.k === 'folder' ? '/api/folders/' : '/api/notes/') + id;
    if (a === 'purge' && !confirm('Delete forever? This cannot be undone.')) return;
    // Pinapatugtog muna ang animation ng pagkawala bago burahin.
    el.classList.add('leave'); await sleep(260);
    await (a === 'purge' ? api(base, 'DELETE') : api(base, 'PUT', { state: a === 'trash' ? 'trashed' : 'active' }));
    if (a === 'trash') toast('Moved to Trash', async () => { await api(base, 'PUT', { state: prev }); load() });   // may Undo
    else toast({ restore: 'Restored', purge: 'Deleted forever' }[a]);
    load();
}
// Magdagdag ng event (s) o task (t) sa napiling araw sa Calendar.
async function addCal(kind) {
    if (kind === 's') {
        const a = $('#ea').value.trim(); if (!a) return toast('Add an activity name');
        if (await api('/api/schedules', 'POST', { activity: a, date: S.day, start_time: $('#es').value, end_time: $('#ee').value })) toast('Event added'), load();
    } else {
        const t = $('#tt').value.trim(); if (!t) return toast('Type a task first');
        if (await api('/api/tasks', 'POST', { title: t, due_date: S.day })) toast('Task added'), load();
    }
}
// Magdagdag ng task mula sa To-do page (pwedeng walang due date).
async function addTodo() {
    const t = $('#tn').value.trim(); if (!t) return toast('Type a task first');
    if (await api('/api/tasks', 'POST', { title: t, due_date: $('#td').value || null })) { toast('Task added'); load() }
}
// ISANG listener para sa LAHAT ng pindot sa loob ng page (tinatawag na event delegation). Tinitingnan kung anong data-attribute ang pinindot, at doon nagde-desisyon.
$('#view').addEventListener('click', async e => {
    const t = e.target, q = s => t.closest(s);
    if (q('[data-a]') && q('.card')) return cardAction(q('[data-a]').dataset.a, q('.card'));
    if (q('[data-tab]')) { const [k, v] = q('[data-tab]').dataset.tab.split(':'); S[k] = v; S.enter = true; return render() }
    if (q('[data-new]')) return q('[data-new]').dataset.new === 'folder' ? folderForm() : editNote();
    if (q('[data-back]')) return go('home');
    if (q('[data-rename]')) return folderForm(S.folders.find(f => f._id === S.folder));      // Rename folder
    if (q('[data-tf]')) { S.tf = q('[data-tf]').dataset.tf; return render() }                   // To-do filter tabs
    if (q('[data-todo-add]')) return addTodo();                                                 // Add task (To-do page)
    if (q('[data-clear]')) {                                                                    // Clear completed tasks
        const d = S.tasks.filter(t => t.status === 'Completed'); if (!d.length) return toast('No finished tasks to clear');
        await Promise.all(d.map(t => api('/api/tasks/' + t._id, 'DELETE'))); toast('Finished tasks cleared'); return load();
    }
    if (q('[data-fa]')) { await api('/api/folders/' + S.folder, 'PUT', { state: q('[data-fa]').dataset.fa }); toast('Folder moved'); S.folder = null; S.enter = true; return load() }
    if (q('[data-empty]')) { if (!confirm('Delete everything in Trash forever?')) return; await Promise.all([...S.folders.filter(f => st(f) === 'trashed').map(f => api('/api/folders/' + f._id, 'DELETE')), ...S.notes.filter(n => visible(n, 'trashed')).map(n => api('/api/notes/' + n._id, 'DELETE'))]); toast('Trash emptied'); return load() }
    if (q('.card') && S.view !== 'trash') { const c = q('.card'); return c.dataset.k === 'folder' ? (S.folder = c.dataset.id, S.enter = true, render()) : editNote(S.notes.find(n => n._id === c.dataset.id)) }
    if (q('[data-m]')) { const d = +q('[data-m]').dataset.m; S.cal = d ? new Date(S.cal.getFullYear(), S.cal.getMonth() + d, 1) : new Date(); if (!d) S.day = iso(new Date()); S.enter = true; return render() }
    if (q('[data-day]')) { S.day = q('[data-day]').dataset.day; return render() }
    if (q('[data-add]')) return addCal(q('[data-add]').dataset.add);
    if (q('[data-ds]')) { await api('/api/schedules/' + q('[data-ds]').dataset.ds, 'DELETE'); return load() }
    if (q('[data-dt]')) { await api('/api/tasks/' + q('[data-dt]').dataset.dt, 'DELETE'); return load() }
});
// Kapag tinick o inuntick ang checkbox ng task, ina-update ang status sa database.
$('#view').addEventListener('change', async e => {
    const id = e.target.dataset.tog; if (!id) return;
    await api('/api/tasks/' + id, 'PUT', { status: e.target.checked ? 'Completed' : 'Pending' }); load();
});
// Enter key = magdagdag ng task/event, o buksan ang card na naka-focus.
$('#view').addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.id === 'tt') addCal('t'); if (e.key === 'Enter' && e.target.id === 'ea') addCal('s'); if (e.key === 'Enter' && e.target.id === 'tn') addTodo();
    if (e.key === 'Enter' && e.target.classList.contains('card')) e.target.click();
});
// Pindot sa sidebar menu = lipat ng page at linisin ang search.
$('#nav').onclick = e => { const b = e.target.closest('[data-v]'); if (b) { S.q = ''; $('#search').value = ''; go(b.dataset.v); load() } };
// Pindot sa 'New note' = bubukas ang editor.
$('#add-new').onclick = () => editNote();
// Pumili ng kulay para sa mga susunod na note at folder.
$('#dots').onclick = e => { const b = e.target.closest('[data-c]'); if (b) { S.color = b.dataset.c; store.set('color', S.color); $('#dots').innerHTML = dotsHTML(S.color); toast(`New items will be ${S.color}`) } };
// SEARCH: naghihintay ng 250ms pagkatapos mag-type bago mag-search para hindi mabigat (debounce).
let sd; $('#search').oninput = e => { clearTimeout(sd); sd = setTimeout(() => { S.q = e.target.value.trim(); if (S.view !== 'home' || S.folder) { S.view = 'home'; S.folder = null } load() }, 250) };
// Click sa madilim na background = isara ang popup.
$('#modal').onclick = e => { if (e.target.id === 'modal') askClose() };
// KEYBOARD SHORTCUTS: N = new note, / = search, Ctrl+S = save, Esc = close
addEventListener('keydown', e => {
    const open = !$('#modal').hidden, typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && open) { e.preventDefault(); const b = $('#ms'); if (b) b.click(); return }
    if (e.key === 'Escape') { if (open) askClose(); else if (S.folder) go('home'); return }
    if (typing || open || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'n') { e.preventDefault(); editNote() }
    if (e.key === '/') { e.preventDefault(); $('#search').focus() }
});

// ---------- theme ----------
// THEME: palitan ang light/dark mode at i-save ang napili.
const root = document.documentElement;
function setTheme(t) { root.dataset.theme = t; $('#theme').textContent = t === 'dark' ? '☀️ Light mode' : '🌙 Dark mode'; store.set('theme', t) }
$('#theme').onclick = () => setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark'); setTheme(store.get('theme', 'dark'));

// ---------- user name (pindutin para palitan) ----------
function setUser(n) { $('#uname').textContent = n; $('#uinit').textContent = n[0].toUpperCase(); store.set('user', n) }
$('#user').onclick = () => { const n = prompt('What should we call you?', $('#uname').textContent); if (n && n.trim()) setUser(n.trim().slice(0, 20)) };
setUser(store.get('user', 'Study Buddy'));

// ---------- falling petals & stars ----------
// FALLING EFFECTS: ang canvas ang pinagguguhitan ng petals at stars.
const cv = $('#fx'), cx = cv.getContext('2d'), MODES = ['both', 'petals', 'stars', 'off'];
let W, H, P = [], raf, mode = store.get('fx', matchMedia('(prefers-reduced-motion: reduce)').matches ? 'off' : 'both');
// Mga kulay ng stars (SC) at petals (PC).
const SC = ['#ff5c9a', '#4fb3e8', '#f6c453'], PC = ['#d98ea6', '#e8a5bb', '#f2bfcd'];
// Sinusunod ng canvas ang laki ng window.
const resize = () => { W = cv.width = innerWidth; H = cv.height = innerHeight }; addEventListener('resize', resize); resize();
// Gumagawa ng isang particle (isang star o petal) na may random na laki, bilis, kulay, at posisyon.
function mk(any) {
    const star = mode === 'stars' || (mode === 'both' && Math.random() < .5), pal = star ? SC : PC;
    return { star, x: Math.random() * W, y: any ? Math.random() * H : -24, s: star ? 6 + Math.random() * 8 : 4 + Math.random() * 6, vy: .4 + Math.random() * .9, w: Math.random() * 6.28, ws: .01 + Math.random() * .02, r: Math.random() * 6.28, vr: (Math.random() - .5) * .05, c: pal[Math.floor(Math.random() * 3)], a: .6 + Math.random() * .4 };
}
// Animation loop: gumagalaw at nagpipinta ng bawat particle, mga 60 beses kada segundo.
function frame() {
    cx.clearRect(0, 0, W, H);
    for (const p of P) {
        p.y += p.vy; p.w += p.ws; p.x += Math.sin(p.w) * .7; p.r += p.vr; if (p.y > H + 24) Object.assign(p, mk(false));
        cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r); cx.globalAlpha = p.a; cx.fillStyle = p.c; cx.beginPath();
        if (p.star) { cx.shadowColor = p.c; cx.shadowBlur = 10; for (let i = 0; i < 10; i++) { const r = i % 2 ? p.s / 2.3 : p.s, a = i * Math.PI / 5 - Math.PI / 2; cx.lineTo(Math.cos(a) * r, Math.sin(a) * r) } cx.closePath() }
        else cx.ellipse(0, 0, p.s * .5, p.s, 0, 0, 6.28);
        cx.fill(); cx.restore();
    }
    raf = requestAnimationFrame(frame);
}
// Palitan ang effect: both / petals / stars / off. Ina-update din ang label ng button.
function setMode(m, say) {
    mode = m; store.set('fx', m); $('#fx-mode').textContent = '🌸 Effect: ' + { both: 'Petals & Stars', petals: 'Petals only', stars: 'Stars only', off: 'Off' }[m]; cancelAnimationFrame(raf); cx.clearRect(0, 0, W, H);
    if (m !== 'off') { P = Array.from({ length: Math.min(45, Math.round(W / 30)) }, () => mk(true)); frame() }
    if (say) toast('Falling: ' + { both: 'petals & stars', petals: 'petals only', stars: 'stars only', off: 'off' }[m]);
}
// Bawat pindot ay lilipat sa susunod na effect.
$('#fx-mode').onclick = () => setMode(MODES[(MODES.indexOf(mode) + 1) % 4], true); setMode(mode);

// ---------- music player ----------
// MUSIC PLAYER: au = ang audio element; vol = ang volume slider.
const au = $('#au'), vol = $('#vol'); au.volume = +store.get('vol', 40) / 100; vol.value = au.volume * 100;
// Play kung naka-pause, pause kung tumutugtog.
$('#play').onclick = () => au.paused ? au.play().catch(() => toast('Could not play audio')) : au.pause();
// Kapag nagbago ang play/pause, palitan ang icon at gawing sumasayaw ang equalizer.
au.onplay = au.onpause = () => { const on = !au.paused; $('#play').textContent = on ? '❚❚' : '▶'; $('#player').classList.toggle('on', on) };
// Galawin ang slider = palitan ang lakas ng tunog at i-save.
vol.oninput = () => { au.volume = vol.value / 100; au.muted = false; $('#mute').textContent = '🔊'; store.set('vol', vol.value) };
// Mute / unmute.
$('#mute').onclick = () => { au.muted = !au.muted; $('#mute').textContent = au.muted ? '🔇' : '🔊' };
// Buksan ang file picker para makapili ng sariling kanta.
$('#load').onclick = () => $('#pick').click();
// Kapag may napiling kanta, ito na ang ipapatugtog (hindi ina-upload kahit saan).
$('#pick').onchange = e => { const f = e.target.files[0]; if (!f) return; au.src = URL.createObjectURL(f); $('#track').textContent = f.name.replace(/\.[^.]+$/, '').slice(0, 22); au.play(); toast('Playing your track') };

// ---------- start ----------
// SIMULA NG APP: kunin ang data pagbukas ng page, tapos ipakita ang paalala kung may schedule sa susunod na 24 oras.
load().then(() => api('/api/schedules/upcoming').then(r => r && r[0] && toast('⏰ ' + r[0].reminder)));
