// Clerk-specific authentication utilities
window.ClerkAuth = {
    // Wait for Clerk to be ready and user to be signed in
    async waitForClerk(maxWait = 5000) {
        const startTime = Date.now();
        while (!window.Clerk?.isSignedIn && Date.now() - startTime < maxWait) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        return !!window.Clerk?.isSignedIn;
    },

    // Check if user is signed in
    isSignedIn() {
        return window.Clerk?.isSignedIn === true;
    },

    // Get Clerk token with retry
    async getToken() {
        try {
            // Check if user is signed in
            if (!this.isSignedIn()) {
                console.warn('User not signed in with Clerk - cannot get token');
                return null;
            }

            // Wait for Clerk to be ready if needed
            if (!window.Clerk?.session) {
                await this.waitForClerk();
            }

            // Get the token - try to get a fresh one with tenant metadata
            let jwt = await window.Clerk?.session?.getToken();
            if (!jwt) {
                console.warn('Clerk session exists but getToken() returned null/undefined');
                return null;
            }



            return jwt;
        } catch (err) {
            console.warn('Could not get Clerk token:', err.message || err);
            return null;
        }
    },

    // Get user information
    getUser() {
        return window.Clerk?.user || null;
    },

    // Get user ID
    getUserId() {
        return window.Clerk?.user?.id || null;
    },

    // Check if Clerk is loaded
    isLoaded() {
        return !!window.Clerk;
    },

    // Get clerk status for debugging
    getStatus() {
        return {
            isLoaded: !!window.Clerk,
            isSignedIn: this.isSignedIn(),
            hasSession: !!window.Clerk?.session,
            hasUser: !!window.Clerk?.user
        };
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = window.ClerkAuth;
}