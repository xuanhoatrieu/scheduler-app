# Exec Plan: US-012 Mobile Login Session Persistence and Username Retention

## Goal
Implement a production-grade, secure login session persistence and username retention flow for the mobile app (React Native / Expo) and its Node.js backend.

## Scope
In scope:
- Backend: Endpoint `GET /api/auth/me` to validate token.
- Mobile: Secure token storage integration (via `expo-secure-store`).
- Mobile: Axios interceptor to capture runtime 401 errors.
- Mobile: Pre-filling last successful username and role on Login Screen.
- Mobile: "Remember Username" UI Switch toggle on Login Screen.

Out of scope:
- Auto-token-refresh (AccessToken + RefreshToken) - since the current backend only uses a 30-day single JWT, we will stick to verifying the single token.
- Secure storage of the user password.

## Risk Classification
Risk flags:
- Auth (touches login, session persistence, JWT/tokens)
- Cross-platform (touches React Native/Expo storage APIs)

Hard gates:
- Auth (authentication mechanism and token verification)

## Work Phases
1. **Discovery**: Inspect current login screens, App.js navigation, and backend router configurations. (Completed)
2. **Design**: Draft the state flow, interceptor mechanism, and secure storage choices. (Completed in design.md)
3. **Validation planning**: Establish manual and mock test cases to verify the interceptor and local storage pre-filling. (Completed in validation.md)
4. **Implementation**:
   - Backend: Add `/api/auth/me` route in `backend/routes/auth.js`.
   - Mobile: Update package dependencies with `expo-secure-store`.
   - Mobile: Implement SecureStore wrapper or conditional AsyncStorage storage in `mobile/services/api.js`.
   - Mobile: Set up interceptors and callback handles in `api.js`.
   - Mobile: Add UI Toggle and AsyncStorage logic in `mobile/screens/LoginScreen.js`.
   - Mobile: wire interceptor callbacks and startup verification in `mobile/App.js`.
5. **Verification**: Manually execute verification cases.
6. **Harness update**: Trace task outcomes and log backlog items if friction occurs.

## Stop Conditions
Pause for human confirmation if:
- Setting up `expo-secure-store` fails on the local testing emulator due to native package loading.
- We need to weaken token encryption protocols.
