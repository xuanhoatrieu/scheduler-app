# Overview: US-012 Mobile Login Session Persistence and Username Retention

## Current Behavior
- Mobile app logs in the user by checking `user_profile` in `AsyncStorage` on startup. If found, it routes to the dashboard.
- There is no verification of the JWT token validity on startup. If the JWT token expires on the backend (30-day lifetime), the app continues to display cached data, but any online actions or sync attempts will fail without logging the user out automatically.
- Logging out clears the `jwt_token` and `user_profile` from `AsyncStorage`.
- When logging out or on a fresh login screen, the username is always empty (or has hardcoded defaults like 'DTN' for students) and the user has to retype it every time.

## Target Behavior
- **Secure Token Storage**: Sensitive tokens (`jwt_token`) are stored securely using `expo-secure-store` (utilizing iOS Keychain and Android Keystore) for high-grade production security.
- **Session Verification**: At app startup, the app reads the `jwt_token` and verifies it with the backend via the `/api/auth/me` endpoint.
  - If valid: Automatically logs in and loads dashboard.
  - If invalid/expired/network offline (with expired token): Deletes token and routes to Login Screen.
- **Axios Response Interceptor**: If any API request fails with a `401 Unauthorized` status code, the app automatically deletes the token and redirects the user to the Login screen.
- **Username Memory**:
  - The Login screen includes a "Ghi nhớ tài khoản" (Remember Username) toggle.
  - If enabled: The username and role are saved to `AsyncStorage` when login succeeds. When launching the app or logging out, these fields are pre-filled in the Login form.
  - If disabled: The username is cleared from memory when logging out or if login fails.

## Affected Users
- Students and Lecturers logging into the mobile application.

## Affected Product Docs
- `docs/DESIGN.md`

## Non-Goals
- Biometric authentication (FaceID/Fingerprint) - this can be implemented as a subsequent story.
- Password saving - we only remember the username/MSSV, not the password, for security reasons.
