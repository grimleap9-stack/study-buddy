/* ==========================================================================
   LOFI STUDY BUDDY — auth.js  (the logic of the login / create-account page)
   What it does:
   1. Switches between the "Log in" and "Create account" tabs.
   2. Sends the username + password to Flask (/api/login or /api/register).
   3. If Flask says OK, sends the browser to the app ("/"); if not, shows the error.
   ========================================================================== */
const $ = s => document.querySelector(s);                         // shortcut: $('#id') = get one HTML element
let mode = 'login';                                               // current tab: 'login' or 'register' (also the name of the Flask route)

// Use the same light/dark theme the user picked inside the app (it is saved in the browser).
try { document.documentElement.dataset.theme = localStorage.getItem('theme') || 'dark' } catch (e) {}

// Text that changes between the two tabs.
const TEXT = {
    login:    { title: 'Welcome back',       sub: 'Log in to see your notes, tasks and schedule.',         btn: 'Log in',         pass: 'current-password' },
    register: { title: 'Create your account', sub: 'Pick a username and password. Your notes stay private to you.', btn: 'Create account', pass: 'new-password' },
};

// Show an error message (textContent is used on purpose: it can never run HTML/JS).
function showError(msg) { $('#au-err').textContent = msg || '' }

// Switch the tab: update the texts, show/hide the "Confirm password" box, clear old errors.
function setMode(m) {
    mode = m;
    document.querySelectorAll('.auth-tabs button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
    $('#auth-title').textContent = TEXT[m].title;
    $('#auth-sub').textContent = TEXT[m].sub;
    $('#au-btn').textContent = TEXT[m].btn;
    $('#au-pass').autocomplete = TEXT[m].pass;                    // helps password managers decide: save new password or fill an old one
    $('#au-confirm').hidden = m !== 'register';
    showError('');
}

// Click on a tab.
document.querySelector('.auth-tabs').onclick = e => { const b = e.target.closest('[data-mode]'); if (b) setMode(b.dataset.mode) };

// "Show password" checkbox: switch the inputs between hidden dots and plain text.
$('#au-show').onchange = e => { $('#au-pass').type = $('#au-pass2').type = e.target.checked ? 'text' : 'password' };

// Submit (button click or Enter key).
$('#auth-form').onsubmit = async e => {
    e.preventDefault();                                           // stop the browser from reloading the page
    const username = $('#au-user').value.trim(), password = $('#au-pass').value;
    if (!username || !password) return showError('Please type your username and password.');
    if (mode === 'register' && password !== $('#au-pass2').value) return showError('The two passwords do not match.');
    $('#au-btn').disabled = true; showError('');                  // disable the button so it can't be double-clicked
    try {
        const r = await fetch('/api/' + mode, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Something went wrong');
        location.href = '/';                                      // logged in! go to the app
    } catch (err) {
        showError(err instanceof TypeError ? 'Cannot reach the server. Is Flask running?' : err.message);
        $('#au-btn').disabled = false;
    }
};

$('#au-user').focus();
