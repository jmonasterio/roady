// Alpine.js main application
// Max device keys retained per roster member. Issuing an Add-device invite
// beyond this FIFO-evicts the oldest key (revoking its tenant access) so the
// list can't grow without bound. Tunable.
const MAX_DEVICES_PER_MEMBER = 5;
; document.addEventListener('alpine:init', () => {
    Alpine.data('roady', () => ({
        // State
        currentView: 'gigs',
        bandTab: 'members', // 'members' | 'info' | 'options' | 'trash'
        equipmentTab: 'catalog', // 'catalog' or 'templates'
        equipment: [],
        gigTypes: [],
        gigs: [],
        selectedGigId: null,
        selectedGig: null,
        gigChecklistMode: null, // 'leavingForGig' or 'leavingFromGig'

        // Set list feature state
        setlistTab: 'songs', // 'songs' or 'templates'
        songs: [],
        setlistTemplates: [],
        showAddSong: false,
        editingSong: null,
        newSong: { title: '', artist: '', durationSec: 0, key: '', bpm: 0, lead: '', notes: '' },
        songDurationInput: '', // mm:ss text bound in the form
        // Template editor (also reused for the gig instance editor)
        editingSetlist: null,        // the template/instance doc being edited
        editingSetlistKind: null,    // 'template' | 'instance'
        // Gig set list
        gigSetlist: null,            // setlist instance for selectedGig (or null)
        setlistMode: 'view',         // 'view' | 'edit' for the gig set list panel
        showGigSetlist: false,       // gig set list dialog open
        performanceSetlist: null,    // setlist doc rendered full-screen, or null

        // Deleted items state
        deletedItems: {
            gigs: [],
            equipment: [],
            templates: []
        },
        trashCurrentPage: {
            gigs: 1,
            equipment: 1,
            templates: 1
        },
        trashItemsPerPage: 10,

        // Tenant state
        showTenantSelection: false,
        tenantIdInput: 'demo',

        // Band state
        userBands: [],
        currentBandTenantId: null,
        currentBandName: '',
        showCreateBandDialog: false,
        showBandSwitcher: false,
        newBandName: '',
        bandBeingEdited: { name: '' },
        bandNameOriginal: '',
        currentBandMembers: [],
        bandMembers: [],
        showAddBandMember: false,
        newBandMember: { name: '', role: '' },
        addMemberAsSelf: false,   // "This is me" toggle in the add-member form
        editingBandMember: null,
        isCreatingBand: false,  // Prevent double submission
        
        // Invitation state (Members tab)
        showInviteMemberDialog: false,
        showGeneratedInviteLink: false,
        inviteMemberEmail: '',
        inviteMemberRole: 'member',
        generatedInviteLink: '',
        generatedInviteToken: '',
        inviteMessageTemplate: '',
        inviteCopied: false,
        messageCopied: false,

        // Invite → roster linkage (Members tab). Assign an invite to an existing
        // roster person, or create one inline. '__new__' selects inline-create.
        inviteRosterMemberId: '',
        inviteNewMemberName: '',
        inviteNewMemberRole: '',
        // Invite flow mode: 'new' | 'add' (extra device) | 'replace' (lost device).
        inviteMode: 'new',

        // Authentication state
        isAuthenticated: false,
        nostrAvatarHtml:  '',
        nostrDisplayName: '',
        nostrNpub:        '',

        // Resolved identity helpers. rosterHashMap: raw user_hash → { name, role }
        // built from the roster's device keys. _hasNostrProfile / _nostrProfile:
        // whether the active key has a real kind-0 (and its cached profile).
        // Nav precedence: roster-linked identity → nostr profile → "You".
        rosterHashMap: {},
        _hasNostrProfile: false,
        _nostrProfile: null,
        
        // Retry state — exponential backoff so we don't hammer the remote
        // nostr signer (every reconnect attempt signs an auth event).
        isRetrying: false,
        retryTimer: null,
        retryAttempt: 0,
        signerOffline: false,
        // Identity restored but the signer refuses to sign (NIP-46 "no
        // permission"). Distinct from signerOffline (network/relay): this is a
        // permission grant problem, fixed only by a fresh handshake, not retry.
        signerDenied: false,

        // UI state
        showAddEquipment: false,
        showAddGigType: false,
        showAddGig: false,
        editingEquipment: null,
        editingGigType: null,
        editingGig: null,
        showAddItemToGig: false,
        showAddToGigTypeConfirm: false,
        showPastGigs: false,
        showLoadedItems: false,
        showPackedItems: false,
        isLoading: true,

        // Form data
        newEquipment: {
            name: '',
            description: ''
        },
        newGigType: {
            name: '',
            equipment: []  // Array of { equipmentId, quantity }
        },
        newGig: {
            name: '',
            date: '',
            gigTypeId: '',
            arrivalTime: '18:00',
            doorsOpenTime: '19:00',
            mapLink: ''
        },
        // Per-field time snapshot at focus — lets timePmCoerce distinguish a
        // fresh entry (field was empty; browser defaulted the meridiem to AM)
        // from a deliberate edit of an existing value.
        _timeFocusPrev: {},
        newItemForGig: {
            equipmentId: '',
            newEquipmentName: '',
            addedEquipmentId: null,
            addedEquipmentName: ''
        },
        options: {
            mycouchBaseUrl: '',
            tenantId: ''
        },
        currentDbName: '',
        currentSessionToken: '',
        sessionCopied: false,
        syncStatus: 'idle',
        syncError: null,
        syncRetryCount: 0,

        // Sync status panel: last few errors (newest first), open state,
        // and the queued-writes count shown when the dot is clicked.
        syncErrorLog: [],
        showSyncPanel: false,
        pendingCount: 0,

        // Confirmation dialog state
        confirmationDialog: {
            isOpen: false,
            title: '',
            message: '',
            confirmText: 'Confirm',
            cancelText: 'Cancel',
            action: null,
            isDangerous: false
        },

        // Diagnostics state
        showDiagnostics: false,
        diagnosticsResults: {
            jwtClaim: null,
            mycouchResponse: null,
            error: null
        },

        // Snackbar state
        snackbar: {
            isOpen: false,
            message: '',
            action: null,
            timeout: null
        },

        // Check for pending invitation token in sessionStorage
        checkPendingInvitation() {
            const pendingToken = sessionStorage.getItem('pendingInviteToken');
            if (pendingToken) {
                console.log('📬 Found pending invitation token in sessionStorage');
                return pendingToken;
            }
            return null;
        },

        // Parse invite_token from URL and store in sessionStorage
        // This runs BEFORE nostr auth, so token survives any redirects
        parseInviteTokenFromUrl() {
            const urlParams = new URLSearchParams(window.location.search);
            const inviteToken = urlParams.get('invite_token');
            
            if (inviteToken) {
                console.log('🔗 Parsing invite_token from URL');
                sessionStorage.setItem('pendingInviteToken', inviteToken);
                
                // Clean URL (remove the token parameter)
                const newUrl = new URL(window.location);
                newUrl.searchParams.delete('invite_token');
                window.history.replaceState({}, document.title, newUrl);
                
                return inviteToken;
            }
            return null;
        },

        // Accept invitation after user is authenticated
        async acceptPendingInvitation(token) {
            try {
                console.log('📬 Accepting pending invitation...');
                if (!window.Auth?.isAuthenticated()) {
                    console.warn('⚠️ Not authenticated; cannot accept invitation');
                    return false;
                }

                // Use the resolved base (defaults to `${origin}/__api__`), NOT the
                // raw option — an empty option targets same-origin `/api/...`,
                // which Cloudflare Pages answers with a bodyless 405 for PATCH.
                const baseUrl = window.Auth.getMycouchBaseUrl().replace(/\/$/, '');
                const response = await window.Auth.fetchWithAuth(
                    `${baseUrl}/api/invitations/accept`,
                    {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ token }),
                    },
                );

                if (response.ok) {
                    const result = await response.json();
                    console.log('✅ Invitation accepted:', result);

                    // Clear the token from sessionStorage
                    sessionStorage.removeItem('pendingInviteToken');

                    // Adopt the accepted tenant into the TenantManager's
                    // in-memory list. No local Pouch write needed under MNA1 —
                    // the next /api/my-tenants pull confirms it server-side.
                    const accepted = await window.tenantManager?.addOrUpdateTenant(result);
                    const tenantId = accepted?._id || result._id || result.tenant_id;

                    // Update local band list
                    if (tenantId && !this.userBands.find(b => b._id === tenantId)) {
                        this.userBands.push(accepted || result);
                        console.log('✅ Added accepted tenant to userBands:', tenantId);
                    }
                    
                    // Switch to the new band
                    // Use _id ("tenant_<uuid>") to match the format documents are stored under.
                    if (tenantId) {
                        this.currentBandTenantId = tenantId;
                        DB.setTenant(tenantId);
                        await this.loadBandDetails();
                        await this.loadData();
                        console.log('✅ Switched to joined band:', tenantId);
                    }
                    // Bind us (the invitee) to the roster person the inviter tagged
                    // with this token, once the roster syncs. Best-effort now,
                    // reconciled on later loadData() calls if not yet synced.
                    sessionStorage.setItem('pendingRosterLinkToken', token);
                    await this._linkRosterOnAccept(token);
                    
                    // Guest keys live only in this browser — orient the user
                    // toward Add-Device invites instead of silent device-lock.
                    const _acctType = window.Auth?._auth?.getActiveAccount?.()?.type;
                    this.showSnackbar(_acctType === 'guest'
                        ? 'Joined! Your key lives in this browser — ask a band admin for an "Add device" invite to use another device.'
                        : 'Successfully joined the band!');
                    return true;
                } else if (response.status === 404) {
                    console.warn('⚠️ Invitation token not found or expired');
                    sessionStorage.removeItem('pendingInviteToken');
                    this.showSnackbar('Invitation link expired or invalid', 'error');
                    return false;
                } else if (response.status === 409) {
                    console.warn('⚠️ You are already a member of this band');
                    sessionStorage.removeItem('pendingInviteToken');
                    await this.loadBands();
                    this.showSnackbar('You are already a member of this band');
                    return true; // Not an error, user is already in
                } else if (response.status === 410) {
                    console.warn('⚠️ Invitation has been revoked');
                    sessionStorage.removeItem('pendingInviteToken');
                    this.showSnackbar('Invitation has been revoked', 'error');
                    return false;
                } else {
                    // Error bodies aren't guaranteed JSON (e.g. a bodyless 405
                    // from the static edge), so read text and fall back cleanly.
                    const detail = await response.text().catch(() => '');
                    let msg = `Server error: ${response.status}`;
                    try { const j = JSON.parse(detail); if (j?.detail) msg = j.detail; } catch (_) {}
                    throw new Error(msg);
                }
            } catch (e) {
                console.error('❌ Error accepting invitation:', e);
                // Distinguish network errors from other errors
                if (e instanceof TypeError) {
                    // Network error (no connection, CORS, etc)
                    console.error('Network error - cannot reach server');
                    this.showSnackbar('Cannot reach server. Please check your internet connection.', 'error');
                } else {
                    // HTTP error or other
                    this.showSnackbar('Error accepting invitation: ' + e.message, 'error');
                }
                return false;
            }
        },

        // Initialize
        async init() {
            console.log('🚀 Roady App Initializing...');
            
            // CRITICAL: Parse invite token from URL before auth
            this.parseInviteTokenFromUrl();
            
            this.isLoading = true;

            // 1. Wait for Nostr auth — suspend until the login overlay fires nostr-connected
            console.log('⏳ Waiting for Nostr auth...');
            // Update nav profile when background fetch completes
            window.addEventListener('nostr-profile-updated', (e) => {
                this._updateNavProfile(e.detail?.pubkey, e.detail?.profile);
            });
            await new Promise(resolve => {
                if (window.Auth.isAuthenticated()) { resolve(); return; }
                const handler = () => {
                    window.removeEventListener('nostr-connected', handler);
                    resolve();
                };
                window.addEventListener('nostr-connected', handler);
            });

            // Populate nav with profile data already cached by onConnected
            this._updateNavProfile(window.Auth._cachedPubkey || window.Auth.getPubkey(), window.Auth._cachedProfile);

            // User is authenticated
            this.isAuthenticated = true;
            const pubkey = window.Auth.getPubkey();
            console.log('👤 Nostr user connected:', pubkey?.slice(0, 16) + '...');

            // 3. Load Options first (before tenant init, so we have mycouchBaseUrl)
            await this.loadOptions();
            
            // Resolve the MyCouch base BEFORE anything scopes off it. Auth
            // turns '' / '/__api__' / 'host.tld' into a usable absolute base;
            // passing the raw '' downstream silently un-scopes the local DB.
            window.Auth.setMycouchBaseUrl(this.options.mycouchBaseUrl);
            const resolvedMycouchUrl = window.Auth.getMycouchBaseUrl();

            // Set remote identity for scoped local-DB naming.
            // Use pubkey prefix as stable username for DB scoping.
            const username = pubkey ? pubkey.slice(0, 16) : 'user';
            DB.setRemoteIdentity(resolvedMycouchUrl, username);

            // Initialize DB with scoped naming
            DB.init();

            // Set current database name for display
            this.currentDbName = `pouchdb-local-${DB.hashRemoteUrl(resolvedMycouchUrl)}-${username}`;
            // 4. Initialize Tenant Context with loaded options
            try {
                console.log('🏢 Initializing Tenant Context...');
                console.log('🔗 Passing mycouchBaseUrl to TenantManager:', resolvedMycouchUrl);
                const tenantManager = new TenantManager(resolvedMycouchUrl);
                window.tenantManager = tenantManager;
                console.log('✅ TenantManager created with URL:', tenantManager.mycouchBaseUrl);

                const tenant = await tenantManager.initializeTenantContext();
                this.options.tenantId = tenant.tenantId;

                // Set tenant in DB layer
                DB.setTenant(tenant._id);

                console.log('✅ Tenant Initialized:', tenant.name);

                // Tenant initialized - band selector will display it

            } catch (e) {
                console.error('❌ Tenant initialization failed:', e);
                this._logSyncError('Tenant init failed: ' + (e?.message || 'unknown') +
                    ' — bands may load but data cannot sync');
                if (this._isAuthDenied(e)) {
                    // Permanent until the user grants signing access — don't
                    // poll the signer (it just re-prompts / rate-limits).
                    this.signerDenied = true;
                    console.warn('🚫 Signer denied permission. Grant signing access in your signer app, then Reconnect.');
                } else {
                    console.warn('⚠️ Continuing in offline mode - MyCouch may be unavailable');
                    this.startBackgroundRetry();
                }
                // Continue anyway with cached data - user can work offline
            }

            // If we still don't have a tenant ID (and init failed), try to get from options
            if (!this.options.tenantId) {
                console.warn('⚠️ No tenant context available');
                // Show tenant selection or error
            }

            // Load user's bands
            await this.loadBands();

            // If loadBands failed (offline), try to restore last selected band from localStorage
            if (!this.currentBandTenantId) {
                const lastSelectedBandId = localStorage.getItem('lastSelectedBandId');
                if (lastSelectedBandId) {
                    console.log('📚 Restored last selected band from localStorage:', lastSelectedBandId);
                    this.currentBandTenantId = lastSelectedBandId;
                    DB.setTenant(lastSelectedBandId);
                }
            }

            // Sync DB tenant to whichever band loadBands() selected.
            // Without this, getAllGigs/getAllEquipment filter by the wrong tenant.
            if (this.currentBandTenantId) {
                DB.setTenant(this.currentBandTenantId);
            }

            // 5. Setup Sync before first render so the listener is attached
            //    before any change event can fire, and sync has a head start.
            this.setupSyncListeners();
            this.enableSync();

            // Initial render from local PouchDB (may be empty on new browser;
            // db-sync-change will reload once remote data arrives).
            await this.loadData();

            // First paint now. The band name is already set by loadBands(); the
            // band-details + members fetch below hits the API and can take tens
            // of seconds on a slow proxy, so it must NOT gate startup.
            this.isLoading = false;

            // Refresh band details + members in the background (members are only
            // shown on the Settings screen).
            this.loadBandDetails();

            // Accept a pending invitation if one exists (rare; runs after paint).
            const pendingToken = this.checkPendingInvitation();
            if (pendingToken) {
                console.log('📣 Processing pending invitation acceptance...');
                await this.acceptPendingInvitation(pendingToken);
            }

        },

        _updateNavProfile(pubkey, profile) {
            if (!pubkey) return;
            const npub = window.encodeNpub ? window.encodeNpub(pubkey) : pubkey;
            this.nostrNpub = npub;
            this._nostrProfile = profile || null;
            this._hasNostrProfile = !!(profile && (profile.display_name || profile.name));
            this._applyNavIdentity();
        },

        // Nav identity precedence: if the active key is linked to a roster
        // member, the in-band identity wins — roster name (· role) with a
        // letter avatar (deliberately no nostr picture). Else the nostr
        // kind-0 profile, else a friendly "You". Never a raw npub.
        _applyNavIdentity() {
            const pk = window.Auth?.getPubkey?.();
            const mine = pk ? this.bandMembers.find(m => this.memberPubkeys(m).includes(pk)) : null;
            if (mine) {
                this.nostrDisplayName = mine.name;
                this.nostrAvatarHtml = window.nuiAvatarHtml ? window.nuiAvatarHtml({ name: mine.name }, pk, 28) : '';
                // Persist the in-band identity as an app override so the login
                // card, recent-connection row and connected header all show the
                // roster name + letter avatar — even for keys that also have a
                // kind-0 profile. The override lives in its own localStorage slot,
                // wins over kind-0 at render time, and is never clobbered by the
                // background relay fetch. picture:'' forces the letter avatar to
                // match the nav (deliberately no nostr picture for in-band roles).
                try { window.setProfileOverride?.(pk, { display_name: mine.name, picture: '' }); } catch (_) {}
            } else if (this._hasNostrProfile) {
                this.nostrDisplayName = window.nuiDisplayName
                    ? window.nuiDisplayName(this._nostrProfile, this.nostrNpub)
                    : this.nostrNpub.slice(0, 20) + '\u2026';
                this.nostrAvatarHtml = window.nuiAvatarHtml ? window.nuiAvatarHtml(this._nostrProfile, pk, 28) : '';
                // No roster link → drop any stale override so a removed membership
                // self-heals back to the real kind-0 identity.
                if (pk) { try { window.setProfileOverride?.(pk, null); } catch (_) {} }
            } else {
                this.nostrDisplayName = 'You';
                this.nostrAvatarHtml = window.nuiAvatarHtml ? window.nuiAvatarHtml(null, pk, 28) : '';
                if (pk) { try { window.setProfileOverride?.(pk, null); } catch (_) {} }
            }
        },

        // Map raw user_hash → roster { name, role } by hashing each roster
        // member's device keys. Powers name resolution in the Members list.
        async _rebuildRosterHashMap() {
            const map = {};
            for (const m of this.bandMembers) {
                for (const pk of this.memberPubkeys(m)) {
                    try { map[await window.Auth.hashPubkey(pk)] = { name: m.name, role: m.role }; }
                    catch (_) {}
                }
            }
            this.rosterHashMap = map;
            // The roster may have just resolved (or changed) our own identity.
            this._applyNavIdentity();
        },

        // Display name for a tenant-member row: roster name → (self) profile/You
        // → hex stub. Keeps the founder/owner — who has no roster entry — from
        // showing raw hex; they see their profile name or "You".
        tenantMemberName(m) {
            const r = this.rosterHashMap[m.userHash];
            if (r && r.name) return r.name;
            const me = window.tenantManager?.currentUserHash;
            if (me && m.userHash === me) {
                return (this._hasNostrProfile && this.nostrDisplayName) ? this.nostrDisplayName : 'You';
            }
            return m.name || 'Unknown';
        },

        // Reconnect with exponential backoff. CRITICAL: every attempt calls
        // initializeTenantContext → _fetchMyTenants → a SIGNED auth request,
        // so fixed-interval polling hammers the remote signer (Amber /
        // nsec.app) and gets us rate-limited. Back off hard, then give up
        // after MAX_RETRIES and let the user reconnect manually.
        startBackgroundRetry() {
            if (this.isRetrying) return; // already scheduled
            this.isRetrying = true;
            this.retryAttempt = 0;
            this._scheduleRetry();
        },

        // A signing/authed call failed mid-session (sync push, member load, …).
        // Reflect the disconnected state so the user knows writes aren't syncing,
        // and recover automatically. A permission denial is terminal (needs a
        // fresh handshake); anything else is transient → banner + backoff retry.
        _handleSignerError(err) {
            this._logSyncError(this._isAuthDenied(err)
                ? 'Signer denied signing permission — reconnect and approve'
                : 'Signer: ' + (err?.message || 'unreachable'));
            if (this._isAuthDenied(err)) {
                this._stopRetry();
                this.signerOffline = false;
                this.signerDenied = true;
                return;
            }
            // Already surfaced — the sync drain keeps probing at a backoff and
            // clears the state via db-sync-online. Re-arming the tenant-init
            // retry loop here would probe the signer forever (rate limits).
            if (this.signerOffline || this.isRetrying) return;
            this.signerOffline = true;
            // Covers the empty-outbox case, where no drain probe would ever
            // fire db-sync-online after the signer recovers.
            this.startBackgroundRetry();
        },

        _scheduleRetry() {
            const MAX_RETRIES = 5;
            const BASE_MS = 15000;   // 15s, doubling each attempt
            const CAP_MS = 300000;   // 5 min ceiling
            if (this.retryAttempt >= MAX_RETRIES) {
                this.isRetrying = false;
                this.signerOffline = true;
                console.warn(`🚫 Signer unreachable after ${MAX_RETRIES} attempts. ` +
                    `Auto-retry stopped to avoid rate limits — use Reconnect to try again.`);
                return;
            }
            const delay = Math.min(BASE_MS * 2 ** this.retryAttempt, CAP_MS);
            this.retryAttempt++;
            console.log(`🔄 Reconnect attempt ${this.retryAttempt}/${MAX_RETRIES} in ${Math.round(delay / 1000)}s...`);
            this.retryTimer = setTimeout(() => this._attemptReconnect(), delay);
        },

        async _attemptReconnect() {
            try {
                const tenant = await window.tenantManager.initializeTenantContext();
                console.log('✅ Reconnected! Tenant:', tenant.name);
                this._stopRetry();
                this.signerOffline = false;
                DB.setTenant(tenant._id);
                await this.loadBands();
                if (this.currentBandTenantId) DB.setTenant(this.currentBandTenantId);
                await this.loadData();
            } catch (error) {
                console.log('⏳ Reconnect failed:', error.message);
                if (this._isAuthDenied(error)) {
                    this._stopRetry();
                    this.signerDenied = true;
                    console.warn('🚫 Signer denied permission. Grant signing access in your signer app, then Reconnect.');
                    return;
                }
                this._scheduleRetry();
            }
        },

        // A signer/permission denial is permanent until the user acts — distinct
        // from a transient network/relay failure that's worth retrying.
        _isAuthDenied(err) {
            const m = (err && err.message) ? err.message.toLowerCase() : '';
            return /no permission|not authorized|unauthorized|forbidden|denied|rejected/.test(m);
        },

        _stopRetry() {
            if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
            this.isRetrying = false;
            this.retryAttempt = 0;
        },

        // Manual reconnect — resets backoff and tries again. Bind to a UI
        // button shown while `signerOffline` is true.
        reconnect() {
            this._stopRetry();
            this.signerOffline = false;
            this.startBackgroundRetry();
        },

        // Fresh NIP-46 handshake for a permission denial. A plain reconnect()
        // reuses the stored ephemeral key; if the signer granted it with no
        // signing perms, every sign keeps failing. Clearing the session forces
        // the login flow to run again with a NEW key, whose connect URI requests
        // sign_event perms, so the signer re-prompts for approval.
        reauthorize() {
            this._stopRetry();
            try { window.Auth.logout(); } catch (_) {}
            location.reload();
        },

        async loadData() {
            this.equipment = await DB.getAllEquipment();
            this.gigTypes = await DB.getAllGigTypes();
            this.gigs = await DB.getAllGigs();
            this.bandMembers = await DB.getAllBandMembers();
            await this._rebuildRosterHashMap();
            // Reconcile a pending roster link (invitee side) once the roster syncs.
            const _rosterLinkToken = sessionStorage.getItem('pendingRosterLinkToken');
            if (_rosterLinkToken) await this._linkRosterOnAccept(_rosterLinkToken);
            this.songs = await DB.getAllSongs();
            this.setlistTemplates = await DB.getAllSetlistTemplates();
        },

        async loadDeletedItems() {
            this.deletedItems.gigs = await DB.getDeletedGigs();
            this.deletedItems.equipment = await DB.getDeletedEquipment();
            this.deletedItems.templates = await DB.getDeletedGigTypes();
        },

        getDeletedItemsPage(type, currentPage) {
            const items = this.deletedItems[type] || [];
            const start = (currentPage - 1) * this.trashItemsPerPage;
            const end = start + this.trashItemsPerPage;
            return items.slice(start, end);
        },

        getDeletedItemsPageCount(type) {
            const items = this.deletedItems[type] || [];
            return Math.max(1, Math.ceil(items.length / this.trashItemsPerPage));
        },

        async restoreDeletedItem(type, id) {
            if (type === 'gigs') {
                await DB.restoreGig(id);
            } else if (type === 'equipment') {
                await DB.restoreEquipment(id);
            } else if (type === 'templates') {
                await DB.restoreGigType(id);
            }
            await this.loadData();
            await this.loadDeletedItems();
        },

        // Options methods
        async loadOptions() {
            try {
                const saved = await DB.getOptions();
                console.log('📦 Loaded options from storage:', saved);
                if (saved && Object.keys(saved).length > 0) {
                    this.options = saved;
                    console.log('✅ Options loaded from storage:', this.options);
                } else {
                    console.log('📦 No saved options found');
                }

                // Migration: Remove couchDbUrl (use only mycouchBaseUrl)
                if (this.options.couchDbUrl) {
                    console.log('🔧 Removing deprecated couchDbUrl from options');
                    delete this.options.couchDbUrl;
                }

                // Migrate legacy default → same-origin (empty)
                if (this.options.mycouchBaseUrl === 'https://db.argw.com') {
                    console.log('🔧 Migrating legacy default MyCouch URL → same-origin /__api__');
                    this.options.mycouchBaseUrl = '';
                }
                
                console.log('📦 Final options:', {
                    mycouchBaseUrl: this.options.mycouchBaseUrl,
                    tenantId: this.options.tenantId
                });
                
                // Save if any defaults were set
                if (!saved || !saved.mycouchBaseUrl) {
                    await this.saveOptions();
                }
            } catch (e) {
                console.error('Failed to load options:', e);
            }
        },

        async saveOptions() {
            try {
                await DB.saveOptions(this.options);
            } catch (e) {
                console.error('Failed to save options:', e);
            }

            // Update TenantManager if MyCouch URL changed
            if (window.tenantManager && this.options.mycouchBaseUrl) {
                const oldUrl = window.tenantManager.mycouchBaseUrl;
                if (oldUrl !== this.options.mycouchBaseUrl) {
                    console.log('🔗 MyCouch URL changed, switching to scoped database...');
                    
                    // Check if database needs to switch (URL + username combination changed)
                    const username = window.Auth.getPubkey()?.slice(0, 16) || 'user';
                    const newUrlHash = DB.hashRemoteUrl(this.options.mycouchBaseUrl);
                    const oldUrlHash = DB.hashRemoteUrl(oldUrl);
                    
                    if (newUrlHash !== oldUrlHash) {
                        console.log(`💾 Database scope changed: ${oldUrlHash} → ${newUrlHash}`);
                        console.log(`⏸️  Pausing replication...`);
                        
                        // Pause current replication
                        if (window.Sync && window.Sync.disableSync) {
                            window.Sync.disableSync();
                        }
                        
                        // Switch to new database (scoped by new URL + username)
                        const oldDbName = DB.db?.name || 'unknown';
                        DB.setRemoteIdentity(this.options.mycouchBaseUrl, username);
                        DB.init(); // This will create/switch to the new scoped database
                        const newDbName = DB.db?.name || 'unknown';
                        
                        console.log(`📦 Switched database: ${oldDbName} → ${newDbName}`);
                        
                        // Update display name
                        this.currentDbName = newDbName;
                        
                        // Update TenantManager with new URL
                        window.tenantManager.mycouchBaseUrl = this.options.mycouchBaseUrl;
                        
                        // Clear cached bands (will reload from new database)
                        this.userBands = [];
                        this.currentBandTenantId = null;
                        
                        // Restart with new database and TenantManager
                        this.isLoading = true;
                        try {
                            const tenant = await window.tenantManager.initializeTenantContext();
                            this.options.tenantId = tenant.tenantId;
                            DB.setTenant(tenant._id);
                            console.log('✅ Switched to new database and tenant context:', tenant.name);
                            await this.loadBands();
                            await this.loadData();
                        } catch (e) {
                            console.error('Error initializing with new database:', e);
                            this.showSnackbar('Error switching to new CouchDB server', 'error');
                        } finally {
                            this.isLoading = false;
                        }
                        
                        // Re-enable sync with new URL
                        this.enableSync();
                        
                        return; // Exit early - we've done a full reload
                    } else {
                        // Same database scope, just update TenantManager
                        console.log('🔗 Same database scope, updating TenantManager:', this.options.mycouchBaseUrl);
                        window.tenantManager.mycouchBaseUrl = this.options.mycouchBaseUrl;
                        
                        // Restart retry loop with new URL (if one was active)
                        if (this.isRetrying || this.signerOffline) {
                            this.reconnect();
                        }
                    }
                }
            }

            // Ensure sync runs against the resolved base. Empty option =
            // same-origin (/__api__), NOT "disabled" — enableSync is idempotent
            // and restarts itself when the base actually changed.
            window.Auth.setMycouchBaseUrl(this.options.mycouchBaseUrl);
            this.enableSync();
        },

        async loadSessionToken() {
            // MNA1 has no session token — each request is signed fresh.
            // The diagnostics field now surfaces the active nostr pubkey
            // so users still have a stable identifier to copy.
            const pubkey = window.Auth?.getPubkey();
            this.currentSessionToken = pubkey || '(Not signed in)';
        },

        async copySessionToken() {
            try {
                await navigator.clipboard.writeText(this.currentSessionToken);
                this.sessionCopied = true;
                setTimeout(() => {
                    this.sessionCopied = false;
                }, 2000);
                console.log('✅ Session token copied to clipboard');
            } catch (e) {
                console.error('Failed to copy session token:', e);
                alert('Failed to copy token to clipboard');
            }
        },

        // Sync methods
        async enableSync() {
            // Under MNA1 the app always syncs to the resolved MyCouch base
            // (an empty options URL = same-origin via /__api__). NEVER gate
            // startup on the raw option being non-empty, or the default
            // deployment never syncs: the outbox grows unbounded while the
            // status sits at 'idle' with no error to show.
            if (!window.Sync) {
                console.warn('⚠️ Sync module not loaded yet, deferring sync setup');
                setTimeout(() => this.enableSync(), 100);
                return;
            }

            const dbName = window.location.hostname === 'localhost' ? 'roady-staging' : 'roady';
            const base = window.Auth.getMycouchBaseUrl();
            const syncUrl = `${base}/${dbName}`;

            // Idempotent: already live against this base → leave it alone so
            // repeated init()/saveOptions() calls don't stack WebSockets.
            const st = window.Sync.getSyncStatus();
            if ((st === 'active' || st === 'connecting') && window.Sync.url === base) return;
            // Base changed under a live socket → tear the old one down first.
            if (window.Sync.url && window.Sync.url !== base) window.Sync.cancelSync();

            this.syncError = null;
            console.log('📡 Calling Sync.setupSync with:', syncUrl);
            
            // Non-blocking sync setup with automatic retry
            // If MyCouch is offline, sync will fail gracefully and retry in background
            // App continues working with local PouchDB data
            Sync.setupSync(DB.getDb(), syncUrl)
                .then(success => {
                    if (!success) {
                        console.warn('⚠️ Sync setup failed - will retry in background');
                        this.syncError = 'Sync not available (offline or server unreachable)';
                        // Retry sync setup in background
                        this.scheduleRetrySync(syncUrl);
                    } else {
                        console.log('✅ Sync setup succeeded');
                        this.syncError = null;
                    }
                })
                .catch(error => {
                    console.error('❌ Sync setup error:', error.message);
                    this.syncError = 'Sync connection failed - retrying in background';
                    // Retry sync setup in background
                    this.scheduleRetrySync(syncUrl);
                });
        },

        scheduleRetrySync(syncUrl) {
            // Stop immediately if auth has permanently failed (repeated 401s from /auth/session)
            if (window.Auth?.isAuthPermanentlyFailed?.()) {
                console.error('[⛔ Sync] Auth permanently failed — backend does not accept Nostr auth. Sync disabled.');
                this.syncError = 'Sync unavailable: server auth rejected. Check backend /auth/session configuration.';
                this.syncRetryCount = 0;
                return;
            }

            // Exponential backoff: 5s, 10s, 20s, 30s, 30s...
            const baseDelay = 5000;
            const maxDelay = 30000;
            const retryCount = this.syncRetryCount || 0;
            const delay = Math.min(baseDelay * Math.pow(2, retryCount), maxDelay);

            console.log(`📡 Scheduling sync retry in ${delay}ms (attempt ${retryCount + 1})`);
            setTimeout(() => {
                this.syncRetryCount = (this.syncRetryCount || 0) + 1;
                Sync.setupSync(DB.getDb(), syncUrl)
                    .then(success => {
                        if (success) {
                            console.log('✅ Sync reconnected!');
                            this.syncError = null;
                            this.syncRetryCount = 0;
                        } else {
                            this.scheduleRetrySync(syncUrl);
                        }
                    })
                    .catch(error => {
                        console.warn('⚠️ Sync retry failed:', error.message);
                        this.scheduleRetrySync(syncUrl);
                    });
            }, delay);
        },

        disableSync() {
            if (window.Sync) {
                Sync.cancelSync();
            }
            this.syncStatus = 'idle';
            this.syncError = null;
        },



        setupSyncListeners() {
            const refreshStatus = () => {
                this.syncStatus = window.Sync ? Sync.getSyncStatus() : 'idle';
                this._refreshPendingCount();
            };
            window.addEventListener('db-sync-change', (e) => {
                refreshStatus();
                // Reload bands first — they may have just synced in for the first
                // time. Then re-sync DB tenant in case the selection changed,
                // then reload data.
                this.loadBands().then(() => {
                    if (this.currentBandTenantId) DB.setTenant(this.currentBandTenantId);
                    this.loadData();
                    this.loadDeletedItems();
                });
            });

            window.addEventListener('db-sync-active', refreshStatus);
            window.addEventListener('db-sync-paused', refreshStatus);

            window.addEventListener('db-sync-error', (e) => {
                // Detail-less errors come from _setStatus('error'); the specific
                // failure points dispatch a coded/detailed error we log here.
                if (e.detail) {
                    const msg = this._syncErrorText(e.detail);
                    this._logSyncError(msg);
                    this.syncError = msg;
                }
                refreshStatus();
            });

            // Mid-session signing/network failure during a sync push — surface
            // the offline state (banner + auto-retry) instead of silently
            // stalling the outbox. _handleSignerError logs the error.
            window.addEventListener('db-sync-offline', (e) => {
                this._handleSignerError(e.detail?.error || new Error('sync unavailable'));
                refreshStatus();
            });

            // A push succeeded — signing works again; clear the offline state.
            window.addEventListener('db-sync-online', () => {
                if (this.signerOffline || this.isRetrying) {
                    this._stopRetry();
                    this.signerOffline = false;
                }
                this.syncError = null;
                refreshStatus();
            });
        },

        // Human-readable text for a db-sync-error detail payload.
        _syncErrorText(detail) {
            const map = {
                ws_sign_failed: 'Could not sign sync connection (signer offline or rate-limited)',
                reauth_failed: 'Could not re-sign sync connection (signer offline)',
                auth_rejected: 'Sync server rejected auth',
                outbox_dropped: 'A change exceeded retries and was dropped',
                forbidden: 'Server refused a change (not a member of this band)',
                unauthorized: 'Sync unauthorized',
            };
            const base = map[detail.code] || detail.error?.message || detail.code || 'Sync error';
            const extra = detail.reason ? ` — ${detail.reason}`
                : (detail.doc_id ? ` (${detail.doc_id})` : '');
            return base + extra;
        },

        // Keep the last few sync errors for the status-dot panel. Newest first.
        _logSyncError(msg) {
            if (!msg) return;
            const entry = { ts: Date.now(), msg: String(msg) };
            // Skip a consecutive duplicate (same message within 3s) so a tight
            // retry loop doesn't flood the panel.
            const last = this.syncErrorLog[0];
            if (last && last.msg === entry.msg && (entry.ts - last.ts) < 3000) return;
            this.syncErrorLog.unshift(entry);
            if (this.syncErrorLog.length > 10) this.syncErrorLog.length = 10;
        },

        clearSyncErrors() {
            this.syncErrorLog = [];
            this.syncError = null;
        },

        formatSyncTime(ts) {
            try { return new Date(ts).toLocaleTimeString(); }
            catch (_) { return ''; }
        },

        _refreshPendingCount() {
            try {
                const ob = DB.db?.outbox;
                if (ob) ob.count().then(n => { this.pendingCount = n; }).catch(() => {});
            } catch (_) {}
        },

        // Dot colour: red when errored or the signer is offline, yellow while
        // syncing, green when connected, grey when idle.
        syncDotClass() {
            if (this.syncStatus === 'error' || this.signerOffline) return 'sync-error';
            if (this.syncStatus === 'active') return 'sync-active';
            if (this.syncStatus === 'paused') return 'sync-paused';
            return 'sync-idle';
        },

        getSyncStatusText() {
            if (this.signerOffline) return 'Disconnected';
            if (this.syncStatus === 'active') return 'Syncing...';
            if (this.syncStatus === 'error') return 'Sync Error';
            if (this.syncStatus === 'paused') return 'Connected';
            if (this.syncStatus === 'idle') return 'Not syncing';
            return 'Connected';
        },

        // Tenant methods
        async selectTenant() {
            if (!this.tenantIdInput.trim()) return;

            this.options.tenantId = this.tenantIdInput.trim();
            await this.saveOptions();

            // Set tenant in DB layer
            DB.setTenant(this.options.tenantId);

            // Hide dialog and load data
            this.showTenantSelection = false;
            this.isLoading = true;
            await this.loadData();
            await this.loadDeletedItems();
            this.isLoading = false;
            this.setupSyncListeners();

            // Sync always runs against the resolved MyCouch base.
            this.enableSync();
        },

        async switchBand() {
            // Clear tenant and show selection dialog
            this.options.tenantId = '';
            await this.saveOptions();

            // Reset input and show dialog
            this.tenantIdInput = '';
            this.showTenantSelection = true;
            this.currentView = 'gigs'; // Reset to gigs view
        },

        // Equipment methods
        async saveEquipment() {
            if (!this.newEquipment.name.trim()) return;

            if (this.editingEquipment) {
                await DB.updateEquipment({
                    ...this.editingEquipment,
                    name: this.newEquipment.name,
                    description: this.newEquipment.description
                });
            } else {
                await DB.addEquipment(this.newEquipment);
            }

            await this.loadData();
            this.cancelEquipmentEdit();
        },

        editEquipment(equipment) {
            this.editingEquipment = equipment;
            this.newEquipment = {
                name: equipment.name,
                description: equipment.description || ''
            };
            this.showAddEquipment = true;
        },

        cancelEquipmentEdit() {
            this.showAddEquipment = false;
            this.editingEquipment = null;
            this.resetNewEquipment();
        },

        async deleteEquipment(id) {
            const confirmed = await this.showConfirmation(
                'Delete Equipment',
                'Delete this equipment item?',
                'Delete',
                true
            );

            if (confirmed) {
                const equipment = this.equipment.find(e => e._id === id);
                await DB.deleteEquipment(id);
                await this.loadData();
                this.cancelEquipmentEdit();

                // Show snackbar with undo
                this.showSnackbar(
                    `Deleted "${equipment?.name || 'Equipment'}"`,
                    async () => {
                        await DB.restoreEquipment(id);
                        await this.loadData();
                    }
                );
            }
        },

        resetNewEquipment() {
            this.newEquipment = { name: '', description: '' };
        },

        // Template methods
        async saveGigType() {
            if (!this.newGigType.name.trim()) return;

            if (this.editingGigType) {
                await DB.updateGigType({
                    ...this.editingGigType,
                    name: this.newGigType.name,
                    equipment: this.newGigType.equipment
                });
            } else {
                await DB.addGigType(this.newGigType);
            }

            await this.loadData();
            this.cancelGigTypeEdit();
        },

        editGigType(gigType) {
            this.editingGigType = gigType;

            // Handle old format (equipmentIds array) for backward compatibility
            let equipment;
            if (gigType.equipment) {
                // New format: array of {equipmentId, quantity}
                equipment = gigType.equipment.map(e => ({ ...e }));
            } else if (gigType.equipmentIds) {
                // Old format: convert to new format with quantity = 1
                equipment = gigType.equipmentIds.map(id => ({
                    equipmentId: id,
                    quantity: 1
                }));
            } else {
                equipment = [];
            }

            this.newGigType = {
                name: gigType.name,
                equipment: equipment
            };
        },

        toggleEquipmentInTemplate(equipmentId) {
            const existingIndex = this.newGigType.equipment.findIndex(e => e.equipmentId === equipmentId);
            if (existingIndex >= 0) {
                // Remove it
                this.newGigType.equipment.splice(existingIndex, 1);
            } else {
                // Add it with default quantity of 1
                this.newGigType.equipment.push({ equipmentId, quantity: 1 });
            }
        },

        updateEquipmentQuantity(equipmentId, value) {
            const item = this.newGigType.equipment.find(e => e.equipmentId === equipmentId);
            if (item) {
                const quantity = parseInt(value) || 1;
                item.quantity = Math.max(1, Math.min(99, quantity)); // Clamp between 1 and 99
            }
        },

        cancelGigTypeEdit() {
            this.showAddGigType = false;
            this.editingGigType = null;
            this.resetNewGigType();
        },

        async deleteGigType(id) {
            const confirmed = await this.showConfirmation(
                'Delete Gig Type',
                'Delete this gig type? Existing gigs will keep their current equipment list.',
                'Delete',
                true
            );

            if (confirmed) {
                const gigType = this.gigTypes.find(t => t._id === id);
                await DB.deleteGigType(id);
                await this.loadData();
                this.cancelGigTypeEdit();

                // Show snackbar with undo
                this.showSnackbar(
                    `Deleted gig type "${gigType?.name || 'Gig type'}"`,
                    async () => {
                        await DB.restoreGigType(id);
                        await this.loadData();
                    }
                );
            }
        },

        resetNewGigType() {
            this.newGigType = { name: '', equipment: [] };
        },

        getEquipmentCount(gigType) {
            // Handle both old and new format, only counting active (non-deleted) equipment
            if (gigType.equipment) {
                // New format: sum up quantities for equipment that still exists
                return gigType.equipment.reduce((sum, item) => {
                    const equipmentExists = this.equipment.some(e => e._id === item.equipmentId);
                    return equipmentExists ? sum + item.quantity : sum;
                }, 0);
            } else if (gigType.equipmentIds) {
                // Old format: count only equipment that still exists
                return gigType.equipmentIds.filter(id =>
                    this.equipment.some(e => e._id === id)
                ).length;
            }
            return 0;
        },

        // Gig methods
        async saveGig() {
            if (!this.newGig.name.trim() || !this.newGig.date || !this.newGig.gigTypeId) {
                alert('Please fill in Name, Date, and Gig Type');
                return;
            }

            // A partially-filled <input type="time"> (e.g. hour+minute typed but
            // AM/PM segment untouched) reports value="" — it would silently save
            // blank. Surface it instead of losing the user's input.
            if (this.$refs.arrivalTimeInput?.validity?.badInput) {
                alert('Arrival Time is incomplete — set AM/PM (or clear the field).');
                return;
            }
            if (this.$refs.doorsTimeInput?.validity?.badInput) {
                alert('Doors Open time is incomplete — set AM/PM (or clear the field).');
                return;
            }

            if (this.editingGig) {
                // Check if gig type is changing
                const gigTypeChanged = this.editingGig.gigTypeId !== this.newGig.gigTypeId;

                if (gigTypeChanged) {
                    // Check if there's checklist progress
                    if (this.gigHasChecklistProgress(this.editingGig)) {
                        const confirmed = await this.showConfirmation(
                            'Change Gig Type?',
                            'Changing the gig type will reset all checklist progress. Are you sure you want to continue?',
                            'Change Gig Type',
                            true
                        );

                        if (!confirmed) {
                            return;
                        }
                    }

                    // Get new template and rebuild checklists (expand quantities)
                    const gigType = this.gigTypes.find(t => t._id === this.newGig.gigTypeId);
                    if (!gigType) return;

                    const newChecklist = [];
                    const equipment = gigType.equipment || gigType.equipmentIds?.map(id => ({ equipmentId: id, quantity: 1 })) || [];

                    equipment.forEach(({ equipmentId, quantity }) => {
                        for (let i = 1; i <= quantity; i++) {
                            newChecklist.push({
                                equipmentId,
                                itemNumber: i,
                                checked: false
                            });
                        }
                    });

                    await DB.updateGig({
                        ...this.editingGig,
                        name: this.newGig.name,
                        date: this.newGig.date,
                        gigTypeId: this.newGig.gigTypeId,
                        arrivalTime: this.newGig.arrivalTime,
                        doorsOpenTime: this.newGig.doorsOpenTime,
                        mapLink: this.newGig.mapLink,
                        loadoutChecklist: [...newChecklist],
                        loadinChecklist: [...newChecklist]
                    });
                } else {
                    // Just update name, date, and optional fields
                    await DB.updateGig({
                        ...this.editingGig,
                        name: this.newGig.name,
                        date: this.newGig.date,
                        arrivalTime: this.newGig.arrivalTime,
                        doorsOpenTime: this.newGig.doorsOpenTime,
                        mapLink: this.newGig.mapLink
                    });
                }
            } else {
                // Create new gig
                const gigType = this.gigTypes.find(t => t._id === this.newGig.gigTypeId);
                if (!gigType) return;
                await DB.addGig(this.newGig, gigType);
            }

            await this.loadData();
            this.cancelGigEdit();
        },

        editGig(gig) {
            this.editingGig = gig;
            this.newGig = {
                name: gig.name,
                date: gig.date,
                gigTypeId: gig.gigTypeId,
                // Default empty times so the AM/PM segment is pre-filled — a
                // blank native time input silently reports "" until every
                // segment (incl. AM/PM) is set.
                arrivalTime: gig.arrivalTime || '18:00',
                doorsOpenTime: gig.doorsOpenTime || '19:00',
                mapLink: gig.mapLink || ''
            };
        },

        cancelGigEdit() {
            this.showAddGig = false;
            this.editingGig = null;
            this.resetNewGig();
        },

        async confirmDeleteGig() {
            if (!this.editingGig) return;

            const confirmed = await this.showConfirmation(
                'Delete Gig',
                `Delete "${this.editingGig.name}"? You can restore it from Trash.`,
                'Delete',
                true
            );

            if (confirmed) {
                await DB.deleteGig(this.editingGig._id);
                const gigName = this.editingGig.name;
                await this.loadData();
                this.cancelGigEdit();

                // Show snackbar with undo
                this.showSnackbar(
                    `Deleted gig "${gigName}"`,
                    async () => {
                        await DB.restoreGig(this.editingGig._id);
                        await this.loadData();
                    }
                );
            }
        },

        async deleteGig(id) {
            const gig = this.gigs.find(g => g._id === id);
            if (!gig) return;

            const confirmed = await this.showConfirmation(
                'Delete Gig',
                `Delete "${gig.name}"? You can restore it from Trash.`,
                'Delete',
                true
            );

            if (confirmed) {
                await DB.deleteGig(id);
                const gigName = gig.name;
                await this.loadData();
                this.closeGigDetail();

                // Show snackbar with undo
                this.showSnackbar(
                    `Deleted gig "${gigName}"`,
                    async () => {
                        await DB.restoreGig(id);
                        await this.loadData();
                    }
                );
            }
        },

        // Band-friendly time entry: a time typed into an EMPTY field landing in
        // 1:00–11:59 got "AM" only because that's the browser default — gigs are
        // in the evening, so coerce to PM. Deliberate edits of an existing value
        // (including flipping to AM) are respected. 12:xx and existing values
        // pass through untouched.
        timeFocus(field) {
            this._timeFocusPrev[field] = this.newGig[field] || '';
        },
        timePmCoerce(field) {
            const prev = this._timeFocusPrev[field] || '';
            const v = this.newGig[field];
            if (prev || !v) return; // only coerce fresh entries
            const [h, m] = v.split(':').map(Number);
            if (Number.isInteger(h) && h >= 1 && h <= 11) {
                this.newGig[field] = `${String(h + 12).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;
            }
        },

        resetNewGig() {
            this.newGig = { name: '', date: '', gigTypeId: '', arrivalTime: '18:00', doorsOpenTime: '19:00', mapLink: '' };
        },

        async viewGigDetail(gigId, mode) {
            this.selectedGigId = gigId;
            this.gigChecklistMode = mode; // 'leavingForGig' or 'leavingFromGig'
            this.selectedGig = await DB.getGig(gigId);

            // If gig is clean (not dirty), sync with current template
            if (!this.gigHasChecklistProgress(this.selectedGig)) {
                const gigType = this.gigTypes.find(t => t._id === this.selectedGig.gigTypeId);
                if (gigType) {
                    const templateEquipment = gigType.equipment || gigType.equipmentIds?.map(id => ({ equipmentId: id, quantity: 1 })) || [];

                    // Build new checklists from current template (only include non-deleted equipment)
                    const newChecklist = [];
                    templateEquipment.forEach(({ equipmentId, quantity }) => {
                        // Only add if equipment still exists (not deleted)
                        if (this.equipment.some(e => e._id === equipmentId)) {
                            for (let i = 1; i <= quantity; i++) {
                                newChecklist.push({
                                    equipmentId,
                                    itemNumber: i,
                                    checked: false
                                });
                            }
                        }
                    });

                    // Only update if equipment changed
                    const currentEquipmentIds = new Set(this.selectedGig.loadoutChecklist.map(i => i.equipmentId));
                    const newEquipmentIds = new Set(newChecklist.map(i => i.equipmentId));

                    if (currentEquipmentIds.size !== newEquipmentIds.size ||
                        ![...currentEquipmentIds].every(id => newEquipmentIds.has(id))) {
                        this.selectedGig.loadoutChecklist = newChecklist;
                        this.selectedGig.loadinChecklist = [...newChecklist];
                        await DB.updateGig(this.selectedGig);
                    }
                }
            }
        },

        closeGigDetail() {
            this.selectedGigId = null;
            this.selectedGig = null;
            this.gigChecklistMode = null;
            this.showAddItemToGig = false;
            this.showAddToGigTypeConfirm = false;
            this.showLoadedItems = false;
            this.showPackedItems = false;
            this.resetNewItemForGig();
        },

        async toggleChecklistItem(checklistType, index) {
            if (!this.selectedGig) return;

            const checklist = checklistType === 'loadout'
                ? this.selectedGig.loadoutChecklist
                : this.selectedGig.loadinChecklist;

            checklist[index].checked = !checklist[index].checked;

            await DB.updateGig(this.selectedGig);
            await this.loadData();

            // Refresh selected gig
            this.selectedGig = await DB.getGig(this.selectedGigId);
        },

        async toggleLoadinItem(index) {
            if (!this.selectedGig) return;

            this.selectedGig.loadinChecklist[index].checked = !this.selectedGig.loadinChecklist[index].checked;

            await DB.updateGig(this.selectedGig);
            await this.loadData();

            // Refresh selected gig
            this.selectedGig = await DB.getGig(this.selectedGigId);
        },

        // Percent of brought items packed back — denominator is what was
        // actually taken to the gig, so 100% is reachable even if gear was
        // left home. Guards divide-by-zero when nothing was brought.
        broughtProgressPct(gig) {
            const b = this.getItemsBrought(gig);
            return b.length ? (b.filter(i => i.checked).length / b.length * 100).toFixed(0) : 0;
        },

        // Escape hatch for the "brought it but forgot to tick To Gig" mistake:
        // flip the load-out flag so the item joins the pack-back list. Load-in
        // stays unchecked — the user still ticks it once actually packed.
        async markBroughtAnyway(index) {
            if (!this.selectedGig) return;
            this.selectedGig.loadoutChecklist[index].checked = true;
            await DB.updateGig(this.selectedGig);
            await this.loadData();
            this.selectedGig = await DB.getGig(this.selectedGigId);
        },

        getItemsBrought(gig) {
            if (!gig) return [];
            return gig.loadinChecklist
                .map((item, index) => ({
                    ...item,
                    originalIndex: index,
                    loadinChecked: item.checked
                }))
                .filter((item, index) => gig.loadoutChecklist[index].checked);
        },

        getItemsNotBrought(gig) {
            if (!gig) return [];
            return gig.loadinChecklist
                .map((item, index) => ({
                    ...item,
                    originalIndex: index,
                    loadinChecked: item.checked
                }))
                .filter((item, index) => !gig.loadoutChecklist[index].checked);
        },

        getFilteredGigs() {
            // Hide gigs that are more than 24 hours in the past
            if (this.showPastGigs) {
                return this.gigs; // Show all gigs
            }

            const now = Date.now();
            const twentyFourHours = 24 * 60 * 60 * 1000;

            return this.gigs.filter(gig => {
                // Parse gig date as local time at end of day
                const [year, month, day] = gig.date.split('-').map(Number);
                const gigEndOfDay = new Date(year, month - 1, day, 23, 59, 59).getTime();

                // Keep gig if it's within last 24 hours
                return (now - gigEndOfDay) < twentyFourHours;
            });
        },

        isGigInPast(gig) {
            const now = Date.now();
            const twentyFourHours = 24 * 60 * 60 * 1000;

            const [year, month, day] = gig.date.split('-').map(Number);
            const gigEndOfDay = new Date(year, month - 1, day, 23, 59, 59).getTime();

            return (now - gigEndOfDay) >= twentyFourHours;
        },

        getAvailableEquipment() {
            if (!this.selectedGig) return this.equipment;
            const gigEquipmentIds = this.selectedGig.loadoutChecklist.map(item => item.equipmentId);
            return this.equipment.filter(eq => !gigEquipmentIds.includes(eq._id));
        },

        resetNewItemForGig() {
            this.newItemForGig = {
                equipmentId: '',
                newEquipmentName: '',
                addedEquipmentId: null,
                addedEquipmentName: ''
            };
        },

        cancelAddItemToGig() {
            this.showAddItemToGig = false;
            this.resetNewItemForGig();
        },

        async addItemToGig() {
            if (!this.selectedGig) return;

            let equipmentId = this.newItemForGig.equipmentId;
            let equipmentName = '';

            // If creating new equipment
            if (!equipmentId && this.newItemForGig.newEquipmentName.trim()) {
                const newEquipment = {
                    name: this.newItemForGig.newEquipmentName.trim(),
                    description: ''
                };
                const result = await DB.addEquipment(newEquipment);
                equipmentId = result.id;
                equipmentName = newEquipment.name;
                await this.loadData();
            } else if (equipmentId) {
                const item = this.equipment.find(e => e._id === equipmentId);
                equipmentName = item ? item.name : '';
            } else {
                return; // Nothing selected or entered
            }

            // Add to gig checklists
            this.selectedGig.loadoutChecklist.push({ equipmentId, checked: false });
            this.selectedGig.loadinChecklist.push({ equipmentId, checked: false });
            await DB.updateGig(this.selectedGig);
            await this.loadData();
            this.selectedGig = await DB.getGig(this.selectedGigId);

            // Store for confirmation dialog
            this.newItemForGig.addedEquipmentId = equipmentId;
            this.newItemForGig.addedEquipmentName = equipmentName;

            // Show confirmation dialog
            this.showAddItemToGig = false;
            this.showAddToGigTypeConfirm = true;
        },

        async confirmAddToGigType(addToType) {
            if (addToType && this.selectedGig && this.newItemForGig.addedEquipmentId) {
                const gigType = this.gigTypes.find(t => t._id === this.selectedGig.gigTypeId);
                if (gigType) {
                    // Handle both old and new format
                    if (gigType.equipment) {
                        // New format: check if equipment already exists
                        const exists = gigType.equipment.some(e => e.equipmentId === this.newItemForGig.addedEquipmentId);
                        if (!exists) {
                            gigType.equipment.push({ equipmentId: this.newItemForGig.addedEquipmentId, quantity: 1 });
                            await DB.updateGigType(gigType);
                            await this.loadData();
                        }
                    } else if (gigType.equipmentIds) {
                        // Old format: convert to new format and add
                        gigType.equipment = gigType.equipmentIds.map(id => ({ equipmentId: id, quantity: 1 }));
                        gigType.equipment.push({ equipmentId: this.newItemForGig.addedEquipmentId, quantity: 1 });
                        delete gigType.equipmentIds;
                        await DB.updateGigType(gigType);
                        await this.loadData();
                    }
                }
            }

            this.showAddToGigTypeConfirm = false;
            this.resetNewItemForGig();
        },

        gigHasChecklistProgress(gig) {
            if (!gig) return false;
            const hasLoadoutProgress = gig.loadoutChecklist.some(item => item.checked);
            const hasLoadinProgress = gig.loadinChecklist.some(item => item.checked);
            return hasLoadoutProgress || hasLoadinProgress;
        },

        // Checklist filtering helpers
        getUnloadedItems(checklist) {
            if (!checklist) return [];
            return checklist
                .map((item, index) => ({ ...item, originalIndex: index }))
                .filter(item => !item.checked);
        },

        getLoadedItems(checklist) {
            if (!checklist) return [];
            return checklist
                .map((item, index) => ({ ...item, originalIndex: index }))
                .filter(item => item.checked);
        },

        // Helper methods
        getGigTypeName(gigTypeId) {
            const type = this.gigTypes.find(t => t._id === gigTypeId);
            return type ? type.name : 'Unknown';
        },

        getEquipmentName(equipmentId, itemNumber) {
            const item = this.equipment.find(e => e._id === equipmentId);
            const baseName = item ? item.name : 'Unknown';

            // Only show item number if it exists and is > 1 (meaning there are multiple items)
            if (itemNumber && itemNumber > 0) {
                // Check if there are multiple items with the same equipmentId in the current gig
                if (this.selectedGig) {
                    const checklist = this.gigChecklistMode === 'leavingForGig'
                        ? this.selectedGig.loadoutChecklist
                        : this.selectedGig.loadinChecklist;

                    const itemsWithSameId = checklist.filter(i => i.equipmentId === equipmentId);
                    if (itemsWithSameId.length > 1) {
                        return `${baseName} #${itemNumber}`;
                    }
                }
            }

            return baseName;
        },

        getChecklistProgress(checklist) {
            const checked = checklist.filter(item => item.checked).length;
            return `${checked}/${checklist.length}`;
        },

        formatDate(dateString) {
            const date = new Date(dateString);
            return date.toLocaleDateString('en-US', {
                weekday: 'short',
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        },

        openCreateGigDialog() {
            // If no templates exist, create a default template
            if (this.gigTypes.length === 0) {
                const defaultTemplate = {
                    name: 'Default',
                    equipment: []
                };
                DB.addGigType(defaultTemplate).then(async () => {
                    await this.loadData();
                    // Optionally, select the new template for the new gig
                    if (this.gigTypes.length > 0) {
                        this.newGig.gigTypeId = this.gigTypes[0]._id;
                    }
                    this.showAddGig = true;
                });
            } else {
                this.showAddGig = true;
            }
        },

        // Confirmation dialog helpers
        showConfirmation(title, message, confirmText = 'Confirm', isDangerous = false) {
            return new Promise((resolve) => {
                this.confirmationDialog = {
                    isOpen: true,
                    title,
                    message,
                    confirmText,
                    cancelText: 'Cancel',
                    action: resolve,
                    isDangerous
                };
            });
        },

        async confirmDialogAction(confirmed) {
            const action = this.confirmationDialog.action;
            this.confirmationDialog.isOpen = false;

            if (confirmed && action) {
                action(true);
            } else if (action) {
                action(false);
            }
        },

        // Snackbar helpers
        showSnackbar(message, undoAction, duration = 4000) {
            // Clear any existing timeout
            if (this.snackbar.timeout) {
                clearTimeout(this.snackbar.timeout);
            }

            this.snackbar = {
                isOpen: true,
                message,
                action: undoAction,
                timeout: setTimeout(() => {
                    this.snackbar.isOpen = false;
                }, duration)
            };
        },

        async snackbarUndo() {
            if (this.snackbar.action) {
                if (this.snackbar.timeout) {
                    clearTimeout(this.snackbar.timeout);
                }
                this.snackbar.isOpen = false;
                await this.snackbar.action();
            }
        },

        dismissSnackbar() {
            if (this.snackbar.timeout) {
                clearTimeout(this.snackbar.timeout);
            }
            this.snackbar.isOpen = false;
        },

        // ===============================================================
        // Set list feature
        // ===============================================================
        newGigSetlistTemplateId: '',
        _wakeLock: null,

        // --- Duration helpers ---
        formatDuration(sec) {            // mm:ss for a single song
            sec = Number(sec) || 0;
            const m = Math.floor(sec / 60);
            const s = sec % 60;
            return `${m}:${String(s).padStart(2, '0')}`;
        },
        parseDuration(str) {             // "h:mm:ss" | "mm:ss" | plain seconds
            if (str == null) return 0;
            str = String(str).trim();
            if (!str) return 0;
            if (str.includes(':')) {
                const parts = str.split(':').map(p => parseInt(p, 10) || 0);
                if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
                return parts[0] * 60 + parts[1];
            }
            return parseInt(str, 10) || 0;
        },
        formatRuntime(sec) {             // human total, e.g. "1h 23m"
            sec = Number(sec) || 0;
            if (!sec) return '—';
            const h = Math.floor(sec / 3600);
            const m = Math.round((sec % 3600) / 60);
            return h > 0 ? `${h}h ${m}m` : `${m}m`;
        },
        sectionDuration(section) {
            return (section?.items || []).reduce((sum, it) => sum + (Number(it.durationSec) || 0), 0);
        },
        setlistTotalDuration(setlist) {
            return (setlist?.sections || []).reduce((sum, sec) => sum + this.sectionDuration(sec), 0);
        },
        setlistSongCount(setlist) {
            return (setlist?.sections || []).reduce((sum, sec) => sum + (sec.items?.length || 0), 0);
        },

        // --- Songs (catalog) ---
        async saveSong() {
            if (!this.newSong.title.trim()) return;
            const durationSec = this.parseDuration(this.songDurationInput);
            if (this.editingSong) {
                await DB.updateSong({
                    ...this.editingSong,
                    title: this.newSong.title.trim(),
                    artist: this.newSong.artist || '',
                    durationSec,
                    key: this.newSong.key || '',
                    bpm: Number(this.newSong.bpm) || 0,
                    lead: this.newSong.lead || '',
                    notes: this.newSong.notes || '',
                });
            } else {
                await DB.addSong({ ...this.newSong, durationSec });
            }
            await this.loadData();
            this.cancelSongEdit();
        },
        editSong(song) {
            this.editingSong = song;
            this.newSong = {
                title: song.title || '',
                artist: song.artist || '',
                durationSec: song.durationSec || 0,
                key: song.key || '',
                bpm: song.bpm || 0,
                lead: song.lead || '',
                notes: song.notes || '',
            };
            this.songDurationInput = song.durationSec ? this.formatDuration(song.durationSec) : '';
            this.showAddSong = true;
        },
        cancelSongEdit() {
            this.showAddSong = false;
            this.editingSong = null;
            this.resetNewSong();
        },
        resetNewSong() {
            this.newSong = { title: '', artist: '', durationSec: 0, key: '', bpm: 0, lead: '', notes: '' };
            this.songDurationInput = '';
        },
        async deleteSong(id) {
            const confirmed = await this.showConfirmation(
                'Delete Song',
                'Delete this song from the catalog? Existing set lists keep their copy.',
                'Delete',
                true
            );
            if (confirmed) {
                const song = this.songs.find(s => s._id === id);
                await DB.deleteSong(id);
                await this.loadData();
                this.cancelSongEdit();
                this.showSnackbar(
                    `Deleted "${song?.title || 'Song'}"`,
                    async () => { await DB.restoreSong(id); await this.loadData(); }
                );
            }
        },

        // --- Set list templates ---
        newSetlistTemplate() {
            this.editingSetlist = { name: '', sections: [] };
            this.editingSetlistKind = 'template';
        },
        editSetlistTemplate(tpl) {
            this.editingSetlist = JSON.parse(JSON.stringify(tpl));
            this.editingSetlistKind = 'template';
        },
        async duplicateSetlistTemplate(id) {
            await DB.duplicateSetlistTemplate(id);
            await this.loadData();
            this.showSnackbar('Set list duplicated');
        },
        async deleteSetlistTemplate(id) {
            const confirmed = await this.showConfirmation(
                'Delete Set List',
                'Delete this set list? Gigs already using a copy are unaffected.',
                'Delete',
                true
            );
            if (confirmed) {
                const tpl = this.setlistTemplates.find(t => t._id === id);
                await DB.deleteSetlistTemplate(id);
                await this.loadData();
                this.closeSetlistEditor();
                this.showSnackbar(
                    `Deleted "${tpl?.name || 'Set list'}"`,
                    async () => { await DB.restoreSetlistTemplate(id); await this.loadData(); }
                );
            }
        },

        // --- Shared set list editor (templates + gig instances) ---
        closeSetlistEditor() {
            this.editingSetlist = null;
            this.editingSetlistKind = null;
        },
        async saveSetlistEditor() {
            const doc = this.editingSetlist;
            if (!doc) return;
            if (this.editingSetlistKind === 'template') {
                if (!(doc.name || '').trim()) {
                    this.showSnackbar('Set list name is required', 'error');
                    return;
                }
                if (doc._id) await DB.updateSetlistTemplate(doc);
                else await DB.addSetlistTemplate(doc);
                await this.loadData();
                this.closeSetlistEditor();
            } else if (this.editingSetlistKind === 'instance') {
                await DB.updateSetlist(doc);
                await this.loadData();
                this.gigSetlist = await DB.getSetlistForGig(doc.gigId);
                this.setlistMode = 'view';
                this.closeSetlistEditor();
            }
        },
        addSetlistSection() {
            if (!this.editingSetlist) return;
            if (!this.editingSetlist.sections) this.editingSetlist.sections = [];
            const n = this.editingSetlist.sections.length + 1;
            this.editingSetlist.sections.push({ id: 'sec_' + Date.now(), name: `Set ${n}`, items: [] });
        },
        deleteSetlistSection(sectionId) {
            if (!this.editingSetlist) return;
            this.editingSetlist.sections = this.editingSetlist.sections.filter(s => s.id !== sectionId);
        },
        moveSetlistSection(index, dir) {
            const arr = this.editingSetlist?.sections;
            if (!arr) return;
            const j = index + dir;
            if (j < 0 || j >= arr.length) return;
            [arr[index], arr[j]] = [arr[j], arr[index]];
        },
        async addSongToSection(sectionId, songId, newTitle) {
            const section = this.editingSetlist?.sections.find(s => s.id === sectionId);
            if (!section) return false;
            let id = songId;
            let title = '';
            let durationSec = 0;
            if (!id && (newTitle || '').trim()) {
                const res = await DB.addSong({ title: newTitle.trim() });
                id = res.id;
                title = newTitle.trim();
                await this.loadData();
            } else if (id) {
                const song = this.songs.find(s => s._id === id);
                if (!song) return false;
                title = song.title;
                durationSec = Number(song.durationSec) || 0;
            } else {
                return false;
            }
            section.items.push({ songId: id, title, durationSec });
            return true;
        },
        removeSongFromSection(sectionId, index) {
            const section = this.editingSetlist?.sections.find(s => s.id === sectionId);
            if (section) section.items.splice(index, 1);
        },
        moveSongInSection(sectionId, index, dir) {
            const section = this.editingSetlist?.sections.find(s => s.id === sectionId);
            if (!section) return;
            const arr = section.items;
            const j = index + dir;
            if (j < 0 || j >= arr.length) return;
            [arr[index], arr[j]] = [arr[j], arr[index]];
        },

        // --- Gig integration ---
        async openGigSetlist(gigId) {
            this.selectedGigId = gigId;
            this.selectedGig = await DB.getGig(gigId);
            this.gigSetlist = await DB.getSetlistForGig(gigId);
            this.setlistMode = 'view';
            this.newGigSetlistTemplateId = '';
            this.showGigSetlist = true;
        },
        closeGigSetlist() {
            this.showGigSetlist = false;
            this.gigSetlist = null;
            this.setlistMode = 'view';
            this.selectedGigId = null;
            this.selectedGig = null;
            this.newGigSetlistTemplateId = '';
            this.closeSetlistEditor();
        },
        async pickTemplateForGig() {
            if (!this.newGigSetlistTemplateId) return;
            await DB.addSetlistFromTemplate(this.selectedGigId, this.newGigSetlistTemplateId);
            await this.loadData();
            this.gigSetlist = await DB.getSetlistForGig(this.selectedGigId);
            this.newGigSetlistTemplateId = '';
            this.setlistMode = 'view';
        },
        async startBlankSetlistForGig() {
            await DB.addBlankSetlist(this.selectedGigId, this.selectedGig?.name);
            await this.loadData();
            this.gigSetlist = await DB.getSetlistForGig(this.selectedGigId);
            this.setlistMode = 'view';
            this.editGigSetlist();
        },
        editGigSetlist() {
            if (!this.gigSetlist) return;
            this.editingSetlist = JSON.parse(JSON.stringify(this.gigSetlist));
            this.editingSetlistKind = 'instance';
            this.setlistMode = 'edit';
        },
        async removeGigSetlist() {
            if (!this.gigSetlist) return;
            const confirmed = await this.showConfirmation(
                'Remove Set List',
                'Remove the set list from this gig? You can undo right after.',
                'Remove',
                true
            );
            if (!confirmed) return;
            const id = this.gigSetlist._id;
            const gigId = this.selectedGigId;
            await DB.deleteSetlist(id);
            await this.loadData();
            this.gigSetlist = null;
            this.showSnackbar(
                'Set list removed',
                async () => {
                    await DB.restoreSetlist(id);
                    await this.loadData();
                    this.gigSetlist = await DB.getSetlistForGig(gigId);
                }
            );
        },
        async saveSetlistAsTemplate() {
            const src = this.editingSetlist || this.gigSetlist;
            if (!src) return;
            const name = (src.name || this.selectedGig?.name || 'Set List').trim();
            await DB.addSetlistTemplate({ name, sections: src.sections });
            await this.loadData();
            this.showSnackbar(`Saved as template "${name}"`);
        },
        async updateSourceTemplate() {
            const src = this.editingSetlist || this.gigSetlist;
            if (!src || !src.sourceTemplateId) return;
            const confirmed = await this.showConfirmation(
                'Update Source Set List',
                'Overwrite the source set list with this one? This affects future gigs created from it.',
                'Update',
                true
            );
            if (!confirmed) return;
            const tpl = this.setlistTemplates.find(t => t._id === src.sourceTemplateId);
            if (!tpl) {
                this.showSnackbar('Source set list no longer exists', 'error');
                return;
            }
            await DB.updateSetlistTemplate({ ...tpl, sections: src.sections });
            await this.loadData();
            this.showSnackbar('Source set list updated');
        },

        // --- Performance (live) view + print ---
        async openPerformanceView(setlist) {
            this.performanceSetlist = setlist;
            if ('wakeLock' in navigator) {
                try { this._wakeLock = await navigator.wakeLock.request('screen'); } catch (_) { /* best effort */ }
            }
        },
        async closePerformanceView() {
            this.performanceSetlist = null;
            if (this._wakeLock) {
                try { await this._wakeLock.release(); } catch (_) { /* ignore */ }
                this._wakeLock = null;
            }
        },
        printSetlist(setlist) {
            this.performanceSetlist = setlist;
            this.$nextTick(() => window.print());
        },

        // Band management methods
        async loadBands() {
             try {
                 // Refresh tenant list from server (not cached)
                 if (!window.tenantManager) {
                     console.error('❌ TenantManager not available');
                     return;
                 }
                 
                 // Reload tenants from server to get latest (including newly created tenants)
                 const tenantsResponse = await window.tenantManager.getMyTenants();
                 this.userBands = Array.isArray(tenantsResponse) ? tenantsResponse : [];
                 console.log('✅ Tenants refreshed from server:', this.userBands);
                 
                 // VALIDATION: Check if user.tenants was corrupted with full tenant documents
                 // This catches the data corruption bug described in INVITATION_ACCEPTANCE_CODE_REVIEW.md
                 if (window.tenantManager?.localUserDoc) {
                     const validation = window.tenantManager.validateUserTenantsFormat(window.tenantManager.localUserDoc);
                     if (!validation.valid) {
                         window.tenantManager.logValidationErrors(validation);
                         console.error('⚠️ Detected data corruption in user.tenants - see INVITATION_ACCEPTANCE_CODE_REVIEW.md for details');
                         // Continue anyway, but alert user
                         this.showSnackbar('⚠️ Data integrity issue detected. Please refresh the page.', 'warning');
                     }
                 }
                
                // Determine which band to select
                // Priority: 1) Already selected (don't override), 2) Last selected band, 3) Current tenant from tenantManager, 4) First band
                
                // If already have a selected band, keep it (don't override on reload)
                if (this.currentBandTenantId && this.userBands.some(b => b._id === this.currentBandTenantId)) {
                    console.log('✅ Keeping current band:', this.currentBandTenantId);
                } else {
                    const lastSelectedBandId = localStorage.getItem('lastSelectedBandId');
                    if (lastSelectedBandId && this.userBands.some(b => b._id === lastSelectedBandId)) {
                        // Use last selected band if it still exists
                        this.currentBandTenantId = lastSelectedBandId;
                        console.log('✅ Using last selected band:', lastSelectedBandId);
                    } else {
                        // Fall back to current tenant or first band
                        const currentTenant = window.tenantManager.getCurrentTenant();
                        if (currentTenant) {
                            this.currentBandTenantId = currentTenant._id;
                            console.log('✅ Using current tenant:', currentTenant._id);
                        } else if (this.userBands.length > 0) {
                            this.currentBandTenantId = this.userBands[0]._id;
                            console.log('✅ Using first band:', this.userBands[0]._id);
                        }
                    }
                }
                
                // Update current band name
                this.updateCurrentBandName();
            } catch (e) {
                console.error('❌ Error loading bands:', e);
            }
        },

        updateCurrentBandName() {
            const currentBand = this.userBands.find(b => b._id === this.currentBandTenantId);
            // Use tenant name field (standard across all apps)
            this.currentBandName = currentBand?.name || '';
        },

        async switchBand(bandTenantId) {
            try {
                console.log('🔄 Switching to band:', bandTenantId);
                
                // Switch tenant in tenantManager
                if (window.tenantManager) {
                    try {
                        await window.tenantManager.switchTenant(bandTenantId);
                    } catch (e) {
                        console.warn('⚠️ Could not switch tenant via endpoint:', e);
                        // Continue anyway - local switching still works
                    }
                }
                
                // Update app state
                this.currentBandTenantId = bandTenantId;
                this.updateCurrentBandName();
                
                // Set tenant in DB layer
                DB.setTenant(bandTenantId);
                
                // Save last selected band to local storage
                localStorage.setItem('lastSelectedBandId', bandTenantId);
                
                // Reload data for new band
                await this.loadData();
                
                // Load band details for settings
                await this.loadBandDetails();
                
                // Show notification
                this.showSnackbar(`Switched to ${this.currentBandName}`);
            } catch (e) {
                console.error('❌ Error switching band:', e);
                this.showSnackbar('Error switching band', 'error');
            }
        },

        /**
         * Extract virtual tenant ID from local storage format
         * Local PouchDB stores as tenant_<uuid>, but APIs need just <uuid>
         */
        getVirtualTenantId(tenantId) {
            if (!tenantId) return tenantId;
            if (tenantId.startsWith('tenant_')) {
                return tenantId.substring(7);  // Remove "tenant_" prefix
            }
            return tenantId;
        },

        openCreateBandDialog() {
            this.newBandName = '';
            this.showCreateBandDialog = true;
        },

        async createBand() {
            if (!this.newBandName.trim()) {
                this.showSnackbar('Band name is required', 'error');
                return;
            }

            // Prevent double submission (e.g., Enter key + button click)
            if (this.isCreatingBand) {
                console.warn('⚠️ Band creation already in progress, ignoring duplicate request');
                return;
            }
            this.isCreatingBand = true;

            try {
                if (!window.Auth?.isAuthenticated()) {
                    console.error('Not authenticated');
                    this.showSnackbar('Authentication error: Please sign in again', 'error');
                    this.isCreatingBand = false;
                    return;
                }

                const bandName = this.newBandName;

                // Create tenant via the TenantManager — under the hood this
                // POSTs `/api/tenants` with MNA1 auth and normalizes the
                // server's `Tenant` response into the legacy `_id` shape.
                try {
                    console.log('📤 Creating band via TenantManager.createTenant:', bandName);
                    const newTenant = await window.tenantManager.createTenant({ name: bandName });
                    const newBandId = newTenant.tenantId; // bare uuid for sub-systems that expect it
                    const internalId = newTenant._id;     // `tenant_<...>` for DAL + active-tenant
                    console.log('✅ Band created:', newTenant);

                    this.showCreateBandDialog = false;
                    this.newBandName = '';

                    // Create band-info document in the new tenant's roady DB.
                    try {
                        const previousTenant = DB.currentTenant;
                        console.log('📝 Setting tenant to new band:', internalId);
                        DB.setTenant(internalId);
                        console.log('📝 Saving band-info for:', internalId);
                        await DB.saveBandInfo({ name: bandName });
                        if (previousTenant) DB.setTenant(previousTenant);
                    } catch (e) {
                        console.error('❌ Failed to create band-info for', internalId, e);
                    }

                    // Add to local app state. TenantManager.createTenant already
                    // pushed into its own tenantList; userBands mirrors that for UI.
                    if (!this.userBands.find(b => b._id === internalId)) {
                        this.userBands.push(newTenant);
                    }
                    console.log('✅ Added new band to local lists:', internalId);

                    // Refresh from server to pick up server-side normalization
                    // (e.g. membership rows) before switching.
                    try {
                        const fresh = await window.tenantManager.getMyTenants();
                        if (Array.isArray(fresh) && fresh.length > 0) this.userBands = fresh;
                    } catch (e) {
                        console.warn('⚠️ Tenant refresh after create failed:', e.message);
                    }

                    
                    // Switch to new band (becomes active in JWT)
                    await this.switchBand(newBandId);
                    this.showSnackbar(`Created new band: ${bandName}`);
                } catch (e) {
                    console.error('❌ Failed to create band via backend:', e);
                    // Distinguish network errors from server errors
                    if (e instanceof TypeError) {
                        // Network error (no connection, CORS, etc)
                        console.error('Network error - cannot reach server');
                        this.showSnackbar('Cannot reach server. Please check your internet connection.', 'error');
                    } else {
                        // HTTP error or other
                        this.showSnackbar('Error creating band: ' + e.message, 'error');
                    }
                } finally {
                    this.isCreatingBand = false;
                }
            } catch (outerError) {
                console.error('❌ Unexpected error in band creation:', outerError);
                this.showSnackbar('Error creating band: ' + outerError.message, 'error');
                this.isCreatingBand = false;
            }
        },

        // Band settings methods
        async loadBandDetails() {
            if (!this.currentBandTenantId) return;
            
            try {
                // CRITICAL: Use tenant name from userBands (server source of truth)
                // NOT from local band-info document which may be stale
                const currentBand = this.userBands.find(b => b._id === this.currentBandTenantId);
                const tenantName = currentBand?.name;
                
                // Set tenant context for getBandInfo (for other band-specific data if needed)
                DB.setTenant(this.currentBandTenantId);
                const bandInfo = await DB.getBandInfo();
                
                // Use tenant name as source of truth, fallback to band-info if needed
                const nameToUse = tenantName || bandInfo?.name || this.currentBandName;
                
                this.bandBeingEdited = { name: nameToUse };
                this.bandNameOriginal = nameToUse;
                this.currentBandName = nameToUse;
                
                console.log('✅ Band details loaded:', { 
                    tenantName, 
                    bandInfoName: bandInfo?.name,
                    finalName: nameToUse 
                });
            } catch (e) {
                console.error('❌ Error loading band details:', e);
            }
            
            await this.loadBandMembers();
        },

        async loadBandMembers() {
            // Members live in the `tenant_members` server table (B.6a). The
            // old `tenantDoc.userIds` array was a virtual-tables-era affordance
            // (B.7) that the post-C.11 server-shape tenants don't carry. Fetch
            // authoritative state from `GET /api/tenants/:tid/members` so a
            // freshly-created tenant or one whose membership changed remotely
            // displays correctly without a round-trip through `/api/my-tenants`.
            this.currentBandMembers = [];
            if (!this.currentBandTenantId) return;

            try {
                const base = window.Auth.getMycouchBaseUrl().replace(/\/+$/, '');
                const tid = encodeURIComponent(this.currentBandTenantId);
                const res = await window.Auth.fetchWithAuth(
                    `${base}/api/tenants/${tid}/members`,
                    { method: 'GET' },
                );
                if (!res.ok) {
                    const text = await res.text().catch(() => '');
                    console.warn(`⚠️ loadBandMembers ${res.status}:`, text);
                    return;
                }
                const data = await res.json();
                const members = Array.isArray(data?.members) ? data.members : [];
                // Server shape: { members: [{ user_hash, role, joined_at }, ...] }.
                // UI shape: { userId: 'user_<hash>', name, role }. Email is no
                // longer stored — under MNA1 the only identity is the pubkey.
                this.currentBandMembers = members.map(m => ({
                    userId: `user_${m.user_hash}`,
                    userHash: m.user_hash,
                    name: `${m.user_hash.slice(0, 8)}…`,
                    role: m.role,
                    joinedAt: m.joined_at,
                }));
                await this._rebuildRosterHashMap();
                console.log(`✅ Band members loaded (${this.currentBandMembers.length}):`, this.currentBandMembers);
            } catch (e) {
                console.error('❌ loadBandMembers failed:', e);
                this._handleSignerError(e);
            }
        },

        getCurrentUserRole() {
            // Get current user's ID
            const currentUserId = `user_${window.tenantManager?.currentUserHash}`;
            if (!currentUserId || !this.currentBandTenantId) {
                return 'member'; // default fallback
            }

            // Find current band in userBands
            const virtualTenantId = this.currentBandTenantId.replace('tenant_', '');
            const currentBand = this.userBands.find(b =>
                b._id === virtualTenantId || b.tenantId === virtualTenantId || b._id === this.currentBandTenantId
            );

            if (!currentBand) {
                return 'member';
            }

            // Check role in band.members array
            if (currentBand.members && Array.isArray(currentBand.members)) {
                const memberInfo = currentBand.members.find(m => m.userId === currentUserId);
                if (memberInfo && memberInfo.role) {
                    return memberInfo.role;
                }
            }

            // Fallback: check band.role (from user.tenants)
            return currentBand.role || 'member';
        },

        // ── Roster ↔ device-key helpers (many keys → one roster member) ──────
        // `pubkeys[]` is ordered oldest-first; legacy docs carry a singular
        // `pubkey`. These normalize both. A copy is returned so callers can
        // mutate freely before persisting.
        memberPubkeys(m) {
            if (!m) return [];
            if (Array.isArray(m.pubkeys)) return m.pubkeys.slice();
            return m.pubkey ? [m.pubkey] : [];
        },
        memberIsLinked(m) {
            return this.memberPubkeys(m).length > 0;
        },
        memberDeviceCount(m) {
            return this.memberPubkeys(m).length;
        },

        // Revoke tenant membership for a roster member's device keys and prune
        // them from the roster doc. `opts.oldest = N` evicts the N oldest (FIFO
        // cap); omitting it evicts ALL (replace / remove-from-band). Best-effort
        // per key — a key we lack permission to revoke is reported, not fatal.
        async _evictMemberKeys(member, opts = {}) {
            const tenantId = this.currentBandTenantId;
            const keys = this.memberPubkeys(member);
            const toEvict = opts.oldest != null
                ? keys.slice(0, Math.max(0, opts.oldest))
                : keys.slice();
            if (toEvict.length === 0) return;
            const failed = [];
            for (const pk of toEvict) {
                try {
                    const hash = await window.Auth.hashPubkey(pk);
                    await window.tenantManager.removeMemberByHash(tenantId, hash);
                } catch (e) {
                    console.warn('evict key failed:', (pk || '').slice(0, 8), e.message);
                    failed.push(pk);
                }
            }
            const evicted = new Set(toEvict.filter(pk => !failed.includes(pk)));
            const remaining = keys.filter(pk => !evicted.has(pk));
            const doc = this.bandMembers.find(m => m._id === member._id) || member;
            doc.pubkeys = remaining;
            if (remaining.length === 0) { delete doc.linkedAt; delete doc.pubkey; }
            try {
                await DB.updateBandMember(doc);
                this.bandMembers = await DB.getAllBandMembers();
            } catch (e) { console.warn('persist after evict failed:', e.message); }
            if (failed.length) {
                this.showSnackbar(`Could not revoke ${failed.length} device(s) — check you're an admin`, 'error');
            }
        },

        // Open the invite dialog to add another device for an already-linked
        // roster member (additive — existing devices keep working).
        openAddDeviceDialog(member) {
            this.inviteMode = 'add';
            this.inviteMemberEmail = '';
            this.inviteMemberRole = 'member';
            this.inviteRosterMemberId = member?._id || '';
            this.inviteNewMemberName = '';
            this.inviteNewMemberRole = '';
            this.showInviteMemberDialog = true;
        },

        // Open the invite dialog to replace a lost device — generating the
        // invite revokes ALL of this member's current keys first.
        openReplaceDeviceDialog(member) {
            this.inviteMode = 'replace';
            this.inviteMemberEmail = '';
            this.inviteMemberRole = 'member';
            this.inviteRosterMemberId = member?._id || '';
            this.inviteNewMemberName = '';
            this.inviteNewMemberRole = '';
            this.showInviteMemberDialog = true;
        },

        cancelBandEdit() {
            this.bandBeingEdited = { name: this.bandNameOriginal };
        },

        async saveBandName() {
            if (!this.bandBeingEdited.name.trim()) {
                this.showSnackbar('Band name cannot be empty', 'error');
                return;
            }

            try {
                // Update tenant name via the API; TenantManager keeps the
                // local list in sync.
                const band = this.userBands.find(b => b._id === this.currentBandTenantId);
                if (band && window.tenantManager) {
                    try {
                        const updated = await window.tenantManager.updateTenant(
                            band._id,
                            { name: this.bandBeingEdited.name },
                        );
                        band.name = updated.name;
                        console.log('✅ Updated tenant name to:', updated.name);
                    } catch (e) {
                        console.error('Error updating tenant name:', e);
                        throw e;
                    }
                }
                
                // Save band-info for roady-specific metadata (optional)
                const bandInfo = {
                    name: this.bandBeingEdited.name,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                await DB.saveBandInfo(bandInfo);
                
                // Update app state
                this.currentBandName = this.bandBeingEdited.name;
                this.bandNameOriginal = this.currentBandName;
                this.showSnackbar(`Band renamed to ${this.currentBandName}`);
            } catch (e) {
                console.error('Error saving band name:', e);
                this.showSnackbar('Error saving band name', 'error');
            }
        },

        // Band Roster methods
        async addBandMember() {
            if (!this.newBandMember.name.trim()) {
                this.showSnackbar('Member name is required', 'error');
                return;
            }
            try {
                const asSelf = this.addMemberAsSelf && this.getCurrentUserRole() === 'owner';
                const created = await DB.addBandMember(this.newBandMember);
                this.newBandMember = { name: '', role: '' };
                this.addMemberAsSelf = false;
                this.showAddBandMember = false;
                this.bandMembers = await DB.getAllBandMembers();
                if (asSelf && created?.id) {
                    const rm = this.bandMembers.find(m => m._id === created.id);
                    if (rm) await this.claimRosterMember(rm);
                }
                await this._rebuildRosterHashMap();
            } catch (e) {
                console.error('Error adding band member:', e);
                this.showSnackbar('Error adding member', 'error');
            }
        },

        startEditBandMember(member) {
            this.editingBandMember = { ...member };
        },

        // Bind the current user's key to a roster entry (owner-only). Lets the
        // band creator — who never went through an invite — mark which roster
        // person is them. Same append as _linkRosterOnAccept, no invite token.
        async claimRosterMember(member) {
            if (this.getCurrentUserRole() !== 'owner') {
                this.showSnackbar('Only the band owner can assign themselves', 'error');
                return;
            }
            const myPubkey = window.Auth.getPubkey();
            if (!myPubkey) return;
            const target = this.bandMembers.find(m => m._id === member._id);
            if (!target) return;
            const keys = this.memberPubkeys(target);
            if (keys.includes(myPubkey)) { this.showSnackbar(`You're already ${target.name}`); return; }
            keys.push(myPubkey);
            target.pubkeys = keys;
            delete target.pubkey;
            if (!target.linkedAt) target.linkedAt = new Date().toISOString();
            try {
                await DB.updateBandMember(target);
                this.bandMembers = await DB.getAllBandMembers();
                await this._rebuildRosterHashMap();
                this.showSnackbar(`You're now listed as ${target.name}`);
            } catch (e) {
                console.error('claim roster failed:', e);
                this.showSnackbar('Could not assign you to the roster', 'error');
            }
        },

        async confirmClaimRosterMember(member) {
            const ok = await this.showConfirmation(
                'Assign yourself',
                `List yourself as “${member.name}”${member.role ? ' · ' + member.role : ''} in the roster?`,
                'Yes, that\u2019s me',
                false,
            );
            if (ok) await this.claimRosterMember(member);
        },

        cancelEditBandMember() {
            this.editingBandMember = null;
        },

        async saveEditBandMember() {
            if (!this.editingBandMember?.name.trim()) {
                this.showSnackbar('Member name is required', 'error');
                return;
            }
            try {
                await DB.updateBandMember(this.editingBandMember);
                this.editingBandMember = null;
                this.bandMembers = await DB.getAllBandMembers();
            } catch (e) {
                console.error('Error updating band member:', e);
                this.showSnackbar('Error saving member', 'error');
            }
        },

        async deleteBandMember(member) {
            const linked = this.memberIsLinked(member);
            const confirmed = await this.showConfirmation(
                'Remove Member',
                linked
                    ? `Remove ${member.name} from the band? This revokes all their device keys and deletes their roster entry.`
                    : `Remove ${member.name} from the band roster?`,
                'Remove',
                true
            );
            if (!confirmed) return;
            try {
                // Revoke tenant access for every device key before deleting the
                // roster entry — otherwise their keys stay authorized. Needs admin.
                if (linked) await this._evictMemberKeys(member);
                await DB.deleteBandMember(member._id);
                this.bandMembers = await DB.getAllBandMembers();
            } catch (e) {
                console.error('Error deleting band member:', e);
                this.showSnackbar('Error removing member', 'error');
            }
        },

        openInviteMemberDialog() {
            this.inviteMode = 'new';
            this.inviteMemberEmail = '';
            this.inviteMemberRole = 'member';
            this.inviteRosterMemberId = '';
            this.inviteNewMemberName = '';
            this.inviteNewMemberRole = '';
            this.showInviteMemberDialog = true;
        },

        async inviteMember() {
            try {
                // Resolve the roster member to link this invite to, creating one
                // inline when the user chose "＋ Create new roster member".
                let inviteRosterId = this.inviteRosterMemberId;
                if (inviteRosterId === '__new__') {
                    const nm = this.inviteNewMemberName.trim();
                    if (!nm) { this.showSnackbar('Enter a name for the new roster member', 'error'); return; }
                    const created = await DB.addBandMember({ name: nm, role: this.inviteNewMemberRole || '' });
                    inviteRosterId = created?.id || null;
                    this.bandMembers = await DB.getAllBandMembers();
                }

                const mode = this.inviteMode || 'new';
                let rm = inviteRosterId ? this.bandMembers.find(m => m._id === inviteRosterId) : null;

                // Replace a lost device: revoke ALL current keys first so the new
                // key becomes this person's sole device.
                if (mode === 'replace' && rm) {
                    await this._evictMemberKeys(rm);
                    rm = this.bandMembers.find(m => m._id === inviteRosterId) || rm;
                }
                // Add a device: enforce the FIFO cap. Accept appends one, so make
                // room for exactly one over the limit.
                else if (mode === 'add' && rm) {
                    const overflow = this.memberPubkeys(rm).length - (MAX_DEVICES_PER_MEMBER - 1);
                    if (overflow > 0) {
                        await this._evictMemberKeys(rm, { oldest: overflow });
                        rm = this.bandMembers.find(m => m._id === inviteRosterId) || rm;
                    }
                }

                // Route through TenantManager so the request uses the resolved
                // /__api__ base (raw options.mycouchBaseUrl '' would 405).
                const invitationData = await window.tenantManager.createInvitation(
                    this.currentBandTenantId,
                    { role: this.inviteMemberRole, email: this.inviteMemberEmail },
                );

                const inviteToken = invitationData.token || invitationData.id;
                const appBaseUrl = window.location.origin;
                this.generatedInviteLink = `${appBaseUrl}?invite_token=${inviteToken}`;
                this.generatedInviteToken = inviteToken;

                // Tag the roster member with this pending invite so accepting the
                // link binds the invitee's key to this roster person.
                if (rm) {
                    rm.pendingInviteToken = inviteToken;
                    if (this.inviteMemberEmail?.trim()) rm.email = this.inviteMemberEmail.trim();
                    try {
                        await DB.updateBandMember(rm);
                        this.bandMembers = await DB.getAllBandMembers();
                    } catch (e) { console.warn('Failed to tag roster member with invite:', e.message); }
                }

                const bandName = this.currentBandName || 'my band';
                this.inviteMessageTemplate = `Join my band on Roady!\n\n${this.generatedInviteLink}\n\nClick the link above to accept the invitation and start collaborating with ${bandName}.`;

                this.showInviteMemberDialog = false;
                this.showGeneratedInviteLink = true;
            } catch (e) {
                console.error('Error inviting member:', e);
                if (e instanceof TypeError) {
                    this.showSnackbar('Cannot reach server. Please check your internet connection.', 'error');
                } else {
                    this.showSnackbar('Error generating invitation: ' + e.message, 'error');
                }
            }
        },

        // Bind the accepting user (us) to the roster person the inviter tagged
        // with this invite token. Best-effort: the band_member doc syncs after we
        // join, so if it isn't local yet this no-ops and loadData() retries later.
        async _linkRosterOnAccept(token) {
            if (!token) return;
            try {
                const myPubkey = window.Auth.getPubkey();
                if (!myPubkey) return;
                const members = await DB.getAllBandMembers();
                const target = members.find(m => m.pendingInviteToken === token);
                if (!target) return; // roster doc not synced to us yet
                // Append our key to this roster person's device list (ordered
                // oldest-first). Many keys → one roster identity/role.
                const keys = this.memberPubkeys(target);
                if (!keys.includes(myPubkey)) keys.push(myPubkey);
                target.pubkeys = keys;
                delete target.pubkey; // migrate legacy singular
                if (!target.linkedAt) target.linkedAt = new Date().toISOString();
                delete target.pendingInviteToken;
                await DB.updateBandMember(target);
                this.bandMembers = await DB.getAllBandMembers();
                sessionStorage.removeItem('pendingRosterLinkToken');
                console.log('🔗 Linked to roster member:', target.name);
            } catch (e) {
                console.warn('roster link on accept failed:', e.message);
            }
        },

        resetInviteForm() {
            this.inviteMemberEmail = '';
            this.inviteMemberRole = 'member';
            this.generatedInviteLink = '';
            this.generatedInviteToken = '';
            this.inviteMessageTemplate = '';
        },

        async copyInviteLink() {
            try {
                await navigator.clipboard.writeText(this.generatedInviteLink);
                this.inviteCopied = true;
                setTimeout(() => {
                    this.inviteCopied = false;
                }, 2000);
                console.log('✅ Invite link copied to clipboard');
            } catch (e) {
                console.error('Failed to copy invite link:', e);
                this.showSnackbar('Failed to copy link', 'error');
            }
        },

        async copyInviteMessage() {
            try {
                await navigator.clipboard.writeText(this.inviteMessageTemplate);
                this.messageCopied = true;
                setTimeout(() => {
                    this.messageCopied = false;
                }, 2000);
                console.log('✅ Invite message copied to clipboard');
            } catch (e) {
                console.error('Failed to copy invite message:', e);
                this.showSnackbar('Failed to copy message', 'error');
            }
        },

        async confirmRemoveMember(member) {
            const memberEmail = this.tenantMemberName(member);
            const confirmed = await this.showConfirmation(
                'Remove Member',
                `Are you sure you want to remove ${memberEmail} from ${this.currentBandName}?`,
                'Remove',
                true
            );

            if (confirmed) {
                await this.removeMember(member);
            }
        },

        async removeMember(member) {
            try {
                // `userHash` is the raw hash; older shapes only had a `user_`-
                // prefixed `userId`. removeMemberByHash strips either.
                const hash = member.userHash || member.userId;
                await window.tenantManager.removeMemberByHash(this.currentBandTenantId, hash);
                this.currentBandMembers = this.currentBandMembers.filter(
                    m => (m.userHash || m.userId) !== hash,
                );
                this.showSnackbar(`Removed ${this.tenantMemberName(member)} from the band`);
                await this.loadBandMembers();
            } catch (e) {
                console.error('Error removing member:', e);
                if (e instanceof TypeError) {
                    this.showSnackbar('Cannot reach server. Please check your internet connection.', 'error');
                } else if (/\b403\b/.test(e.message || '')) {
                    this.showSnackbar('You do not have permission to remove members', 'error');
                } else {
                    this.showSnackbar('Error removing member: ' + (e.message || e), 'error');
                }
            }
        },

        async confirmLeaveBand() {
            const currentBand = this.userBands.find(b => b._id === this.currentBandTenantId || b.tenantId === this.currentBandTenantId);
            const bandName = currentBand?.name || 'Unknown Band';

            const confirmed = await this.showConfirmation(
                'Leave Band',
                `Are you sure you want to leave "${bandName}"? You will lose access to all equipment and gigs in this band.`,
                'Leave Band',
                true  // danger style
            );

            if (confirmed) {
                await this.leaveBand();
            }
        },

        async leaveBand() {
            try {
                const bandToLeave = this.userBands.find(
                    b => b._id === this.currentBandTenantId || b.tenantId === this.currentBandTenantId,
                );
                const leavingBandName = bandToLeave?.name || 'Unknown Band';

                try {
                    await window.tenantManager.leaveTenant(this.currentBandTenantId);
                } catch (e) {
                    if (e.message?.includes('403')) {
                        this.showSnackbar('Owners cannot leave. Transfer ownership or delete the band.', 'error');
                        return;
                    }
                    throw e;
                }

                // Remove from local list
                this.userBands = this.userBands.filter(
                    b => b._id !== this.currentBandTenantId && b.tenantId !== this.currentBandTenantId,
                );

                // Switch to first available band
                if (this.userBands.length > 0) {
                    this.currentBandTenantId = this.userBands[0]._id;
                    this.updateCurrentBandName();
                    DB.setTenant(this.userBands[0]._id);
                    await this.loadData();
                    await this.loadBandDetails();
                } else {
                    this.currentBandTenantId = null;
                    this.currentBandName = '';
                }

                this.showSnackbar(`Left "${leavingBandName}"`);
                console.log('✅ Successfully left band:', leavingBandName);
            } catch (e) {
                console.error('Error leaving band:', e);
                if (e instanceof TypeError) {
                    this.showSnackbar('Cannot reach server. Please check your internet connection.', 'error');
                } else {
                    this.showSnackbar('Error leaving band: ' + e.message, 'error');
                }
            }
        },

        async openDeleteBandConfirmation() {
            const confirmed = await this.showConfirmation(
                'Delete Band',
                `Are you sure you want to delete "${this.currentBandName}"? This will permanently delete all equipment and gigs in this band. This action cannot be undone.`,
                'Delete Band',
                true
            );
            
            if (confirmed) {
                await this.deleteBand();
            }
        },

        async deleteBand() {
            try {
                const bandToDelete = this.userBands.find(b => b._id === this.currentBandTenantId);
                const deletedBandName = bandToDelete?.bandName || bandToDelete?.name || 'Unknown Band';

                // Server-side cascade: DELETE /api/tenants/:tid removes the
                // tenant document; equipment/gigs/templates in that tenant
                // become orphans in D1 but are invisible to clients because
                // the DAL filters by `currentTenant`. If/when orphan GC is
                // needed it lives on the server, not the client.
                await window.tenantManager.deleteTenant(this.currentBandTenantId);

                // Update UI
                this.userBands = this.userBands.filter(b => b._id !== this.currentBandTenantId);
                if (this.userBands.length > 0) {
                    this.currentBandTenantId = this.userBands[0]._id;
                    this.updateCurrentBandName();
                    DB.setTenant(this.userBands[0]._id);
                    await this.loadData();
                    await this.loadBandDetails();
                } else {
                    this.currentBandTenantId = null;
                    this.currentBandName = '';
                }

                this.showSnackbar(`Band "${deletedBandName}" has been deleted`);
            } catch (e) {
                console.error('Error deleting band:', e);
                this.showSnackbar('Error deleting band. Changes not saved.', 'error');
            }
        }
    }));
});
