// DLog — on-device audit ring buffer for debugging sync/signing on phones,
// where there is no devtools console. Zero dependencies, loaded FIRST so
// every other module can `window.DLog?.push(tag, msg)` unconditionally.
//
// - Ring of MAX entries, persisted to localStorage (throttled) so a reload
//   or PWA restart keeps the trail that led up to it.
// - Captures window.onerror / unhandledrejection globally.
// - Surfaced in the sync panel ("Logs" view) with a Copy button; users paste
//   the text into a bug report / chat.
(function () {
    'use strict';

    const LS_KEY = 'roady_dlog';
    const MAX = 400;

    let entries = [];
    try {
        const saved = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
        if (Array.isArray(saved)) entries = saved.slice(-MAX);
    } catch (_) {}

    let saveTimer = null;
    function scheduleSave() {
        if (saveTimer) return;
        saveTimer = setTimeout(() => {
            saveTimer = null;
            try { localStorage.setItem(LS_KEY, JSON.stringify(entries)); } catch (_) {}
        }, 1000);
    }

    function fmtTime(t) {
        const d = new Date(t);
        const p = (n, w) => String(n).padStart(w, '0');
        return `${p(d.getHours(), 2)}:${p(d.getMinutes(), 2)}:${p(d.getSeconds(), 2)}.${p(d.getMilliseconds(), 3)}`;
    }

    window.DLog = {
        push(tag, msg) {
            try {
                entries.push({ t: Date.now(), tag: String(tag), msg: String(msg) });
                if (entries.length > MAX) entries.splice(0, entries.length - MAX);
                scheduleSave();
                // Mirror to console for desktop debugging.
                console.debug(`[${tag}]`, msg);
            } catch (_) {}
        },

        // Newest-last formatted text (chronological — easiest to read a trail).
        text() {
            if (!entries.length) return '(log is empty)';
            const head = `roady debug log — ${new Date().toISOString()} — ${navigator.userAgent}\n`;
            return head + entries.map(e => `${fmtTime(e.t)} [${e.tag}] ${e.msg}`).join('\n');
        },

        // Snapshot for UI rendering, newest first.
        list() {
            return entries.slice().reverse().map(e => ({ ts: e.t, tag: e.tag, msg: e.msg }));
        },

        clear() {
            entries = [];
            try { localStorage.removeItem(LS_KEY); } catch (_) {}
        },
    };

    window.addEventListener('error', (e) => {
        window.DLog.push('js', `ERROR ${e.message} @ ${e.filename}:${e.lineno}`);
    });
    window.addEventListener('unhandledrejection', (e) => {
        const r = e.reason;
        window.DLog.push('js', `UNHANDLED ${r?.message || r}`);
    });

    window.DLog.push('app', `boot — online=${navigator.onLine} visible=${document.visibilityState}`);
})();
