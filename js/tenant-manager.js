// Tenant Management Service
// Handles tenant detection, selection, and JWT metadata management

class TenantManager {
    constructor() {
        this.mycouchBaseUrl = 'http://localhost:5985'; // MyCouch proxy
        this.currentTenant = null;
        this.tenantList = [];
    }

    /**
     * Initialize tenant context after Clerk login
     * This is the critical flow: /my-tenants -> pick first -> /choose-tenant -> JWT refresh
     */
    async initializeTenantContext() {
        try {
            console.log('🔍 Initializing tenant context...');

            // Step 1: Get all user's tenants
            const tenantList = await this.getMyTenants();
            this.tenantList = tenantList.tenants || [];

            console.log(`📋 Found ${this.tenantList.length} tenants:`, this.tenantList);

            // Step 2: Select first tenant (personal tenant initially)
            const firstTenant = this.tenantList[0];
            if (!firstTenant) {
                throw new Error('No tenants found for user - user may not be properly set up');
            }

            console.log(`🎯 Selected tenant: ${firstTenant.name} (${firstTenant.tenantId})`);
            this.currentTenant = firstTenant;

            // Step 3: Set active tenant in Clerk session metadata
            await this.setActiveTenant(firstTenant.tenantId);

            // Step 4: Trigger JWT metadata refresh
            await this.refreshJWTWithTenant();

            console.log('✅ Tenant context initialized successfully');
            return firstTenant;

        } catch (error) {
            console.error('❌ Failed to initialize tenant context:', error);
            throw error;
        }
    }

    /**
     * Get all tenants accessible to the user
     */
    async getMyTenants() {
        console.log('🔍 Fetching user tenants...');

        const jwt = await this.getClerkToken();
        if (!jwt) {
            throw new Error('No JWT token available - user not authenticated');
        }

        const response = await fetch(`${this.mycouchBaseUrl}/my-tenants`, {
            headers: {
                'Authorization': `Bearer ${jwt}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to get tenants (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        console.log('✅ Retrieved tenant list:', data);
        return data;
    }

    /**
     * Set active tenant in Clerk session metadata
     */
    async setActiveTenant(tenantId) {
        console.log(`🔧 Setting active tenant: ${tenantId}`);

        const jwt = await this.getClerkToken();
        if (!jwt) {
            throw new Error('No JWT token available for tenant selection');
        }

        const response = await fetch(`${this.mycouchBaseUrl}/choose-tenant`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${jwt}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ tenantId })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to set active tenant (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        console.log('✅ Active tenant set in Clerk metadata:', data);
        return data;
    }

    /**
     * Refresh JWT to get updated tenant metadata from Clerk
     */
    async refreshJWTWithTenant() {
        console.log('🔄 Refreshing JWT with tenant metadata...');

        try {
            // Force Clerk to issue a completely fresh JWT with updated metadata
            // Add a small delay to ensure metadata update propagates
            await new Promise(resolve => setTimeout(resolve, 500));

            // Get a fresh token - Clerk should include updated metadata
            const refreshedToken = await window.Clerk.session.getToken();

            if (refreshedToken) {
                console.log('✅ JWT refreshed successfully with tenant metadata');

                // Verify the token contains tenant information
                try {
                    const parts = refreshedToken.split('.');
                    if (parts.length === 3) {
                        const payload = JSON.parse(atob(parts[1]));
                        console.log('🔍 Fresh JWT Payload:', payload);

                        // Check for tenant-related claims
                        const hasTenant = payload.tenant_id || payload.active_tenant_id || payload.metadata?.active_tenant_id;
                        console.log('🔍 Checking for tenant claims:', {
                            tenant_id: payload.tenant_id,
                            active_tenant_id: payload.active_tenant_id,
                            metadata: payload.metadata,
                            public_metadata: payload.public_metadata,
                            private_metadata: payload.private_metadata,
                            unsafe_metadata: payload.unsafe_metadata
                        });

                        if (!hasTenant) {
                            console.error('❌ JWT does NOT contain tenant information - this is the root cause!');
                            console.error('❌ Expected tenant_id or active_tenant_id in JWT claims');
                        } else {
                            console.log('✅ JWT contains tenant information');
                        }
                    }
                } catch (e) {
                    console.warn('Could not verify fresh JWT payload:', e);
                }

                return refreshedToken;
            } else {
                throw new Error('Failed to refresh JWT - no token returned');
            }
        } catch (error) {
            console.error('❌ Failed to refresh JWT:', error);
            throw error;
        }
    }

    /**
     * Get Clerk JWT token
     */
    async getClerkToken() {
        try {
            if (!window.Clerk?.isSignedIn) {
                console.warn('User not signed in with Clerk');
                return null;
            }

            const jwt = await window.Clerk.session.getToken();
            return jwt;
        } catch (error) {
            console.error('Error getting Clerk token:', error);
            return null;
        }
    }

    /**
     * Get current tenant
     */
    getCurrentTenant() {
        return this.currentTenant;
    }

    /**
     * Get all available tenants
     */
    getTenantList() {
        return this.tenantList;
    }

    /**
     * Switch to a different tenant
     */
    async switchTenant(tenantId) {
        console.log(`🔄 Switching to tenant: ${tenantId}`);

        const tenant = this.tenantList.find(t => t.tenantId === tenantId);
        if (!tenant) {
            throw new Error(`Tenant ${tenantId} not found in user's tenant list`);
        }

        await this.setActiveTenant(tenantId);
        await this.refreshJWTWithTenant();
        this.currentTenant = tenant;

        console.log(`✅ Switched to tenant: ${tenant.name}`);
        return tenant;
    }
}

// Export for global use
window.TenantManager = TenantManager;