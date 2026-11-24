/* ==========================================================================
   LOFI STUDY BUDDY — app.js  
   --------------------------------------------------------------------------
   Explantion ng joke (code)
   1. When the page opens, load() gets the data from the server (which uses the database).
   2. The data is kept in an object called S (the app's memory).
   3. render() draws the page on the screen using what is in S.
   4. When you click something, a function sends your change to the server, then load() runs again to refresh.
   PARTS OF THIS FILE: helpers > pages (Home, Folder, Archive/Trash, Calendar, To-do) > popups > actions > theme > effects > music
   SHORTCUTS: N = new note | / = search | Ctrl+S = save | Esc = close
   ========================================================================== */
// ===== Lofi Study Buddy — one file for data, pages, effects, and music =====
// Shortcuts: $('#id') finds one item on the page by its id. sleep(ms) waits for a number of milliseconds (1000 = 1 second).
const $ = s => document.querySelector(s), sleep = ms => new Promise(r => setTimeout(r, ms));
// esc = makes typed text safe to show on the page. It turns special characters like < and > into plain text so they cannot break the page.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// store = saves settings in the browser so they are not lost when the page refreshes. If saving is blocked, it uses the default value instead.
const store = { get: (k, d) => { try { return localStorage.getItem(k) ?? d } catch (e) { return d } }, set: (k, v) => { try { localStorage.setItem(k, v) } catch (e) {} } };
// List of note colors, and the emojis that can be used as a folder icon.
const COLORS = ['blue', 'pink', 'yellow', 'peach'], ICONS = ['📖', '📚', '🎬', '🎧', '✏️', '🧪', '🌸', '⭐'];
// Date helpers: pad = adds a 0 in front of single digits (5 → 05); iso = date written like this: 2026-11-18.
const pad = n => String(n).padStart(2, '0'), iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// fdate = shows the date as MM/DD/YYYY; ftime = shows the time like 12:00 PM.
const fdate = s => { const d = new Date(s); return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}` };
const ftime = s => new Date(s).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
// st = the status of an item: active, archived, or trashed. If it has none, it counts as 'active'.
const st = x => x.state || 'active';
// S = the app's memory. view = open page, color = picked color, q = search text, folder = open folder,
// notes / folders / tasks / sched = the lists from the database, cal = month shown in the calendar, day = chosen day,
// tf = chosen To-do tab, fr / nr = chosen time tab for folders / notes, guard = unsaved-changes check, enter = play the page opening effect.
const S = { view: store.get('view', 'home'), tf: 'all', guard: null, color: store.get('color', 'pink'), q: '', fr: 'week', nr: 'today', folder: null, notes: [], folders: [], tasks: [], sched: [], cal: new Date(), day: iso(new Date()), enter: true };

// TOAST = a small message at the bottom of the screen. If an undo function is given, an Undo button shows up too.
let tt;                                                                // timer that hides the message after a few seconds
function toast(m, undo) {
    const t = $('#toast'); t.textContent = m;                          // put the message text in
    if (undo) { const b = document.createElement('button'); b.textContent = 'Undo'; b.onclick = () => { t.classList.remove('show'); undo() }; t.append(b) }   // add the Undo button
    t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), undo ? 5000 : 2600);   // show it, then hide it (5 seconds with Undo, 2.6 seconds without)
}
// Talks to the server. If something goes wrong, it shows a message and returns null (the page does not crash).
async function api(url, method = 'GET', body) {                     // returns null (and shows a message) if anything goes wrong
    try {
        // Send the request to the server (GET = get data, POST = create, PUT = edit, DELETE = remove).
        const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
        if (r.status === 401) { location.href = '/login'; return null }   // (NEW) not logged in (or the login ran out): go to the login page
        const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Something went wrong'); return j;   // read the reply; if it is an error, show it below
    } catch (e) { toast(e instanceof TypeError ? 'Cannot reach Flask. Is it running?' : e.message); return null }   // cannot reach the server, or the server sent an error
}
// Gets ALL the data (notes, folders, tasks, schedules) from the database at once, then draws the page.
async function load() {
    // The 4 requests are sent at the same time so it is faster.
    const [n, f, t, s] = await Promise.all([api('/api/notes?q=' + encodeURIComponent(S.q)), api('/api/folders'), api('/api/tasks'), api('/api/schedules')]);
    S.notes = n || []; S.folders = f || []; S.tasks = t || []; S.sched = s || []; render();   // save the results (empty list if a request failed), then redraw
}
// Checks if a date fits the chosen Today / This Week / This Month tab.
function inR(d, r) {
    const t = new Date(d), n = new Date(), s = new Date(n.getFullYear(), n.getMonth(), n.getDate());   // t = the item's date, n = now, s = the start of today
    if (r === 'today') return t >= s;                                                                   // Today: from the start of today onward
    if (r === 'week') { const w = new Date(s); w.setDate(s.getDate() - s.getDay()); return t >= w }    // This Week: from this week's Sunday onward
    return t.getFullYear() === n.getFullYear() && t.getMonth() === n.getMonth();                        // This Month: same month and year as today
}
// Find the folder that a note belongs to.
const folderOf = n => S.folders.find(f => f._id === n.folder_id);
// Show a note only if it has the right status and its folder is not archived or trashed.
const visible = (n, state) => st(n) === state && (!n.folder_id || !folderOf(n) || st(folderOf(n)) === 'active');

// ---------- pages ----------
// Makes the 4 color circles (color picker). The one marked 'sel' is the chosen color.
const dotsHTML = cur => COLORS.map(c => `<button class="dot d-${c}${c === cur ? ' sel' : ''}" data-c="${c}" aria-label="${c}"></button>`).join('');
// Makes a heading with the Today / This Week / This Month tabs.
const sec = (t, key) => `<div class="sec"><h2>${t}</h2><div class="tabs">${[['today', 'Today'], ['week', 'This Week'], ['month', 'This Month']].map(([v, l]) => `<button data-tab="${key}:${v}" class="${S[key] === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>`;
// The dashed card button for creating something new (New folder / New Note).
const newCard = (k, ico, label) => `<button class="card new ${k === 'note' ? 'nn' : ''}" data-new="${k}"><span>${ico}</span>${label}</button>`;
// Makes the HTML of one card (a folder or a note). mode is home, archive, or trash — each mode shows different buttons.
function card(k, it, mode, i) {
    // c = the color class; x = the ✕ button (move to Trash), shown on the Home page only.
    const c = `c-${it.color || 'blue'}`, x = mode === 'home' ? '<button class="x" data-a="trash" data-tip="Move to Trash" aria-label="Move to Trash">✕</button>' : '';
    // Buttons at the bottom of the card: Archive page (Unarchive / Trash) and Trash page (Restore / Delete forever).
    const foot = mode === 'archive' ? '<div class="row"><button data-a="restore">Unarchive</button><button data-a="trash">Trash</button></div>'
        : mode === 'trash' ? '<div class="row"><button data-a="restore">Restore</button><button data-a="purge">Delete forever</button></div>' : '';
    const when = it.updated_at || it.created_at;                       // the date to show: last edited, or created if never edited
    // A folder card shows its icon, name, and date. A note card shows the pin, date, title, text, and time.
    return k === 'folder'
        ? `<article class="card folder ${c}" style="--i:${i}" data-k="folder" data-id="${it._id}" tabindex="0"><div class="ico">${it.icon || '📁'}</div>${x}<h3>${esc(it.name)}</h3><time>${fdate(when)}</time>${foot}</article>`
        : `<article class="card note ${c}" style="--i:${i}" data-k="note" data-id="${it._id}" tabindex="0"><time>${it.pinned ? '📌 ' : ''}${fdate(when)}</time>${x}<h3>${esc(it.title)}</h3><p>${esc(it.content)}</p><footer>⏱ ${ftime(when)}</footer>${foot}</article>`;
}
// Puts pinned notes first.
const byPin = (a, b) => !!b.pinned - !!a.pinned;
// Puts the cards inside a grid.
const grid = h => `<div class="grid">${h}</div>`;
// HOME PAGE: Recent Folders + My Notes (or the search results when something is typed in the search box).
function rHome() {
    // If there is a search, show only the matching active notes (pinned first).
    if (S.q) { const r = S.notes.filter(n => st(n) === 'active').sort(byPin); return `<div class="sec"><h2>Results for “${esc(S.q)}”</h2></div>` + (r.length ? grid(r.map((n, i) => card('note', n, 'home', i)).join('')) : '<p class="empty">No notes match your search.</p>') }
    const fo = S.folders.filter(f => st(f) === 'active' && inR(f.updated_at || f.created_at, S.fr));                          // fo = active folders in the chosen time tab
    const no = S.notes.filter(n => visible(n, 'active') && !n.folder_id && inR(n.updated_at || n.created_at, S.nr)).sort(byPin);   // no = active notes outside folders in the chosen time tab
    // Two sections (folders and notes), each with a "new" card at the end.
    return sec('Recent Folders', 'fr') + grid(fo.map((f, i) => card('folder', f, 'home', i)).join('') + newCard('folder', '📁', 'New folder'))
        + sec('My Notes', 'nr') + grid(no.map((n, i) => card('note', n, 'home', i)).join('') + newCard('note', '✏️', 'New Note'));
}
// INSIDE A FOLDER: its notes and its buttons (Back, Rename, Archive, Trash).
function rFolder() {
    const f = S.folders.find(x => x._id === S.folder); if (!f) { S.folder = null; return rHome() }   // if the folder is gone, go back to Home
    const ns = S.notes.filter(n => n.folder_id === f._id && st(n) === 'active').sort(byPin);          // ns = the active notes in this folder (pinned first)
    return `<div class="bar"><button class="pill" data-back>← Back to Home</button><h2>${f.icon || '📁'} ${esc(f.name)}</h2><button class="pill" data-rename>✏️ Rename</button><button class="pill" data-fa="archived">📁 Archive folder</button><button class="pill" data-fa="trashed">🗑️ Trash folder</button></div>`
        + grid(ns.map((n, i) => card('note', n, 'home', i)).join('') + newCard('note', '✏️', 'New Note'));
}
// ARCHIVE and TRASH pages. One function is used for both; the status tells them apart.
function rBin(state) {
    // fo = folders with this status; no = notes with this status; mode = which page we are on.
    const fo = S.folders.filter(f => st(f) === state), no = S.notes.filter(n => visible(n, state)), mode = state === 'archived' ? 'archive' : 'trash';
    const all = fo.map((f, i) => card('folder', f, mode, i)).join('') + no.map((n, i) => card('note', n, mode, i + fo.length)).join('');   // all the cards together (folders first, then notes)
    const empty = state === 'archived' ? 'Nothing archived yet. Archive a note from its editor.' : 'Trash is empty.';                          // message shown when there is nothing
    // The Trash page also shows an "Empty Trash" button when it has items. Then show the cards, or the empty message.
    return (mode === 'trash' && all ? '<div class="bar"><h2>Items in Trash</h2><button class="pill" data-empty>Empty Trash</button></div>' : '') + (all ? grid(all) : `<p class="empty">${empty}</p>`);
}
// CALENDAR PAGE: a grid for the month, and a side panel with the chosen day's schedule and tasks.
function rCal() {
    // y = year, m = month (0 to 11), first = weekday of the 1st (0 = Sunday), last = number of days in the month, today = today's date.
    const y = S.cal.getFullYear(), m = S.cal.getMonth(), first = new Date(y, m, 1).getDay(), last = new Date(y, m + 1, 0).getDate(), today = iso(new Date());
    // Makes the day boxes. The empty <i> items are blank spaces before the 1st day of the month.
    let cells = '<i></i>'.repeat(first);
    for (let d = 1; d <= last; d++) {
        // k = this day's date; e = number of events that day; t = number of tasks due that day. Small dots show them (up to 3 each).
        const k = `${y}-${pad(m + 1)}-${pad(d)}`, e = S.sched.filter(s => s.date === k).length, t = S.tasks.filter(x => x.due_date === k).length;
        cells += `<button class="day${k === today ? ' today' : ''}${k === S.day ? ' sel' : ''}" style="--i:${d % 7}" data-day="${k}">${d}<span>${'<b class="b-e"></b>'.repeat(Math.min(e, 3))}${'<b class="b-t"></b>'.repeat(Math.min(t, 3))}</span></button>`;
    }
    // ev = events of the chosen day; tk = tasks due that day; any = tasks with no due date.
    const ev = S.sched.filter(s => s.date === S.day), tk = S.tasks.filter(x => x.due_date === S.day), any = S.tasks.filter(x => !x.due_date);
    // One task line: checkbox, title, and delete button.
    const taskRow = t => `<div class="item${t.status === 'Completed' ? ' done' : ''}"><input type="checkbox" data-tog="${t._id}" ${t.status === 'Completed' ? 'checked' : ''}><span>${esc(t.title)}</span><button data-dt="${t._id}" aria-label="Delete task">✕</button></div>`;
    // label = the chosen day written out, like "Tuesday, November 24".
    const label = new Date(S.day + 'T00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    // Draws the month title with its buttons (previous, today, next), the weekday names, the day boxes,
    // then the side panel: the day's events, the add-event form, the tasks, and the add-task form.
    return `<div class="cal"><div><div class="bar" style="margin:0"><h2>${S.cal.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h2><button class="pill" data-m="-1" aria-label="Previous month">‹</button><button class="pill" data-m="0">Today</button><button class="pill" data-m="1" aria-label="Next month">›</button></div>
      <div class="days">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => `<div>${d}</div>`).join('')}${cells}</div></div>
      <div class="panel"><h2>${label}</h2><h3>Schedule</h3>
      ${ev.map(s => `<div class="item"><small>${s.start_time}–${s.end_time}</small><span>${esc(s.activity)}</span><button data-ds="${s._id}" aria-label="Delete event">✕</button></div>`).join('') || '<p class="empty" style="padding:0">No events.</p>'}
      <div class="frm"><input type="text" id="ea" placeholder="Activity"><input type="time" id="es" value="09:00"><input type="time" id="ee" value="10:00"><button class="pill pri" data-add="s">Add event</button></div>
      <h3>To-do</h3>${tk.map(taskRow).join('') + any.map(taskRow).join('') || '<p class="empty" style="padding:0">No tasks.</p>'}
      <div class="frm"><input type="text" id="tt" placeholder="New task for this day"><button class="pill pri" data-add="t">Add task</button></div></div></div>`;
}
// TO-DO PAGE: its own page for tasks (before, tasks were only in the Calendar).
function rTodo() {
    const today = iso(new Date()), total = S.tasks.length, done = S.tasks.filter(t => t.status === 'Completed').length;   // number of all tasks and finished tasks
    const list = S.tasks.filter(t => S.tf === 'all' || (S.tf === 'done') === (t.status === 'Completed'))                   // keep only the tasks that fit the All / Pending / Done tab
        .sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'));                                       // earliest due date first (no due date goes last)
    const row = t => {                                                                                                     // one task line
        const late = t.due_date && t.due_date < today && t.status !== 'Completed';                                         // is it past its due date and not done?
        return `<div class="item${t.status === 'Completed' ? ' done' : ''}"><input type="checkbox" data-tog="${t._id}" ${t.status === 'Completed' ? 'checked' : ''} aria-label="Mark as done"><span>${esc(t.title)}</span><small class="${late ? 'late' : ''}">${t.due_date ? (late ? 'Overdue: ' : 'Due ') + fdate(t.due_date + 'T00:00') : 'No due date'}</small><button data-dt="${t._id}" data-tip="Delete task" aria-label="Delete task">✕</button></div>`;
    };
    // Draws the title and Clear button, the progress bar, the add-task form, the All / Pending / Done tabs, and the task list.
    return `<div class="bar"><h2>To-do list</h2><button class="pill" data-clear data-tip="Delete all finished tasks">🧹 Clear completed</button></div>
      <div class="prog" aria-hidden="true"><i style="width:${total ? Math.round(done / total * 100) : 0}%"></i></div><p class="hint">${done} of ${total} tasks done</p>
      <div class="frm tf"><input type="text" id="tn" placeholder="What do you need to do?" maxlength="100"><input type="date" id="td" aria-label="Due date (optional)"><button class="pill pri" data-todo-add>+ Add task</button></div>
      <div class="tabs" style="margin:20px 0 12px">${[['all', 'All'], ['pending', 'Pending'], ['done', 'Done']].map(([v, l]) => `<button data-tf="${v}" class="${S.tf === v ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="list">${list.map(row).join('') || '<p class="empty">Nothing here yet. Add a task above.</p>'}</div>`;
}
// render = draws the correct page on the screen based on S.view. It runs every time the data changes.
function render() {
    const v = S.view;
    document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.v === v));   // highlight the menu button of the open page
    $('#title').textContent = { home: S.folder ? 'FOLDER' : 'MY NOTES', calendar: 'CALENDAR', todo: 'TO-DO LIST', archive: 'ARCHIVE', trash: 'TRASH' }[v];   // set the page title
    $('#dots').innerHTML = dotsHTML(S.color);                                                              // show the color circles
    // Remember what you are typing, so you do not lose it when the screen refreshes.
    const f = document.activeElement, keep = f && f.id && $('#view').contains(f) ? { id: f.id, val: f.value } : null;
    $('#view').className = S.enter ? 'enter' : ''; S.enter = false;                                       // play the page opening effect only when a new page was just opened
    // This is where the HTML of the chosen page is put on the screen.
    $('#view').innerHTML = ({ home: S.folder ? rFolder : rHome, calendar: rCal, todo: rTodo, archive: () => rBin('archived'), trash: () => rBin('trashed') })[v]();
    if (keep) { const e = document.getElementById(keep.id); if (e) { e.value = keep.val; e.focus() } }     // put back the text you were typing
}
// Switch to another page (Home / Calendar / To-do / Archive / Trash) and remember the last opened page.
function go(v) { S.view = v; store.set('view', v); S.folder = null; S.enter = true; render() }

// ---------- popups ----------
// MODAL = a popup window. Puts the popup's HTML in place and shows it.
function modal(h) { const m = $('#modal'); m.innerHTML = `<div class="box">${h}</div>`; m.hidden = false; requestAnimationFrame(() => m.classList.add('show')) }   // "show" is added right after, so the popup fades in
// Close the popup, but ask first if there are unsaved changes.
function askClose() { if (S.guard && !S.guard()) return; closeModal() }
// Close the popup with a fade-out.
function closeModal() { S.guard = null; const m = $('#modal'); m.classList.remove('show'); setTimeout(() => { m.hidden = true; m.innerHTML = '' }, 200) }
// NOTE EDITOR (popup). If n is empty, it makes a new note; if n has a note, it edits that note.
function editNote(n) {
    const isNew = !n; n = n || { title: '', content: '', folder_id: S.folder || '' };            // use a blank note if it is new
    let col = n.color || S.color, pin = !!n.pinned;                                                // the current color, and whether the note is pinned
    const opts = S.folders.filter(f => st(f) === 'active').map(f => `<option value="${f._id}"${f._id === n.folder_id ? ' selected' : ''}>${f.icon || '📁'} ${esc(f.name)}</option>`).join('');   // the list of folders to choose from
    // The popup: title box, text box, word count, folder choice, color choice, and the buttons (Archive and Trash only for existing notes).
    modal(`<h2>${isNew ? 'New note' : 'Edit note'}</h2><input id="mt" placeholder="Title" maxlength="80" value="${esc(n.title)}">
      <textarea id="mc" rows="7" placeholder="Write your note here">${esc(n.content)}</textarea><small class="hint" id="wc"></small>
      <label class="lbl">Folder <select id="mf"><option value="">No folder</option>${opts}</select></label>
      <div class="lbl">Color <span class="dots" id="md">${dotsHTML(col)}</span></div>
      <div class="row"><button class="pri" id="ms" data-tip="Shortcut: Ctrl + S">💾 Save note</button><button id="mp"></button>${isNew ? '' : '<button id="ma">📁 Archive</button><button id="mr">🗑️ Trash</button>'}<button id="mx">Cancel</button></div>`);
    const snap = () => [$('#mt').value, $('#mc').value, col, pin, $('#mf').value].join('|');     // a copy of everything written in the popup right now
    const start = snap(); S.guard = () => snap() === start || confirm('Discard your unsaved changes?');   // if it is different from the start, ask before closing
    const count = () => { const v = $('#mc').value; $('#wc').textContent = `${v.trim().split(/\s+/).filter(Boolean).length} words, ${v.length} characters` };   // count the words and characters
    const pinLabel = () => { $('#mp').textContent = pin ? '📌 Unpin' : '📌 Pin to top' };           // change the text of the pin button
    count(); pinLabel(); $('#mt').focus(); $('#mc').oninput = count;                               // show the counts and pin text, put the cursor in the title, and update the counts while typing
    $('#mp').onclick = () => { pin = !pin; pinLabel() };                                            // pin / unpin
    $('#md').onclick = e => { const b = e.target.closest('[data-c]'); if (b) { col = b.dataset.c; $('#md').innerHTML = dotsHTML(col) } };   // choose a color
    $('#mx').onclick = askClose;                                                                    // Cancel
    $('#ms').onclick = async () => {                                                                // SAVE: create the note if it is new, otherwise update it
        const body = { title: $('#mt').value.trim() || 'Untitled', content: $('#mc').value, color: col, pinned: pin, folder_id: $('#mf').value || null };
        if (await (isNew ? api('/api/notes', 'POST', body) : api('/api/notes/' + n._id, 'POST' === 'x' ? 'POST' : 'PUT', body))) { closeModal(); toast('Note saved'); load() }
    };
    if (!isNew) {
        const mv = state => async () => {                                                           // Archive or Trash from the editor
            if (!await api('/api/notes/' + n._id, 'PUT', { state })) return;
            closeModal(); load();
            toast(state === 'archived' ? 'Note archived' : 'Moved to Trash', async () => { await api('/api/notes/' + n._id, 'PUT', { state: 'active' }); load() });   // with an Undo button
        };
        $('#ma').onclick = mv('archived'); $('#mr').onclick = mv('trashed');
    }
}
// FOLDER FORM: a popup to make a new folder (when f is empty) OR to rename one (when f is a folder).
function folderForm(f) {
    modal(`<h2>${f ? 'Rename folder' : 'New folder'}</h2><input id="fn" placeholder="Folder name" maxlength="40" value="${esc(f ? f.name : '')}"><div class="row"><button class="pri" id="fs">${f ? '💾 Save name' : '+ Create folder'}</button><button id="fc">Cancel</button></div>`);
    $('#fn').focus(); $('#fc').onclick = closeModal;                                             // put the cursor in the name box; Cancel closes the popup
    const make = async () => {
        const name = $('#fn').value.trim(); if (!name) return toast('Give the folder a name');   // a folder must have a name
        // Rename if a folder was given; otherwise create a new one with the chosen color and a random icon.
        const ok = f ? await api('/api/folders/' + f._id, 'PUT', { name }) : await api('/api/folders', 'POST', { name, color: S.color, icon: ICONS[Math.floor(Math.random() * ICONS.length)] });
        if (ok) { closeModal(); toast(f ? 'Folder renamed' : 'Folder created'); load() }
    };
    $('#fs').onclick = make; $('#fn').onkeydown = e => { if (e.key === 'Enter') make() };   // the Save button or the Enter key saves the folder
}

// ---------- actions ----------
// For the card buttons: trash (move to Trash), restore (bring back), purge (delete forever).
async function cardAction(a, el) {
    // prev = the status to go back to if you press Undo; id = the item's id; base = the server address of this folder or note.
    const prev = S.view === 'archive' ? 'archived' : 'active', id = el.dataset.id, base = (el.dataset.k === 'folder' ? '/api/folders/' : '/api/notes/') + id;
    if (a === 'purge' && !confirm('Delete forever? This cannot be undone.')) return;               // ask before deleting forever
    // Play the fade-out effect first, then remove the card.
    el.classList.add('leave'); await sleep(260);
    await (a === 'purge' ? api(base, 'DELETE') : api(base, 'PUT', { state: a === 'trash' ? 'trashed' : 'active' }));   // delete it, or change its status
    if (a === 'trash') toast('Moved to Trash', async () => { await api(base, 'PUT', { state: prev }); load() });   // with an Undo button
    else toast({ restore: 'Restored', purge: 'Deleted forever' }[a]);
    load();
}
// Add an event (s) or a task (t) to the chosen day in the Calendar.
async function addCal(kind) {
    if (kind === 's') {
        const a = $('#ea').value.trim(); if (!a) return toast('Add an activity name');                 // an event needs a name
        if (await api('/api/schedules', 'POST', { activity: a, date: S.day, start_time: $('#es').value, end_time: $('#ee').value })) toast('Event added'), load();
    } else {
        const t = $('#tt').value.trim(); if (!t) return toast('Type a task first');                    // a task needs a title
        if (await api('/api/tasks', 'POST', { title: t, due_date: S.day })) toast('Task added'), load();
    }
}
// Add a task from the To-do page (it can have no due date).
async function addTodo() {
    const t = $('#tn').value.trim(); if (!t) return toast('Type a task first');
    if (await api('/api/tasks', 'POST', { title: t, due_date: $('#td').value || null })) { toast('Task added'); load() }
}
// ONE click handler for everything inside the page area. It checks what was clicked (by its data- name) and decides what to do.
$('#view').addEventListener('click', async e => {
    const t = e.target, q = s => t.closest(s);                                                  // t = what was clicked; q(selector) = finds the clicked item, or the closest one around it, that matches
    if (q('[data-a]') && q('.card')) return cardAction(q('[data-a]').dataset.a, q('.card'));   // card buttons: trash / restore / delete forever
    if (q('[data-tab]')) { const [k, v] = q('[data-tab]').dataset.tab.split(':'); S[k] = v; S.enter = true; return render() }   // Today / This Week / This Month tabs
    if (q('[data-new]')) return q('[data-new]').dataset.new === 'folder' ? folderForm() : editNote();   // "New folder" or "New Note" card
    if (q('[data-back]')) return go('home');                                                    // Back to Home
    if (q('[data-rename]')) return folderForm(S.folders.find(f => f._id === S.folder));      // Rename folder
    if (q('[data-tf]')) { S.tf = q('[data-tf]').dataset.tf; return render() }                   // To-do filter tabs
    if (q('[data-todo-add]')) return addTodo();                                                 // Add task (To-do page)
    if (q('[data-clear]')) {                                                                    // Clear completed tasks
        const d = S.tasks.filter(t => t.status === 'Completed'); if (!d.length) return toast('No finished tasks to clear');
        await Promise.all(d.map(t => api('/api/tasks/' + t._id, 'DELETE'))); toast('Finished tasks cleared'); return load();
    }
    if (q('[data-fa]')) { await api('/api/folders/' + S.folder, 'PUT', { state: q('[data-fa]').dataset.fa }); toast('Folder moved'); S.folder = null; S.enter = true; return load() }   // Archive or Trash the open folder
    if (q('[data-empty]')) { if (!confirm('Delete everything in Trash forever?')) return; await Promise.all([...S.folders.filter(f => st(f) === 'trashed').map(f => api('/api/folders/' + f._id, 'DELETE')), ...S.notes.filter(n => visible(n, 'trashed')).map(n => api('/api/notes/' + n._id, 'DELETE'))]); toast('Trash emptied'); return load() }   // Empty Trash
    if (q('.card') && S.view !== 'trash') { const c = q('.card'); return c.dataset.k === 'folder' ? (S.folder = c.dataset.id, S.enter = true, render()) : editNote(S.notes.find(n => n._id === c.dataset.id)) }   // click a card: open the folder, or open the note editor (not on the Trash page)
    if (q('[data-m]')) { const d = +q('[data-m]').dataset.m; S.cal = d ? new Date(S.cal.getFullYear(), S.cal.getMonth() + d, 1) : new Date(); if (!d) S.day = iso(new Date()); S.enter = true; return render() }   // Calendar buttons: previous month, today, next month
    if (q('[data-day]')) { S.day = q('[data-day]').dataset.day; return render() }               // pick a day in the Calendar
    if (q('[data-add]')) return addCal(q('[data-add]').dataset.add);                            // add an event or a task in the Calendar
    if (q('[data-ds]')) { await api('/api/schedules/' + q('[data-ds]').dataset.ds, 'DELETE'); return load() }   // delete an event
    if (q('[data-dt]')) { await api('/api/tasks/' + q('[data-dt]').dataset.dt, 'DELETE'); return load() }       // delete a task
});
// When a task checkbox is ticked or unticked, update the task's status in the database.
$('#view').addEventListener('change', async e => {
    const id = e.target.dataset.tog; if (!id) return;
    await api('/api/tasks/' + id, 'PUT', { status: e.target.checked ? 'Completed' : 'Pending' }); load();
});
// Enter key = add a task or an event, or open the card you selected with the keyboard.
$('#view').addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.id === 'tt') addCal('t'); if (e.key === 'Enter' && e.target.id === 'ea') addCal('s'); if (e.key === 'Enter' && e.target.id === 'tn') addTodo();
    if (e.key === 'Enter' && e.target.classList.contains('card')) e.target.click();
});
// Clicking a sidebar menu button = switch page and clear the search.
$('#nav').onclick = e => { const b = e.target.closest('[data-v]'); if (b) { S.q = ''; $('#search').value = ''; go(b.dataset.v); load() } };
// Clicking "New note" opens the editor.
$('#add-new').onclick = () => editNote();
// Choose a color for the next notes and folders.
$('#dots').onclick = e => { const b = e.target.closest('[data-c]'); if (b) { S.color = b.dataset.c; store.set('color', S.color); $('#dots').innerHTML = dotsHTML(S.color); toast(`New items will be ${S.color}`) } };
// SEARCH: waits 250 milliseconds after you stop typing before searching, so it does not search on every key press.
// If you are not on the Home page (or you are inside a folder), it goes back to Home first.
let sd; $('#search').oninput = e => { clearTimeout(sd); sd = setTimeout(() => { S.q = e.target.value.trim(); if (S.view !== 'home' || S.folder) { S.view = 'home'; S.folder = null } load() }, 250) };
// Clicking the dark background closes the popup.
$('#modal').onclick = e => { if (e.target.id === 'modal') askClose() };
// KEYBOARD SHORTCUTS: N = new note, / = search, Ctrl+S = save, Esc = close
addEventListener('keydown', e => {
    const open = !$('#modal').hidden, typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);   // open = is a popup open? typing = is the cursor in a text box?
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && open) { e.preventDefault(); const b = $('#ms'); if (b) b.click(); return }   // Ctrl+S while a popup is open = click Save
    if (e.key === 'Escape') { if (open) askClose(); else if (S.folder) go('home'); return }                       // Esc = close the popup, or leave the folder
    if (typing || open || e.ctrlKey || e.metaKey || e.altKey) return;                                             // ignore the keys below while typing, in a popup, or with Ctrl / Alt held
    if (e.key === 'n') { e.preventDefault(); editNote() }                                                         // N = new note
    if (e.key === '/') { e.preventDefault(); $('#search').focus() }                                               // / = go to the search box
});

