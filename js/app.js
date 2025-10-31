// Alpine.js main application
document.addEventListener('alpine:init', () => {
    Alpine.data('roady', () => ({
        // State
        currentView: 'gigs',
        equipment: [],
        gigTypes: [],
        gigs: [],
        selectedGigId: null,
        selectedGig: null,
        gigChecklistMode: null, // 'leavingForGig' or 'leavingFromGig'

        // Tenant state
        showTenantSelection: false,
        tenantIdInput: 'demo',

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

        // Initialize
        async init() {
            await this.loadOptions();

            // If no tenant, show selection dialog
            if (!this.options.tenantId) {
                this.showTenantSelection = true;
                return; // Don't load data yet
            }

            // Set tenant in DB layer
            DB.setTenant(this.options.tenantId);

            // Load data
            await this.loadData();
            this.setupSyncListeners();

            // Setup sync if URL is configured
            if (this.options.couchDbUrl) {
                this.enableSync();
            }
        },

        async loadData() {
            this.equipment = await DB.getAllEquipment();
            this.gigTypes = await DB.getAllGigTypes();
            this.gigs = await DB.getAllGigs();
        },

        // Options methods
        async loadOptions() {
            try {
                const saved = await DB.getOptions();
                if (saved && Object.keys(saved).length > 0) {
                    this.options = saved;
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
        enableSync() {
            if (!this.options.couchDbUrl) return;

            this.syncError = null;
            const success = DB.setupSync(this.options.couchDbUrl);

            if (!success) {
                this.syncError = 'Failed to connect to CouchDB server. Check URL.';
            }
        },

        disableSync() {
            DB.cancelSync();
            this.syncStatus = 'idle';
            this.syncError = null;
        },

        setupSyncListeners() {
            window.addEventListener('db-sync-change', (e) => {
                this.syncStatus = DB.getSyncStatus();
                // Reload data when sync receives changes
                this.loadData();
            });

            window.addEventListener('db-sync-error', (e) => {
                this.syncError = `Sync error: ${e.detail.error.message || 'Unknown error'}`;
                this.syncStatus = DB.getSyncStatus();
            });

            window.addEventListener('db-sync-paused', (e) => {
                this.syncStatus = DB.getSyncStatus();
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
            await this.loadData();
            this.setupSyncListeners();

            // Setup sync if URL is configured
            if (this.options.couchDbUrl) {
                this.enableSync();
            }
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
            if (confirm('Delete this equipment item?')) {
                await DB.deleteEquipment(id);
                await this.loadData();
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

                // Update future gigs with new equipment list
                await this.updateFutureGigs(this.editingGigType._id, this.newGigType.equipment);
            } else {
                await DB.addGigType(this.newGigType);
            }

            await this.loadData();
            this.cancelGigTypeEdit();
        },

        async updateFutureGigs(gigTypeId, newEquipment) {
            const today = new Date().toISOString().split('T')[0];
            const futureGigs = this.gigs.filter(g =>
                g.gigTypeId === gigTypeId && g.date >= today
            );

            for (const gig of futureGigs) {
                // Build new checklists with the updated equipment (expand quantities)
                const newChecklist = [];
                newEquipment.forEach(({ equipmentId, quantity }) => {
                    for (let i = 1; i <= quantity; i++) {
                        // Preserve checked state if item already exists
                        const existingLoadout = gig.loadoutChecklist.find(item =>
                            item.equipmentId === equipmentId && item.itemNumber === i
                        );
                        const existingLoadin = gig.loadinChecklist.find(item =>
                            item.equipmentId === equipmentId && item.itemNumber === i
                        );

                        newChecklist.push({
                            loadout: {
                                equipmentId,
                                itemNumber: i,
                                checked: existingLoadout?.checked || false
                            },
                            loadin: {
                                equipmentId,
                                itemNumber: i,
                                checked: existingLoadin?.checked || false
                            }
                        });
                    }
                });

                gig.loadoutChecklist = newChecklist.map(item => item.loadout);
                gig.loadinChecklist = newChecklist.map(item => item.loadin);

                await DB.updateGig(gig);
            }

            // Refresh selected gig if it was one of the updated ones
            if (this.selectedGigId && futureGigs.some(g => g._id === this.selectedGigId)) {
                this.selectedGig = await DB.getGig(this.selectedGigId);
            }
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
            if (confirm('Delete this gig type?')) {
                await DB.deleteGigType(id);
                await this.loadData();
            }
        },

        resetNewGigType() {
            this.newGigType = { name: '', equipment: [] };
        },

        getEquipmentCount(gigType) {
            // Handle both old and new format
            if (gigType.equipment) {
                // New format: sum up quantities
                return gigType.equipment.reduce((sum, item) => sum + item.quantity, 0);
            } else if (gigType.equipmentIds) {
                // Old format: just count
                return gigType.equipmentIds.length;
            }
            return 0;
        },

        // Gig methods
        async saveGig() {
            if (!this.newGig.name.trim() || !this.newGig.date || !this.newGig.gigTypeId) return;

            if (this.editingGig) {
                // Check if gig type is changing
                const gigTypeChanged = this.editingGig.gigTypeId !== this.newGig.gigTypeId;

                if (gigTypeChanged) {
                    // Check if there's checklist progress
                    if (this.gigHasChecklistProgress(this.editingGig)) {
                        if (!confirm('Changing the template will reset all checklist progress. Are you sure you want to continue?')) {
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

            if (confirm(`Are you sure you want to delete "${this.editingGig.name}"? This cannot be undone.`)) {
                await DB.deleteGig(this.editingGig._id);
                await this.loadData();
                this.cancelGigEdit();
            }
        },

        async deleteGig(id) {
            if (confirm('Delete this gig?')) {
                await DB.deleteGig(id);
                await this.loadData();
                this.closeGigDetail();
            }
        },

        resetNewGig() {
            this.newGig = { name: '', date: '', gigTypeId: '', arrivalTime: '', doorsOpenTime: '', mapLink: '' };
        },

        async viewGigDetail(gigId, mode) {
            this.selectedGigId = gigId;
            this.gigChecklistMode = mode; // 'leavingForGig' or 'leavingFromGig'
            this.selectedGig = await DB.getGig(gigId);
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
        }
    }));
});
