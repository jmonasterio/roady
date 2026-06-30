// Nostr-based authentication interface — MNA1 (per-request signed envelopes).
//
// Phase C.10 rewrite. Replaces the /auth/session Bearer-token flow with
// per-request Nostr envelopes per MNA1 spec (see mycouch-rs/PLAN.md
// "MNA1 — MyCouch Nostr Auth v1"). No tokens, no KV cache, no IdP.
//
// HTTP requests carry `Authorization: Nostr <base64(NIP-98 event)>` with
// a `payload` tag (sha256-hex of body) iff the body is non-empty.
// WebSocket envelopes are passed inside the `hello`/`reauth` frames; sync.js
// owns those — call `signMna1(url, method, body?)` to mint one.

window.Auth = {
    _auth: null,                // NostrAuth instance (set by login flow)
    _mycouchBaseUrl: null,      // Optional; kept for diagnostics + callers

    // ---------------------------------------------------------------
    // Setup
    // ---------------------------------------------------------------
    setAuth(nostrAuth) {
        this._auth = nostrAuth;
    },

    setMycouchBaseUrl(url) {
        // Accepts:
        //   ''            → same-origin: `${location.origin}/__api__`
        //   '/__api__'    → resolve against `location.origin`
        //   'https://…'   → use verbatim (trailing slash trimmed)
        //   'host.tld'    → prepend `http://`
        let n = String(url || '').trim().replace(/\/+$/, '');
        if (!n) n = '/__api__';
        if (n.startsWith('/')) n = (location.origin + n).replace(/\/+$/, '');
        else if (!/^https?:\/\//i.test(n)) n = 'http://' + n;
        this._mycouchBaseUrl = n;
    },

    getMycouchBaseUrl() {
        // Returns the resolved base URL. Defaults to `${location.origin}/__api__`
        // when `setMycouchBaseUrl` hasn't been called yet, so callers never
        // see an empty string and accidentally fetch the SPA's index.html.
        return this._mycouchBaseUrl
            || (location.origin + '/__api__');
    },

    // ---------------------------------------------------------------
    // Identity
    // ---------------------------------------------------------------
    isAuthenticated() {
        return !!this._auth?.getActivePubkey();
    },

    getPubkey() {
        return this._auth?.getActivePubkey() || null;
    },

    getUser() {
        const p = this.getPubkey();
        return p ? { id: p, pubkey: p } : null;
    },

    getUserId() {
        return this.getPubkey();
    },

    // sha256(pubkey_hex_lowercase). Matches Python MyCouch's `user_hash`
    // convention; server-side cf-auth derives the same value.
    async getUserHash() {
        const p = this.getPubkey();
        if (!p) return null;
        return await _sha256Hex(p.toLowerCase());
    },

    async waitForAuth(maxWait = 30000) {
        const start = Date.now();
        while (!this.isAuthenticated() && Date.now() - start < maxWait) {
            await new Promise(r => setTimeout(r, 200));
        }
        return this.isAuthenticated();
    },

    getAuthStatus() {
        return {
            isAvailable: !!this._auth,
            isAuthenticated: this.isAuthenticated(),
            pubkey: this.getPubkey(),
            // No session/token under MNA1.
            hasSession: this.isAuthenticated(),
        };
    },

    // MNA1 has no token to fail — every request signs fresh. Kept for
    // backwards compat with app.js call sites that gate retry loops on it.
    isAuthPermanentlyFailed() {
        return false;
    },

    // ---------------------------------------------------------------
    // MNA1 — sign an envelope for a given (url, method, body).
    //
    // `url` for HTTP: the absolute fetch URL (must match what the server
    //   sees in `req.url()` — Cloudflare returns the full URL including
    //   scheme + host + port + path + query).
    // `url` for WS:   the relative path the server forms in `ws_url_for`,
    //   e.g. `/roady/_ws` or `/roady/_ws?tenant=t_abc`.
    // `body`:        request body bytes (string, Uint8Array, or null).
    //                Required iff non-empty; MUST be omitted otherwise
    //                (server rejects asymmetric envelopes).
    // ---------------------------------------------------------------
    async signMna1(url, method, body = null) {
        if (!this._auth) throw new Error('Nostr auth not available');
        // The same-origin Pages Function at /__api__/[[path]] strips that
        // prefix before forwarding via service binding, so the bound worker
        // observes the URL without `/__api__`. Sign against the post-rewrite
        // URL — otherwise the envelope's `u` tag mismatches `req.url()` and
        // the worker returns `request_mismatch`. WS callers pass relative
        // signing paths (no prefix) and bypass this transform.
        let signUrl = url;
        if (/^https?:\/\//i.test(url)) {
            try {
                const u = new URL(url);
                u.pathname = u.pathname.replace(/^\/__api__/, '') || '/';
                signUrl = u.toString();
            } catch (_) { /* fall through with original */ }
        }
        const tags = [
            ['u', signUrl],
            ['method', String(method).toUpperCase()],
        ];
        const bytes = _bodyBytes(body);
        if (bytes && bytes.length > 0) {
            tags.push(['payload', await _sha256HexBytes(bytes)]);
        }
        const event = {
            kind: 27235,
            content: '',
            tags,
            created_at: Math.floor(Date.now() / 1000),
        };
        const signed = await this._auth.sign(event);
        // btoa is binary-safe for the ASCII JSON produced here. No
        // non-Latin-1 characters survive the JSON serialization of an
        // event (pubkey, sig, ids are all hex; tags are ASCII).
        return btoa(JSON.stringify(signed));
    },

    // ---------------------------------------------------------------
    // Fetch wrappers — add MNA1 envelope to an outgoing request.
    //
    // `authenticatedFetch` returns *options* (legacy shape, used by code
    // that wants to inspect headers before sending). `fetchWithAuth`
    // actually performs the fetch.
    // ---------------------------------------------------------------
    async authenticatedFetch(url, options = {}) {
        const method = (options.method || 'GET').toUpperCase();
        const body = options.body ?? null;
        const envelope = await this.signMna1(url, method, body);
        return {
            ...options,
            headers: {
                ...(options.headers || {}),
                Authorization: 'Nostr ' + envelope,
            },
        };
    },

    async fetchWithAuth(url, options = {}) {
        const authed = await this.authenticatedFetch(url, options);
        return fetch(url, authed);
    },

    // ---------------------------------------------------------------
    // Compat shims — MNA1 has no Bearer token. Callers that still ask
    // for one (invitation accept flow, settings diagnostics display)
    // belong to C.11 / tenant-manager territory. Return null with a
    // deprecation warning so the failure mode is visible, not silent.
    // ---------------------------------------------------------------
    async getToken() {
        console.warn('[Auth] getToken() returns null under MNA1; switch the caller to fetchWithAuth() or signMna1().');
        return null;
    },
    async getAuthToken() {
        return await this.getToken();
    },

    logout() {
        if (this._auth) this._auth.logoutAll();
    },
};

// ============================================================
// Helpers — kept module-local; no need to leak onto window.
// ============================================================

function _bodyBytes(body) {
    if (body == null) return null;
    if (typeof body === 'string') {
        return body.length === 0 ? null : new TextEncoder().encode(body);
    }
    if (body instanceof Uint8Array) return body.length === 0 ? null : body;
    if (body instanceof ArrayBuffer) {
        return body.byteLength === 0 ? null : new Uint8Array(body);
    }
    // Blob / FormData / ReadableStream are not used in this codebase; if
    // they ever are, hash them upstream and pass Uint8Array here.
    throw new Error('signMna1: unsupported body type ' + (typeof body));
}

async function _sha256HexBytes(bytes) {
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, '0')).join('');
}

async function _sha256Hex(str) {
    return await _sha256HexBytes(new TextEncoder().encode(str));
}