// ---------- theme ----------
// THEME: switch between light and dark mode and remember the choice.
const root = document.documentElement;                                                              // root = the whole page
function setTheme(t) { root.dataset.theme = t; $('#theme').textContent = t === 'dark' ? '☀️ Light mode' : '🌙 Dark mode'; store.set('theme', t) }   // apply the mode, change the button text, and save it
$('#theme').onclick = () => setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark'); setTheme(store.get('theme', 'dark'));   // clicking the button switches the mode; at the start, use the saved mode (dark if none)

// ---------- account (NEW) ----------
// The username at the top comes from the server (see index.html), so nothing needs to be done here.
// LOG OUT: tell the server to end the login, then go back to the login page.
$('#logout').onclick = async () => { await api('/api/logout', 'POST'); location.href = '/login' };

// ---------- falling petals & stars ----------
// FALLING EFFECTS: the drawing area is where the petals and stars are drawn.
// cv = the drawing area, cx = the "pen" used to draw on it, MODES = the effect choices.
const cv = $('#fx'), cx = cv.getContext('2d'), MODES = ['both', 'petals', 'stars', 'off'];
// W, H = window width and height; P = the list of falling items; raf = used to stop the drawing loop;
// mode = the saved effect (it starts as 'off' if the device is set to reduce motion).
let W, H, P = [], raf, mode = store.get('fx', matchMedia('(prefers-reduced-motion: reduce)').matches ? 'off' : 'both');
// Colors of the stars (SC) and the petals (PC).
const SC = ['#ff5c9a', '#4fb3e8', '#f6c453'], PC = ['#d98ea6', '#e8a5bb', '#f2bfcd'];
// Keeps the drawing area the same size as the window.
const resize = () => { W = cv.width = innerWidth; H = cv.height = innerHeight }; addEventListener('resize', resize); resize();
// Makes one falling item (a star or a petal) with a random size, speed, color, and position.
function mk(any) {
    const star = mode === 'stars' || (mode === 'both' && Math.random() < .5), pal = star ? SC : PC;   // decide if it is a star, and pick its colors
    // x, y = position (any = start anywhere on the screen, otherwise just above the top); s = size; vy = falling speed;
    // w, ws = side-to-side sway; r, vr = rotation; c = color; a = how faint it looks.
    return { star, x: Math.random() * W, y: any ? Math.random() * H : -24, s: star ? 6 + Math.random() * 8 : 4 + Math.random() * 6, vy: .4 + Math.random() * .9, w: Math.random() * 6.28, ws: .01 + Math.random() * .02, r: Math.random() * 6.28, vr: (Math.random() - .5) * .05, c: pal[Math.floor(Math.random() * 3)], a: .6 + Math.random() * .4 };
}
// Moves and draws every falling item, about 60 times per second.
function frame() {
    cx.clearRect(0, 0, W, H);                                                                       // erase the last picture
    for (const p of P) {
        // Move the item down, sway it sideways, and rotate it. When it falls off the bottom, replace it with a new one at the top.
        p.y += p.vy; p.w += p.ws; p.x += Math.sin(p.w) * .7; p.r += p.vr; if (p.y > H + 24) Object.assign(p, mk(false));
        // Draw the item: move to its spot, rotate it, and set its color and faintness.
        cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r); cx.globalAlpha = p.a; cx.fillStyle = p.c; cx.beginPath();
        // A star is drawn as a glowing 10-point shape; a petal is drawn as an oval.
        if (p.star) { cx.shadowColor = p.c; cx.shadowBlur = 10; for (let i = 0; i < 10; i++) { const r = i % 2 ? p.s / 2.3 : p.s, a = i * Math.PI / 5 - Math.PI / 2; cx.lineTo(Math.cos(a) * r, Math.sin(a) * r) } cx.closePath() }
        else cx.ellipse(0, 0, p.s * .5, p.s, 0, 0, 6.28);
        cx.fill(); cx.restore();                                                                    // color in the shape, then reset the pen
    }
    raf = requestAnimationFrame(frame);                                                             // ask the browser to run this again for the next picture
}
// Change the effect: both / petals / stars / off. It also updates the button text.
function setMode(m, say) {
    // Save the choice, change the button text, and stop and erase the current drawing.
    mode = m; store.set('fx', m); $('#fx-mode').textContent = '🌸 Effect: ' + { both: 'Petals & Stars', petals: 'Petals only', stars: 'Stars only', off: 'Off' }[m]; cancelAnimationFrame(raf); cx.clearRect(0, 0, W, H);
    if (m !== 'off') { P = Array.from({ length: Math.min(45, Math.round(W / 30)) }, () => mk(true)); frame() }   // unless it is off, make the items (up to 45, fewer on small screens) and start drawing
    if (say) toast('Falling: ' + { both: 'petals & stars', petals: 'petals only', stars: 'stars only', off: 'off' }[m]);   // show a message only when the user changed it
}
// Each click moves to the next effect. At the start, use the saved effect.
$('#fx-mode').onclick = () => setMode(MODES[(MODES.indexOf(mode) + 1) % 4], true); setMode(mode);

