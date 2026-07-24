# Design: US-012 Mobile Login Session Persistence and Username Retention

## Domain Model
- **Auth Token**: Expiring JSON Web Token containing the user's ID, username, and role, signed by the backend.
- **Session State**: Indicates if a valid user is logged in (`user_profile` + verified token).
- **Remembered Credentials**: Map containing non-sensitive details like the last successfully logged-in username and role.

## Application Flow

### Startup Flow
1. App starts and reads the secure token (`SecureStore.getItem('jwt_token')`).
2. If token is missing, redirect directly to Login Screen.
3. If token exists, call `/api/auth/me` to verify token validity.
   - Success (200): Load user profile, proceed to Dashboard.
   - Failure (401 / Network Timeout with expired locally cached details): Clear token, clear session profile, redirect to Login Screen.

### Runtime Interception Flow
1. Axios response interceptor intercepts all API calls.
2. If an API call receives a `401 Unauthorized` response:
   - Perform clean logout (`AsyncStorage.removeItem` + `SecureStore.deleteItem`).
   - Trigger the session expired callback.
   - Reset the parent App navigator state to `null`, redirecting the user to the Login screen with an alert warning "Phiên đăng nhập hết hạn!".

## Interface Contract
### Backend API
- `GET /api/auth/me`
  - Headers: `Authorization: Bearer <token>`
  - Response (200 Success):
    ```json
    {
      "success": true,
      "user": {
        "username": "DTN245748004",
        "role": "student",
        "fullName": "Nguyen Van A",
        "className": "CN&ĐMST 56",
        "department": "Khoa CNTT",
        "lastSyncedAt": "2026-06-09T00:00:00Z"
      }
    }
    ```
  - Response (401 Unauthorized):
    ```json
    {
      "success": false,
      "message": "Token không hợp lệ hoặc đã hết hạn!"
    }
    ```

## Data Model (Local Storage Mapping)
| Key | Storage API | Purpose | Sensitive? |
| --- | --- | --- | --- |
| `jwt_token` | `SecureStore` (Keychain/Keystore) | Auth Token | Yes |
| `user_profile` | `AsyncStorage` | Cached user metadata | No |
| `saved_username` | `AsyncStorage` | Pre-fill Login field | No |
| `saved_role` | `AsyncStorage` | Pre-fill Active Role | No |
| `remember_username_checked` | `AsyncStorage` | Remember Switch value | No |

## UI / Platform Impact
- UI: A beautiful switch button "Ghi nhớ tài khoản" on `LoginScreen.js` styled according to HSL guidelines.
- Platform: Requires `expo-secure-store` library for secure keyring operations.

## Alternatives Considered
1. **Plain AsyncStorage for Token**: Easy, no package installations, but vulnerable to data extraction if a device is compromised. Rejected in favor of SecureStore.
2. **Local Token Expiry Decoding**: Parse JWT expiration (`exp` claim) client-side before calling backend. Good optimization, but does not detect if user is disabled/changed in the DB. Best to combine local expiration pre-check with remote verification.
