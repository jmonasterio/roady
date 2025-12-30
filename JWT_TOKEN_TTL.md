# JWT Token TTL (Time-To-Live) Configuration

## Problem

By default, Clerk issues JWT tokens with a very short TTL (time-to-live):
- Default: 60 seconds
- This makes testing difficult because tokens expire quickly

You may see errors like:
```
"detail": "Invalid token (clerk_token_expired)"
```

## Solution

We've updated Roady to request tokens with the "default" template, which has a longer TTL suitable for API testing:

**Changes made:**
- `js/clerk.js`: Updated `getToken()` to specify template
- `js/app.js`: Updated `loadJwtToken()` to specify template

Now when you copy the JWT token from Settings → Options → Authentication, it should have a longer expiration time.

## How JWT TTL Works in Clerk

The TTL is determined by:

1. **Clerk Configuration** (Dashboard):
   - Default template: usually 1 hour (3600 seconds)
   - Custom templates: can be configured

2. **Requested Template**:
   - `getToken()` without options: shortest TTL (~60 seconds)
   - `getToken({ template: "default" })`: standard TTL (~1 hour)
   - Custom templates: configured in Clerk Dashboard

3. **Session Validity**:
   - Even with longer template, token can't exceed session TTL
   - If session expires, all tokens become invalid

## Testing Recommendations

### For Quick Testing
Copy token immediately before running tests to minimize expiration window.

### For Longer Testing Sessions
We recommend either:
1. Create a longer-lived session in Clerk Dashboard
2. Refresh the token between test runs
3. Use a test user with extended session timeout

## Clerk Dashboard Configuration

To check or modify JWT TTL settings:

1. Go to Clerk Dashboard
2. Configure → JWT Templates
3. Look at the "default" template expiration settings
4. Custom templates can be created with different TTLs

## Code References

**Roady (frontend):**
- `js/clerk.js` line 32: `getToken({ template: "default" })`
- `js/app.js` line 399: `getToken({ template: "default" })`

**MyCouch (proxy):**
- `src/couchdb_jwt_proxy/clerk_service.py`: JWT validation and verification

## Token Refresh Strategy

The code uses `skipCache: false` which means:
- Reuses cached token if still valid
- Only requests new token when cache expires
- Reduces load on Clerk API

This is the recommended approach for most applications.

## Troubleshooting

### Still getting "token_expired" errors?

1. **Check system clock** - Time sync issues can cause false expirations
2. **Get fresh token** - Run Settings → Options → Copy immediately before testing
3. **Check Clerk status** - Visit status.clerk.dev to see if there are issues
4. **Verify CLERK_ISSUER_URL** - Make sure proxy has correct issuer configured

### Token expires between copying and using

This is normal with 60-second TTLs. Use the updated code which requests longer-lived tokens.

If you're still seeing 60-second tokens after the update:
1. Clear browser cache (Ctrl+Shift+Delete)
2. Refresh Roady page
3. Restart the mycouch proxy
4. Copy token again

## More Information

- [Clerk JWT Documentation](https://clerk.com/docs/backend-requests/handling/jwt-templates)
- [Clerk Session Management](https://clerk.com/docs/references/javascript/session)
- [JWT Expiration Claims (RFC 7519)](https://tools.ietf.org/html/rfc7519#section-4.1.4)
