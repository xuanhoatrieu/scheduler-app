# Validation: US-012 Mobile Login Session Persistence and Username Retention

## Proof Strategy
Verification will be performed through a combination of local integration testing and manual verification of UI flows using the Expo environment.

## Test Plan

| Layer | Cases |
| --- | --- |
| Integration | Verify the endpoint `GET /api/auth/me` returns 200 with valid JWT, and 401 with invalid/expired JWT. |
| E2E / Manual | 1. Ensure auto-login works on app restart when valid credentials exist.<br>2. Ensure username and role are filled on logout if "Remember Username" was enabled.<br>3. Ensure "Remember Username" switch toggle saves/removes saved username from AsyncStorage.<br>4. Ensure Axios Interceptor captures 401 response and redirects the user immediately to Login Screen. |

## Fixtures
- Active Test Student account: `DTN245748004` / Password (valid portal password).
- Invalid JWT Token for interceptor test: `Bearer invalid_jwt_token_format`
- Expired JWT Token: Token created with expiration set to `1s` in backend login endpoint for testing.

## Commands
We will verify the API by running our integration tests or curl requests.

```bash
# Test GET /me endpoint with a valid/invalid token
curl -H "Authorization: Bearer <token>" http://localhost:5000/api/auth/me
```

## Acceptance Evidence
1. ✅ `GET /api/auth/me` with valid JWT → 200 + user data
2. ✅ `GET /api/auth/me` with expired/invalid JWT → 401
3. ✅ Axios 401 interceptor auto-logs out and redirects to LoginScreen
4. ✅ expo-secure-store stores JWT in hardware-backed storage (iOS Keychain / Android Keystore)
5. ✅ "Remember Username" toggle saves/removes username & role in AsyncStorage
6. ✅ App startup: valid token → auto-login; invalid token → redirect to LoginScreen
7. ✅ Logout clears SecureStore token and all AsyncStorage caches
