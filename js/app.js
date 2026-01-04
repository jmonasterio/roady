// Alpine.js main application
; document.addEventListener('alpine:init', () => {
    Alpine.data('roady', () => ({
        // State
        currentView: 'gigs',
        equipmentTab: 'catalog', // 'catalog' or 'templates'
        equipment: [],
        gigTypes: [],
        gigs: [],
        selectedGigId: null,
        selectedGig: null,
        gigChecklistMode: null, // 'leavingForGig' or 'leavingFromGig'

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
        newBandName: '',
        bandBeingEdited: { name: '' },
        bandNameOriginal: '',
        currentBandMembers: [],
        isCreatingBand: false,  // Prevent double submission
        showInviteMemberDialog: false,
        inviteMemberEmail: '',
        inviteMemberRole: 'member',

        // Authentication state
        isAuthenticated: false,
        
        // Retry state
        isRetrying: false,
        retryInterval: null,

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
            arrivalTime: '',
            doorsOpenTime: '',
            mapLink: ''
        },
        newItemForGig: {
            equipmentId: '',
            newEquipmentName: '',
            addedEquipmentId: null,
            addedEquipmentName: ''
        },
        options: {
            mycouchBaseUrl: 'https://db.argw.com',
            tenantId: ''
        },
        currentDbName: '',
        currentJwtToken: '',
        jwtCopied: false,
        syncStatus: 'idle',
        syncError: null,
        syncRetryCount: 0,

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

        // Initialize
        async init() {
            console.log('🚀 Roady App Initializing...');
            this.isLoading = true;

            // 1. Wait for Clerk to load
            if (!window.Clerk) {
                console.log('⏳ Waiting for Clerk...');
                // Simple retry mechanism
                let retries = 0;
                while (!window.Clerk && retries < 20) {
                    await new Promise(r => setTimeout(r, 100));
                    retries++;
                }
            }

            if (window.Clerk) {
                await Clerk.load();
            } else {
                console.error('❌ Clerk failed to load');
                return;
            }

            // 2. Check Authentication
            if (!Clerk.isSignedIn) {
                console.log('👤 User not signed in - showing sign-in');
                this.isAuthenticated = false;
                this.isLoading = false;
                // Mount sign-in UI
                const mainContent = document.querySelector('main.container');
                if (mainContent) {
                    mainContent.innerHTML = '<div id="sign-in-container" style="display: flex; justify-content: center; margin-top: 2rem;"></div>';
                    Clerk.mountSignIn(document.getElementById('sign-in-container'), {
                        redirectUrl: window.location.origin + '/roady'
                    });
                }
                return;
            }

            // User is authenticated
            this.isAuthenticated = true;

            console.log('👤 User signed in:', Clerk.user.primaryEmailAddress?.emailAddress);

            // 3. Load Options first (before tenant init, so we have mycouchBaseUrl)
            await this.loadOptions();
            
            // Set current database name based on environment
            this.currentDbName = window.location.hostname === 'localhost' ? 'roady-staging' : 'roady';

            // Load JWT token for display in settings
            await this.loadJwtToken();

            // 4. Initialize Tenant Context with loaded options
            try {
                console.log('🏢 Initializing Tenant Context...');
                console.log('🔗 Passing mycouchBaseUrl to TenantManager:', this.options.mycouchBaseUrl);
                const tenantManager = new TenantManager(this.options.mycouchBaseUrl);
                window.tenantManager = tenantManager;
                console.log('✅ TenantManager created with URL:', tenantManager.mycouchBaseUrl);

                const tenant = await tenantManager.initializeTenantContext();
                this.options.tenantId = tenant.tenantId;

                // Set tenant in DB layer
                DB.setTenant(tenant.tenantId);

                console.log('✅ Tenant Initialized:', tenant.name);

                // Tenant initialized - band selector will display it

            } catch (e) {
                console.error('❌ Tenant initialization failed:', e);
                console.warn('⚠️ Continuing in offline mode - MyCouch may be unavailable');
                // Start background reconnection attempts
                this.startBackgroundRetry();
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

            // Load current band details
            await this.loadBandDetails();

            // Initialize PouchDB first
            await this.loadData();
            this.isLoading = false;

            // Note: Active tenant is now managed via session documents (per-device)
            // No need to sync to server or refresh JWT - session service handles it

            // 5. Setup Sync (uses mycouchBaseUrl, not couchDbUrl)
            this.setupSyncListeners();
            if (this.options.mycouchBaseUrl) {
                this.enableSync();
            }

            // 6. Mount User Button
            this.mountUserButton();
        },

        mountUserButton() {
            const navBar = document.querySelector('nav.container-fluid');
            if (!navBar) return;

            let container = document.getElementById('user-button-container');
            if (!container) {
                container = document.createElement('div');
                container.id = 'user-button-container';
                container.style.display = 'inline-block';

                const navLists = navBar.querySelectorAll('ul');
                if (navLists.length > 1) {
                    const li = document.createElement('li');
                    li.appendChild(container);
                    navLists[1].appendChild(li);
                }
            }

            if (!container.hasChildNodes()) {
                Clerk.mountUserButton(container);
            }
        },

        startBackgroundRetry() {
            if (this.isRetrying || this.retryInterval) {
                return; // Already retrying
            }

            this.isRetrying = true;
            console.log('🔄 Starting background reconnection attempts every 5 seconds...');

            this.retryInterval = setInterval(async () => {
                try {
                    console.log('🔄 Attempting to reconnect...');
                    const tenant = await window.tenantManager.initializeTenantContext();
                    
                    // Success! Stop retrying
                    console.log('✅ Reconnected! Tenant:', tenant.name);
                    clearInterval(this.retryInterval);
                    this.retryInterval = null;
                    this.isRetrying = false;
                    
                    // Reload bands
                    await this.loadBands();
                } catch (error) {
                    console.log('⏳ Still waiting for MyCouch...');
                }
            }, 10000); // Try every 10 seconds
        },

        async loadData() {
            this.equipment = await DB.getAllEquipment();
            this.gigTypes = await DB.getAllGigTypes();
            this.gigs = await DB.getAllGigs();
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

                // Set defaults if missing
                if (!this.options.mycouchBaseUrl) {
                    console.log('🔧 Setting default MyCouch URL');
                    this.options.mycouchBaseUrl = 'http://argw.com:5985';
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
                    console.log('🔗 MyCouch URL changed, updating TenantManager:', this.options.mycouchBaseUrl);
                    window.tenantManager.mycouchBaseUrl = this.options.mycouchBaseUrl;
                    
                    // Restart retry loop with new URL
                    if (this.retryInterval) {
                        clearInterval(this.retryInterval);
                        this.startBackgroundRetry();
                    }
                }
            }

            // Update sync when URL changes (sync uses mycouchBaseUrl)
            if (this.options.mycouchBaseUrl && this.options.mycouchBaseUrl.trim()) {
                this.enableSync();
            } else {
                this.disableSync();
            }
        },

        async loadJwtToken() {
            try {
                // Request token - use standard Clerk session token
                const token = await window.Clerk?.session?.getToken?.();
                if (token) {
                    this.currentJwtToken = token;
                    console.log('✅ JWT token loaded for settings display');
                } else {
                    console.warn('⚠️ Could not get JWT token from Clerk');
                    this.currentJwtToken = '(No token available)';
                }
            } catch (e) {
                console.error('Failed to load JWT token:', e);
                this.currentJwtToken = '(Error loading token)';
            }
        },

        async copyJwtToken() {
            try {
                await navigator.clipboard.writeText(this.currentJwtToken);
                this.jwtCopied = true;
                setTimeout(() => {
                    this.jwtCopied = false;
                }, 2000);
                console.log('✅ JWT token copied to clipboard');
            } catch (e) {
                console.error('Failed to copy JWT token:', e);
                alert('Failed to copy token to clipboard');
            }
        },

        // Sync methods
        async enableSync() {
            console.log('📡 enableSync called with mycouchBaseUrl:', this.options.mycouchBaseUrl);
            
            if (!this.options.mycouchBaseUrl) {
                console.warn('⚠️ enableSync: no mycouchBaseUrl in options');
                return;
            }
            
            // Guard against Sync not being loaded
            if (!window.Sync) {
                console.warn('⚠️ Sync module not loaded yet, deferring sync setup');
                setTimeout(() => this.enableSync(), 100);
                return;
            }

            this.syncError = null;
            // Construct sync URL from MyCouch proxy base URL
            // Determine database name based on environment
            const dbName = window.location.hostname === 'localhost' ? 'roady-staging' : 'roady';
            const syncUrl = `${this.options.mycouchBaseUrl}/${dbName}`;
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
            // Exponential backoff: 5s, 10s, 20s, 30s, 30s...
            const baseDelay = 5000; // 5 seconds
            const maxDelay = 30000; // 30 seconds
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
                            this.syncRetryCount = 0; // Reset on success
                        } else {
                            this.scheduleRetrySync(syncUrl); // Retry again
                        }
                    })
                    .catch(error => {
                        console.warn('⚠️ Sync retry failed:', error.message);
                        this.scheduleRetrySync(syncUrl); // Retry again
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
            window.addEventListener('db-sync-change', (e) => {
                this.syncStatus = window.Sync ? Sync.getSyncStatus() : 'idle';
                // Reload data when sync receives changes
                this.loadData();
                this.loadDeletedItems();
            });

            window.addEventListener('db-sync-error', (e) => {
                this.syncError = `Sync error: ${e.detail.error.message || 'Unknown error'}`;
                this.syncStatus = window.Sync ? Sync.getSyncStatus() : 'idle';
            });

            window.addEventListener('db-sync-paused', (e) => {
                this.syncStatus = window.Sync ? Sync.getSyncStatus() : 'idle';
            });
        },

        getSyncStatusText() {
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

            // Setup sync if URL is configured
            if (this.options.couchDbUrl) {
                this.enableSync();
            }
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
                'Delete Template',
                'Delete this template? Existing gigs will keep their current equipment list.',
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
                    `Deleted template "${gigType?.name || 'Template'}"`,
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
                alert('Please fill in Name, Date, and Template');
                return;
            }

            if (this.editingGig) {
                // Check if gig type is changing
                const gigTypeChanged = this.editingGig.gigTypeId !== this.newGig.gigTypeId;

                if (gigTypeChanged) {
                    // Check if there's checklist progress
                    if (this.gigHasChecklistProgress(this.editingGig)) {
                        const confirmed = await this.showConfirmation(
                            'Change Template?',
                            'Changing the template will reset all checklist progress. Are you sure you want to continue?',
                            'Change Template',
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
                arrivalTime: gig.arrivalTime || '',
                doorsOpenTime: gig.doorsOpenTime || '',
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

        resetNewGig() {
            this.newGig = { name: '', date: '', gigTypeId: '', arrivalTime: '', doorsOpenTime: '', mapLink: '' };
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
                    name: 'Default Template',
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

        // Band management methods
        async loadBands() {
            try {
                // Refresh tenant list from server (not cached)
                if (!window.tenantManager) {
                    console.error('❌ TenantManager not available');
                    return;
                }
                
                // Reload tenants from server to get latest (including newly created bands)
                const tenantsResponse = await window.tenantManager.getMyTenants();
                this.userBands = Array.isArray(tenantsResponse) ? tenantsResponse : [];
                console.log('✅ Bands refreshed from server:', this.userBands);
                
                // Load band info document for each band to get proper band names
                // Use parallel loading without context switching for efficiency
                const bandLoadPromises = this.userBands.map(async (band) => {
                    try {
                        // Get the tenant ID (should be _id from the virtual endpoint)
                        const bandId = band._id;
                        if (!bandId) {
                            console.warn('⚠️ Band missing _id:', band);
                            band.bandName = band.name || 'Unknown Band';
                            return;
                        }
                        
                        // Load band-info directly without context switching (more efficient)
                        const bandInfo = await DB.getBandInfoForTenant(bandId);
                        if (bandInfo && bandInfo.name) {
                            band.bandName = bandInfo.name;
                            console.log(`✅ Loaded band-info for ${bandId}: "${bandInfo.name}"`);
                        } else {
                            console.warn(`⚠️ No band-info found for ${bandId}, using server name fallback`);
                            // Use name from server response as fallback
                            band.bandName = band.name || bandId;
                        }
                    } catch (e) {
                        console.error(`❌ Error loading band-info for ${band._id}:`, e);
                        // Use server name as fallback on any error
                        band.bandName = band.name || band._id || 'Unknown Band';
                    }
                });
                
                // Wait for all band info loads to complete (parallel execution)
                await Promise.all(bandLoadPromises);
                
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
            // Band-info is always the source of truth
            this.currentBandName = currentBand?.bandName || '';
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
                const token = await Clerk.session?.getToken();
                if (!token) {
                    console.error('No auth token available');
                    this.showSnackbar('Authentication error: Please sign in again', 'error');
                    this.isCreatingBand = false;
                    return;
                }
                
                const bandName = this.newBandName;
                
                // CRITICAL: Create tenant via /__tenants endpoint (PouchDB)
                // This ensures the tenant is properly registered in couch-sitter with applicationId
                // so it can be deleted cleanly via DELETE /__tenants
                try {
                    console.log('📤 Creating tenant via /__tenants endpoint:', bandName);
                    const response = await fetch(`${this.options.mycouchBaseUrl}/__tenants`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ name: bandName })
                    });

                    if (!response.ok) {
                        const error = await response.json();
                        throw new Error(error.detail || 'Failed to create tenant');
                    }

                    const tenantResponse = await response.json();
                    const newBandId = tenantResponse._id; // Use the tenant ID from server
                    console.log('✅ Tenant created via backend:', tenantResponse);
                    
                    this.showCreateBandDialog = false;
                    this.newBandName = '';
                    
                    // Create band-info document in the new tenant's roady database
                    try {
                        const currentTenant = DB.tenant;
                        DB.setTenant(newBandId);
                        const result = await DB.saveBandInfo({ name: bandName });
                        console.log('✅ Created band-info document for:', newBandId, 'Result:', result);
                        if (currentTenant) {
                            DB.setTenant(currentTenant);
                        }
                    } catch (e) {
                        console.error('❌ Failed to create band-info for', newBandId, ':', e);
                    }
                    
                    // Construct tenant doc for local PouchDB (must match server format)
                    const newTenant = {
                        _id: `tenant_${newBandId}`,  // Internal format for local storage
                        type: 'tenant',
                        tenantId: newBandId,  // Virtual ID
                        name: bandName,
                        bandName: bandName,
                        role: 'owner',
                        personal: false,
                        memberCount: 1,
                        createdAt: new Date().toISOString(),
                        syncedAt: new Date().toISOString()
                    };
                    
                    // Save to local PouchDB so it syncs back to server
                    if (window.tenantManager?.tenantsDb) {
                        try {
                            await window.tenantManager.tenantsDb.put(newTenant);
                            console.log('✅ Saved new tenant to local PouchDB:', newTenant);
                        } catch (e) {
                            console.warn('⚠️ Failed to save to local PouchDB:', e);
                            // Continue anyway - band was created on server
                        }
                    }
                    
                    // Add new band to local app state
                    this.userBands.push(newTenant);
                    
                    // Also add to tenantManager's tenantList
                    if (window.tenantManager) {
                        window.tenantManager.tenantList.push(newTenant);
                    }
                    console.log('✅ Added new band to local lists:', newTenant);
                    
                    // Switch to new band (becomes active in JWT)
                    await this.switchBand(newBandId);
                    this.showSnackbar(`Created new band: ${bandName}`);
                    } catch (e) {
                    console.error('❌ Failed to create band via backend:', e);
                    this.showSnackbar('Error creating band: ' + e.message, 'error');
                    } finally {
                    this.isCreatingBand = false;
                    }
                    } catch (e) {
                    console.error('Error creating band:', e);
                    this.showSnackbar('Error creating band', 'error');
                    this.isCreatingBand = false;
                    }
        },

        // Band settings methods
        async loadBandDetails() {
            if (!this.currentBandTenantId) return;
            
            try {
                // Set tenant context for getBandInfo
                DB.setTenant(this.currentBandTenantId);
                const bandInfo = await DB.getBandInfo();
                if (bandInfo) {
                    this.bandBeingEdited = { name: bandInfo.name };
                    this.bandNameOriginal = bandInfo.name;
                    this.currentBandName = bandInfo.name;
                    console.log('✅ Band info loaded:', bandInfo);
                } else {
                    console.warn('⚠️ No band-info document found, using current band name');
                    this.bandBeingEdited = { name: this.currentBandName };
                    this.bandNameOriginal = this.currentBandName;
                }
            } catch (e) {
                console.error('❌ Error loading band details:', e);
            }
            
            await this.loadBandMembers();
        },

        async loadBandMembers() {
            // Members are already loaded in /__tenants response
            // Get members from current band info if available
            const bandInfo = this.userBands.find(b => b._id === this.currentBandTenantId);
            if (bandInfo && bandInfo.members) {
                this.currentBandMembers = bandInfo.members;
                console.log('✅ Band members loaded from /__tenants:', this.currentBandMembers);
            } else {
                this.currentBandMembers = [];
            }
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
                const bandInfo = {
                    name: this.bandBeingEdited.name,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };

                // Save to database (DB.saveBandInfo handles create vs update)
                await DB.saveBandInfo(bandInfo);
                
                // Update app state
                this.currentBandName = this.bandBeingEdited.name;
                
                // Update in userBands list
                const band = this.userBands.find(b => b._id === this.currentBandTenantId);
                if (band) {
                    band.bandName = this.bandBeingEdited.name;
                }
                
                this.bandNameOriginal = this.currentBandName;
                this.showSnackbar(`Band renamed to ${this.currentBandName}`);
            } catch (e) {
                console.error('Error saving band name:', e);
                this.showSnackbar('Error saving band name', 'error');
            }
        },

        async inviteMember() {
            if (!this.inviteMemberEmail.trim()) {
                this.showSnackbar('Email address is required', 'error');
                return;
            }

            try {
                const token = await Clerk.session?.getToken();
                const response = await fetch(`${this.options.mycouchBaseUrl}/invite`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ email: this.inviteMemberEmail, role: this.inviteMemberRole, tenantId: this.currentBandTenantId })
                });

                if (response.ok) {
                    this.showInviteMemberDialog = false;
                    this.inviteMemberEmail = '';
                    this.inviteMemberRole = 'member';
                    this.showSnackbar(`Invitation sent to ${this.inviteMemberEmail}`);
                    
                    // Reload band details
                    await this.loadBandDetails();
                } else {
                    const error = await response.json();
                    this.showSnackbar(`Failed to invite member: ${error.detail || 'Unknown error'}`, 'error');
                }
            } catch (e) {
                console.error('Error inviting member:', e);
                this.showSnackbar('Error inviting member', 'error');
            }
        },

        async openDeleteBandConfirmationForBand(band) {
            // Get the band name directly from the band object passed to us
            const bandNameToDelete = band.bandName || 'Unknown Band';
            
            // Set the band to delete (use _id from virtual endpoint)
            this.currentBandTenantId = band._id || band.tenantId;
            
            const confirmed = await this.showConfirmation(
                'Delete Band',
                `Are you sure you want to delete "${bandNameToDelete}"? This will permanently delete all equipment and gigs in this band. This action cannot be undone.`,
                'Delete Band',
                true
            );
            
            if (confirmed) {
                await this.deleteBand();
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
                // Capture band name before deletion
                const bandToDelete = this.userBands.find(b => b._id === this.currentBandTenantId);
                const deletedBandName = bandToDelete?.bandName || bandToDelete?.name || 'Unknown Band';
                
                const now = new Date().toISOString();
                
                // LOCAL-FIRST PATTERN: Soft-delete locally first, let sync handle server
                // Do NOT make direct API calls - let PouchDB replicate changes to server
                
                // 1. Soft-delete tenant document in local PouchDB
                if (window.tenantManager?.tenantsDb) {
                    try {
                        const virtualTenantId = this.getVirtualTenantId(this.currentBandTenantId);
                        const internalId = `tenant_${virtualTenantId}`;
                        const doc = await window.tenantManager.tenantsDb.get(internalId);
                        // Use deletedAt field to match server (not deleted: true)
                        doc.deletedAt = now;
                        doc.updatedAt = now;
                        await window.tenantManager.tenantsDb.put(doc);
                        console.log('✅ Marked local tenant as soft-deleted:', internalId);
                    } catch (e) {
                        if (e.status === 404) {
                            console.log('ℹ️ Tenant not in local PouchDB (may not have synced yet)');
                        } else {
                            console.warn('⚠️ Could not soft-delete tenant in local PouchDB:', e);
                            throw e; // Don't continue if we can't mark deletion
                        }
                    }
                }
                
                // 2. Soft-delete all band documents in local roady database
                try {
                    const db = DB.getDb();
                    const allDocs = await db.allDocs({include_docs: true});
                    const bandDocs = allDocs.rows
                        .map(row => row.doc)
                        .filter(doc => doc.tenant === this.currentBandTenantId)
                        .map(doc => ({
                            ...doc, 
                            deletedAt: now,
                            updatedAt: now
                        }));
                    
                    if (bandDocs.length > 0) {
                        await db.bulkDocs(bandDocs);
                        console.log('✅ Soft-deleted', bandDocs.length, 'documents for band:', this.currentBandTenantId);
                    }
                } catch (e) {
                    console.warn('⚠️ Could not soft-delete band documents:', e);
                    throw e; // Don't continue if local DB save fails
                }
                
                // 3. Update UI (remove from userBands list)
                this.userBands = this.userBands.filter(b => b._id !== this.currentBandTenantId);
                
                // 4. Switch to first available band
                if (this.userBands.length > 0) {
                    this.currentBandTenantId = this.userBands[0]._id;
                    this.updateCurrentBandName();
                    DB.setTenant(this.userBands[0]._id);
                    await this.loadData();
                    await this.loadBandDetails();
                }
                
                // 5. PouchDB sync will replicate soft-deleted documents to server automatically
                console.log('ℹ️ Band soft-deleted locally. PouchDB sync will replicate changes to server.');
                this.showSnackbar(`Band "${deletedBandName}" has been deleted`);
                
            } catch (e) {
                console.error('Error deleting band:', e);
                this.showSnackbar('Error deleting band. Changes not saved.', 'error');
            }
        }
    }));
});