// ---------- music player ----------
// MUSIC PLAYER: au = the audio (the song); vol = the volume slider.
const au = $('#au'), vol = $('#vol'); au.volume = +store.get('vol', 40) / 100; vol.value = au.volume * 100;   // use the saved volume (40 if none)
// Play if paused; pause if playing. Show a message if playing fails.
$('#play').onclick = () => au.paused ? au.play().catch(() => toast('Could not play audio')) : au.pause();
// When the music starts or stops: change the button icon, and make the three bars move or stop.
au.onplay = au.onpause = () => { const on = !au.paused; $('#play').textContent = on ? '❚❚' : '▶'; $('#player').classList.toggle('on', on) };
// Moving the slider changes the volume, turns off mute, and saves the volume.
vol.oninput = () => { au.volume = vol.value / 100; au.muted = false; $('#mute').textContent = '🔊'; store.set('vol', vol.value) };
// Mute / unmute.
$('#mute').onclick = () => { au.muted = !au.muted; $('#mute').textContent = au.muted ? '🔇' : '🔊' };
// Open the file chooser so you can pick your own song.
$('#load').onclick = () => $('#pick').click();
// When a song is picked, play it (it is not uploaded anywhere). Its name is shown without the file ending, cut to 22 characters.
$('#pick').onchange = e => { const f = e.target.files[0]; if (!f) return; au.src = URL.createObjectURL(f); $('#track').textContent = f.name.replace(/\.[^.]+$/, '').slice(0, 22); au.play(); toast('Playing your track') };

// ---------- start ----------
// START OF THE APP: get the data when the page opens, then show a reminder if there is a schedule in the next 24 hours.
load().then(() => api('/api/schedules/upcoming').then(r => r && r[0] && toast('⏰ ' + r[0].reminder)));
