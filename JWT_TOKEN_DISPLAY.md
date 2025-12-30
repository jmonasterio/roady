# JWT Token Display in Settings

## Overview

Added a JWT token display field to the Roady settings dialog. Users can now view and copy their Clerk authentication token directly from the app without needing to open browser dev tools or Clerk SDK code.

## Location

**Settings → Options → Authentication**

## Features

- **JWT Token Display**: Shows your current Clerk JWT token in a read-only textarea
- **Copy Button**: One-click copy to clipboard (📋 Copy button)
- **Auto-Refresh**: Token automatically refreshes when you open the Options tab
- **Copy Confirmation**: Shows "✓ Copied to clipboard" message for 2 seconds after copying
- **Text Selection**: Click on the textarea to select all text manually

## How to Use

### View Your JWT Token

1. Click **Settings** in the navigation
2. Click the **Options** tab
3. Scroll down to **Authentication** section
4. Your JWT token will be displayed in the textarea

### Copy Token for Testing

1. Click the **📋 Copy** button next to the token
2. You'll see "✓ Copied to clipboard" confirmation
3. Paste the token anywhere you need it (integration tests, API calls, etc.)

### Manual Copy

1. Click on the token textarea to select all text
2. Use Ctrl+C (or Cmd+C on Mac) to copy
3. Paste wherever needed

## Technical Details

### Frontend Changes

**index.html:**
- Added JWT Token section under Authentication heading in Options tab
- Textarea displays the token (read-only)
- Copy button triggers clipboard action
- Copy confirmation message shown on success

**js/app.js:**
- Added state variables:
  - `currentJwtToken`: Stores the JWT token string
  - `jwtCopied`: Boolean flag for showing copy confirmation
- Added methods:
  - `loadJwtToken()`: Fetches token from Clerk session and stores it
  - `copyJwtToken()`: Copies token to clipboard and shows confirmation
- Auto-loads token when Options tab is clicked

### Token Lifecycle

1. **Load**: When user navigates to Settings → Options, `loadJwtToken()` is called
2. **Display**: Token from Clerk's session is displayed in the textarea
3. **Copy**: User clicks "Copy" button, token is copied to clipboard
4. **Confirmation**: "✓ Copied" message appears for 2 seconds

### Error Handling

- If token cannot be loaded: Shows "(No token available)"
- If copy fails: Shows browser alert "Failed to copy token to clipboard"
- All errors are logged to browser console for debugging

## Browser Compatibility

- Requires modern browser with:
  - `navigator.clipboard.writeText()` API
  - ES6+ async/await support
- Tested on Chrome, Firefox, Safari, Edge

## Security Notes

- Token is only displayed in the client (browser)
- Token is not sent to any server
- Token is not stored in local storage
- Token is fetched fresh from Clerk each time the Options tab is opened
- Users should never share their token publicly

## Integration with Testing

This feature was added to support manual integration testing of the virtual endpoints:

```bash
# Copy token from Settings → Options → Authentication
export JWT_TOKEN="your_copied_token_here"

# Run integration tests
python -m pytest tests/test_virtual_endpoints_manual.py -v -s
```

See `TEST_VIRTUAL_ENDPOINTS.md` in the mycouch project for complete testing instructions.

## Customization

To change the appearance or behavior:

1. **Token textarea styling**: Modify the `<textarea>` style in index.html (lines 774-779)
2. **Copy button styling**: Modify the button element (lines 780-786)
3. **Auto-refresh timing**: Modify the timeout in `copyJwtToken()` method (currently 2 seconds)
4. **Token source**: Modify `loadJwtToken()` to use different auth provider if needed

## Troubleshooting

### Token not appearing

- Make sure you're authenticated (logged in with Clerk)
- Open browser console (F12) and check for error messages
- Refresh the page and try again

### Copy button not working

- Make sure you're using HTTPS in production (clipboard API requires secure context)
- Try manual copy: click textarea to select, use Ctrl+C

### Token is stale

- Token is refreshed each time you click the Options tab
- If you need a fresh token, switch to another Settings tab and back to Options

## Files Modified

- `/index.html` - Added JWT token UI section
- `/js/app.js` - Added token loading and copy logic

## Related Documentation

- `TEST_VIRTUAL_ENDPOINTS.md` - Integration testing guide
- `API_REFERENCE.md` - API endpoint documentation
- `auth-design.md` - Authentication system design
