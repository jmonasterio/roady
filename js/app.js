// Alpine.js main application
; document.addEventListener('alpine:init', () => {
    Alpine.data('roady', () => ({
        // State
        currentView: 'gigs',
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
        showInviteMemberDialog: false,
        inviteMemberEmail: '',
        inviteMemberRole: 'member',

        // Authentication state
        isAuthenticated: false,

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
            couchDbUrl: '',
            tenantId: ''
        },
        syncStatus: 'idle',
        syncError: null,

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
                    Clerk.mountSignIn(document.getElementById('sign-in-container'));
                }
                return;
            }

            // User is authenticated
            this.isAuthenticated = true;

            console.log('👤 User signed in:', Clerk.user.primaryEmailAddress?.emailAddress);

            // 3. Initialize Tenant Context
            try {
                console.log('🏢 Initializing Tenant Context...');
                const tenantManager = new TenantManager();
                window.tenantManager = tenantManager;

                const tenant = await tenantManager.initializeTenantContext();
                this.options.tenantId = tenant.tenantId;

                // Set tenant in DB layer
                DB.setTenant(tenant.tenantId);

                console.log('✅ Tenant Initialized:', tenant.name);

                // Tenant initialized - band selector will display it

            } catch (e) {
                console.error('❌ Tenant initialization failed:', e);
                // Continue anyway, maybe we have cached options
            }

            // 4. Load Options and Data
            await this.loadOptions();

            // If we still don't have a tenant ID (and init failed), try to get from options
            if (!this.options.tenantId) {
                console.warn('⚠️ No tenant context available');
                // Show tenant selection or error
            }

            // Load user's bands
            await this.loadBands();

            // Load current band details
            await this.loadBandDetails();

            await this.loadData();
            this.isLoading = false;

            // 5. Setup Sync
            this.setupSyncListeners();
            if (this.options.couchDbUrl) {
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
                if (saved && Object.keys(saved).length > 0) {
                    this.options = saved;
                }

                // Default sync URL if missing
                if (!this.options.couchDbUrl) {
                    console.log('🔧 Setting default CouchDB URL');
                    this.options.couchDbUrl = 'http://localhost:5985/roady';
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

            // Update sync when URL changes
            if (this.options.couchDbUrl && this.options.couchDbUrl.trim()) {
                this.enableSync();
            } else {
                this.disableSync();
            }
        },

        // Sync methods
        async enableSync() {
            if (!this.options.couchDbUrl) return;

            this.syncError = null;
            const success = await Sync.setupSync(DB.getDb(), this.options.couchDbUrl);

            if (!success) {
                this.syncError = 'Failed to connect to CouchDB server. Check URL.';
            }
        },

        disableSync() {
            Sync.cancelSync();
            this.syncStatus = 'idle';
            this.syncError = null;
        },

        setupSyncListeners() {
            window.addEventListener('db-sync-change', (e) => {
                this.syncStatus = Sync.getSyncStatus();
                // Reload data when sync receives changes
                this.loadData();
                this.loadDeletedItems();
            });

            window.addEventListener('db-sync-error', (e) => {
                this.syncError = `Sync error: ${e.detail.error.message || 'Unknown error'}`;
                this.syncStatus = Sync.getSyncStatus();
            });

            window.addEventListener('db-sync-paused', (e) => {
                this.syncStatus = Sync.getSyncStatus();
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
                // Get bands from tenantManager (already loaded during init)
                if (!window.tenantManager) {
                    console.error('❌ TenantManager not available');
                    return;
                }
                
                this.userBands = window.tenantManager.getTenantList();
                console.log('✅ Bands loaded from tenantManager:', this.userBands);
                
                // Load band info document for each band to get proper band names
                for (let band of this.userBands) {
                    try {
                        const currentTenant = DB.tenant;
                        DB.setTenant(band.tenantId);
                        
                        const bandInfo = await DB.getBandInfo();
                        if (bandInfo && bandInfo.name) {
                            band.bandName = bandInfo.name;
                        }
                        
                        // Try to get member count
                        const token = await Clerk.session?.getToken();
                        try {
                            const membersResponse = await fetch(`http://localhost:5985/api/tenants/${band.tenantId}/members`, {
                                headers: { 'Authorization': `Bearer ${token}` }
                            });
                            if (membersResponse.ok) {
                                const data = await membersResponse.json();
                                band.memberCount = (data.members || []).length;
                            }
                        } catch (e) {
                            console.warn('Could not load member count for band:', band.tenantId);
                        }
                        
                        // Restore original tenant
                        if (currentTenant) {
                            DB.setTenant(currentTenant);
                        }
                    } catch (e) {
                        console.warn('Could not load band info for:', band.tenantId, e);
                    }
                }
                
                // Determine which band to select
                // Priority: 1) Last selected band, 2) Current tenant from tenantManager, 3) First band
                
                const lastSelectedBandId = localStorage.getItem('lastSelectedBandId');
                if (lastSelectedBandId && this.userBands.some(b => b.tenantId === lastSelectedBandId)) {
                    // Use last selected band if it still exists
                    this.currentBandTenantId = lastSelectedBandId;
                    console.log('✅ Using last selected band:', lastSelectedBandId);
                } else {
                    // Fall back to current tenant or first band
                    const currentTenant = window.tenantManager.getCurrentTenant();
                    if (currentTenant) {
                        this.currentBandTenantId = currentTenant.tenantId;
                        console.log('✅ Using current tenant:', currentTenant.tenantId);
                    } else if (this.userBands.length > 0) {
                        this.currentBandTenantId = this.userBands[0].tenantId;
                        console.log('✅ Using first band:', this.userBands[0].tenantId);
                    }
                }
                
                // Update current band name
                this.updateCurrentBandName();
            } catch (e) {
                console.error('❌ Error loading bands:', e);
            }
        },

        updateCurrentBandName() {
            const currentBand = this.userBands.find(b => b.tenantId === this.currentBandTenantId);
            this.currentBandName = currentBand?.name || 'My First Band';
        },

        async switchBand(bandTenantId) {
            try {
                console.log('🔄 Switching to band:', bandTenantId);
                
                // Switch tenant in tenantManager
                if (window.tenantManager) {
                    await window.tenantManager.switchTenant(bandTenantId);
                }
                
                // Update app state
                this.currentBandTenantId = bandTenantId;
                this.updateCurrentBandName();
                
                // Set tenant in DB layer
                DB.setTenant(bandTenantId);
                
                // Save last selected band to local storage
                localStorage.setItem('lastSelectedBandId', bandTenantId);
                
                // Set as active tenant in Clerk metadata
                try {
                    const token = await Clerk.session?.getToken();
                    if (token) {
                        const chooseTenantResponse = await fetch(`http://localhost:5985/choose-tenant`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                            },
                            body: JSON.stringify({ tenantId: bandTenantId })
                        });
                        if (!chooseTenantResponse.ok) {
                            console.warn('Failed to set active tenant in Clerk:', chooseTenantResponse.status);
                        } else {
                            // CRITICAL: Reload session to sync the updated metadata from Clerk
                            console.log('Reloading session to sync active_tenant_id from Clerk...');
                            await Clerk.session?.reload();
                            // Get a fresh token that includes the updated active_tenant_id claim
                            const freshToken = await Clerk.session?.getToken({ force: true });
                            console.log('Fresh token obtained with updated tenant claim');
                        }
                    }
                } catch (e) {
                    console.warn('Error setting active tenant:', e);
                }
                
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

        openCreateBandDialog() {
            this.newBandName = '';
            this.showCreateBandDialog = true;
        },

        async createBand() {
            if (!this.newBandName.trim()) {
                this.showSnackbar('Band name is required', 'error');
                return;
            }

            try {
                const token = await Clerk.session?.getToken();
                if (!token) {
                    console.error('No auth token available');
                    this.showSnackbar('Authentication error: Please sign in again', 'error');
                    return;
                }
                
                console.log('Creating band with token:', token.substring(0, 20) + '...');
                const response = await fetch('http://localhost:5985/api/tenants', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ name: this.newBandName })
                });

                if (response.ok) {
                    const data = await response.json();
                    const newBandId = data.tenantId || data.id;
                    
                    this.showCreateBandDialog = false;
                    const bandName = this.newBandName;
                    this.newBandName = '';
                    
                    // Set as active tenant in Clerk metadata
                    try {
                        const chooseTenantResponse = await fetch(`http://localhost:5985/choose-tenant`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                            },
                            body: JSON.stringify({ tenantId: newBandId })
                        });
                        if (!chooseTenantResponse.ok) {
                            console.warn('Failed to set active tenant:', chooseTenantResponse.status);
                        } else {
                            // CRITICAL: Reload session to sync the updated metadata from Clerk
                            console.log('Reloading session to sync active_tenant_id from Clerk...');
                            await Clerk.session?.reload();
                            // Get a fresh token that includes the updated active_tenant_id claim
                            const freshToken = await Clerk.session?.getToken({ force: true });
                            console.log('Fresh token obtained with updated tenant claim');
                        }
                    } catch (e) {
                        console.warn('Error setting active tenant:', e);
                    }
                    
                    // Reload bands list
                    await this.loadBands();
                    
                    // Switch to new band
                    await this.switchBand(newBandId);
                    this.showSnackbar(`Created new band: ${bandName}`);
                } else {
                    let errorMsg = `Failed to create band (${response.status})`;
                    try {
                        const error = await response.json();
                        errorMsg = error.message || errorMsg;
                    } catch (e) {
                        // Response wasn't JSON, use status message
                    }
                    console.error('Band creation error:', response.status, errorMsg);
                    this.showSnackbar(errorMsg, 'error');
                }
            } catch (e) {
                console.error('Error creating band:', e);
                this.showSnackbar('Error creating band', 'error');
            }
        },

        // Band settings methods
        async loadBandDetails() {
            if (!this.currentBandTenantId) return;
            
            try {
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
            if (!this.currentBandTenantId) return;
            
            try {
                const token = await Clerk.session?.getToken();
                const response = await fetch(`http://localhost:5985/api/tenants/${this.currentBandTenantId}/members`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (response.ok) {
                    const data = await response.json();
                    this.currentBandMembers = data.members || [];
                    console.log('✅ Band members loaded:', this.currentBandMembers);
                } else {
                    console.warn('⚠️ Failed to load band members');
                    this.currentBandMembers = [];
                }
            } catch (e) {
                console.error('❌ Error loading band members:', e);
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
                const band = this.userBands.find(b => b.tenantId === this.currentBandTenantId);
                if (band) {
                    band.name = this.bandBeingEdited.name;
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
                const response = await fetch(`http://localhost:5985/api/tenants/${this.currentBandTenantId}/invitations`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ email: this.inviteMemberEmail, role: this.inviteMemberRole })
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

        openDeleteBandConfirmation() {
            this.showConfirmation(
                'Delete Band',
                `Are you sure you want to delete "${this.currentBandName}"? This will permanently delete all equipment and gigs in this band. This action cannot be undone.`,
                'Delete Band',
                'Cancel',
                async () => {
                    await this.deleteBand();
                },
                true
            );
        },

        async deleteBand() {
            try {
                // Delete via mycouch API (handled by separate effort)
                const token = await Clerk.session?.getToken();
                const response = await fetch(`http://localhost:5985/api/tenants/${this.currentBandTenantId}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (response.ok || response.status === 204) {
                    const deletedBandName = this.currentBandName;
                    
                    // Remove from userBands list
                    this.userBands = this.userBands.filter(b => b.tenantId !== this.currentBandTenantId);
                    
                    // Switch to first available band
                    if (this.userBands.length > 0) {
                        this.currentBandTenantId = this.userBands[0].tenantId;
                        this.updateCurrentBandName();
                        DB.setTenant(this.userBands[0].tenantId);
                        await this.loadData();
                        await this.loadBandDetails();
                    }
                    
                    this.showSnackbar(`Band "${deletedBandName}" has been deleted`);
                } else {
                    const error = await response.json();
                    this.showSnackbar(`Failed to delete band: ${error.detail || 'Unknown error'}`, 'error');
                }
            } catch (e) {
                console.error('Error deleting band:', e);
                this.showSnackbar('Error deleting band', 'error');
            }
        }
    }));
});
