# Test Matrix

This file maps product behavior to proof. Do not mark a row implemented until tests or validation evidence exist.

## Status Values

| Status | Meaning |
| --- | --- |
| planned | Accepted as intended behavior, not implemented |
| in_progress | Actively being built |
| implemented | Implemented and proof exists |
| changed | Contract changed after earlier implementation |
| retired | No longer part of the product contract |

## Matrix

| Story | Contract | Unit | Integration | E2E | Platform | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **US-001** | Student Portal Crawler | yes | yes | no | no | implemented | `backend/test_student_crawler.js` |
| **US-002** | Lecturer Portal SSO & Crawler | yes | yes | no | no | implemented | `backend/test_lecturer_crawler.js` |
| **US-003** | AES-256 password security encryption | yes | no | no | no | implemented | `backend/test_security.js` |
| **US-004** | PostgreSQL connection via Sequelize | no | yes | no | no | implemented | `backend/test_pg_connection.js` |
| **US-005** | Strategy Pattern for crawler vs API | yes | yes | no | no | implemented | `backend/test_strategy.js` |
| **US-006** | Express REST APIs (Auth, Schedules, Finances) | no | yes | no | no | implemented | `backend/test_api_integration.js` |
| **US-007** | Expo Mobile screens with offline cache | no | no | no | yes | implemented | `mobile/App.js` |
| **US-008** | Upgrade Expo SDK 54 | no | no | no | yes | implemented | `mobile/package.json` |
| **US-009** | Multi-Semester Historical Crawling (Grades + Finance) | yes | yes | no | no | implemented | `backend/services/studentCrawler.js`, `backend/strategies/CrawlerStrategy.js`, `backend/routes/schedule.js` |
| **US-010** | Premium UI/UX Redesign with Bottom Tab Navigation | no | no | no | yes | implemented | `mobile/navigation/AppNavigator.js`, `mobile/screens/GradesScreen.js`, `mobile/screens/FinanceScreen.js`, `mobile/screens/ProfileScreen.js` |
| **US-011** | Dockerize & Production Deploy Config | no | yes | no | yes | implemented | `backend/Dockerfile`, `docker-compose.yml`, `.github/workflows/docker-publish.yml` |

## Evidence Rules

- Unit proof covers pure domain and application rules.
- Integration proof covers backend enforcement, data integrity, provider behavior, jobs, or service contracts.
- E2E proof covers user-visible browser flows.
- Platform proof covers only shell, deployment, mobile, desktop, or runtime behavior that cannot be proven in lower layers.
- A story can be implemented without every proof column if the story packet explains why.
