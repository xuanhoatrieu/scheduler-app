# Graph Report - lichhoc-app  (2026-05-28)

## Corpus Check
- 134 files · ~83,224 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1014 nodes · 1128 edges · 101 communities (85 shown, 16 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `3ddbfd15`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 79|Community 79]]
- [[_COMMUNITY_Community 80|Community 80]]
- [[_COMMUNITY_Community 81|Community 81]]
- [[_COMMUNITY_Community 82|Community 82]]
- [[_COMMUNITY_Community 83|Community 83]]
- [[_COMMUNITY_Community 84|Community 84]]
- [[_COMMUNITY_Community 85|Community 85]]
- [[_COMMUNITY_Community 86|Community 86]]
- [[_COMMUNITY_Community 88|Community 88]]
- [[_COMMUNITY_Community 89|Community 89]]
- [[_COMMUNITY_Community 90|Community 90]]
- [[_COMMUNITY_Community 91|Community 91]]
- [[_COMMUNITY_Community 92|Community 92]]
- [[_COMMUNITY_Community 93|Community 93]]
- [[_COMMUNITY_Community 94|Community 94]]
- [[_COMMUNITY_Community 95|Community 95]]
- [[_COMMUNITY_Community 96|Community 96]]
- [[_COMMUNITY_Community 97|Community 97]]
- [[_COMMUNITY_Community 98|Community 98]]
- [[_COMMUNITY_Community 99|Community 99]]
- [[_COMMUNITY_Community 100|Community 100]]

## God Nodes (most connected - your core abstractions)
1. `Colors` - 14 edges
2. `useAuth()` - 13 edges
3. `syncStudentData()` - 12 edges
4. `syncAllSemesters()` - 11 edges
5. `US-XXX Story Title` - 10 edges
6. `Spec Intake` - 10 edges
7. `US-001 Install Harness Into A Project` - 10 edges
8. `US-008 Upgrade Expo SDK 54` - 10 edges
9. `US-011 Dockerize & Production Deploy Config` - 10 edges
10. `conventions` - 9 edges

## Surprising Connections (you probably didn't know these)
- `startServices()` --calls--> `connectDB()`  [EXTRACTED]
  backend/server.js → backend/config/db.js
- `run()` --calls--> `syncAllSemesters()`  [EXTRACTED]
  backend/test_history_crawler.js → backend/services/studentCrawler.js
- `run()` --calls--> `syncLecturerData()`  [EXTRACTED]
  backend/test_lecturer_crawler.js → backend/services/lecturerCrawler.js
- `run()` --calls--> `parseGrades()`  [INFERRED]
  backend/test_ajax_grades.js → backend/services/parsers/studentParser.js
- `run()` --calls--> `syncStudentData()`  [EXTRACTED]
  backend/test_student_crawler.js → backend/services/studentCrawler.js

## Communities (101 total, 16 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (30): RootNavigator(), Stack, styles, Tab, AuthContext, AuthProvider(), useAuth(), LoginScreen() (+22 more)

### Community 1 - "Community 1"
Cohesion: 0.09
Nodes (22): dependencies, expo, expo-status-bar, react, react-native, @react-native-async-storage/async-storage, react-native-safe-area-context, react-native-screens (+14 more)

### Community 2 - "Community 2"
Cohesion: 0.11
Nodes (17): code:text (Build a simple team task tracker where people can create tas), code:text (Type: new spec), code:text (docs/product/tasks.md), code:text (docs/product/assignment.md), code:text (Story: US-001 Create a task), code:text (| US-001 Create a task | docs/product/tasks.md | yes | yes |), code:text (Decision: Tasks use a small explicit status set instead of f), code:text (Add a reusable example-spec walkthrough or starter fixture.) (+9 more)

### Community 3 - "Community 3"
Cohesion: 0.14
Nodes (13): Classification, code:text (User prompt), code:text (0-1 flags:), code:text (Lane: normal), Feature Intake, High-Risk, Input Types, Intake Flow (+5 more)

### Community 4 - "Community 4"
Cohesion: 0.10
Nodes (19): decisions, features, github, infrastructure, cron_job, data_source_mode, database, encryption (+11 more)

### Community 5 - "Community 5"
Cohesion: 0.17
Nodes (11): Architecture, Candidate Structure, code:text (domain), code:text (app/), code:text (unknown input), Command/Query Boundary, Default Layering, Dependency Rule (+3 more)

### Community 6 - "Community 6"
Cohesion: 0.17
Nodes (11): code:text (------------------+), code:text (User-provided spec or prompt), code:text (human intent or supplied spec), code:text (validate:quick), Future Validation Ladder, Growth Rule, Harness, Harness v0 Scope (+3 more)

### Community 7 - "Community 7"
Cohesion: 0.18
Nodes (10): dependencies, axios, cheerio, cors, express, main, name, scripts (+2 more)

### Community 8 - "Community 8"
Cohesion: 0.18
Nodes (10): Acceptance Criteria, Design Notes, Evidence, Harness Delta, Lane, Product Contract, Relevant Product Docs, Status (+2 more)

### Community 9 - "Community 9"
Cohesion: 0.18
Nodes (10): Architecture Questions, Candidate Epics, Candidate Product Docs, First Story Candidates, Harness Delta, Open Decisions, Project Summary, Source (+2 more)

### Community 10 - "Community 10"
Cohesion: 0.18
Nodes (10): Acceptance Criteria, Design Notes, Evidence, Harness Delta, Lane, Product Contract, Relevant Product Docs, Status (+2 more)

### Community 11 - "Community 11"
Cohesion: 0.36
Nodes (9): authenticate(), axios, cheerio, getSchedule(), getStudentInfo(), login(), makeAxios(), mergeCookies() (+1 more)

### Community 12 - "Community 12"
Cohesion: 0.22
Nodes (8): Agent, Feature Intake, Glossary, Harness, Harness Delta, Product Contract, Product Delta, Story Packet

### Community 13 - "Community 13"
Cohesion: 0.22
Nodes (8): Alternatives Considered, Application Flow, Data Model, Design, Domain Model, Interface Contract, Observability, UI / Platform Impact

### Community 14 - "Community 14"
Cohesion: 0.25
Nodes (7): 0003 Generic Spec Intake Harness, Alternatives Considered, Consequences, Context, Decision, Follow-Up, Status

### Community 15 - "Community 15"
Cohesion: 0.25
Nodes (7): Acceptance Evidence, code:text (TBD), Commands, Fixtures, Proof Strategy, Test Plan, Validation

### Community 16 - "Community 16"
Cohesion: 0.25
Nodes (7): code:text (docs/stories/epics/E01-domain-name/US-001-short-story-title.), code:text (docs/stories/epics/E02-risky-domain/US-012-risky-story-title), code:text (planned -> in_progress -> implemented), High-Risk Story, Normal Story, Status Flow, Stories

### Community 17 - "Community 17"
Cohesion: 0.25
Nodes (7): Alternatives Considered, Consequences, Context, Decision, Follow-Up, NNNN Decision Title, Status

### Community 18 - "Community 18"
Cohesion: 0.25
Nodes (7): code:text (command), Commands Run, Evidence, Gaps, Results, Scope, Validation Report

### Community 19 - "Community 19"
Cohesion: 0.29
Nodes (6): Exec Plan, Goal, Risk Classification, Scope, Stop Conditions, Work Phases

### Community 20 - "Community 20"
Cohesion: 0.29
Nodes (6): Affected Product Docs, Affected Users, Current Behavior, Non-Goals, Overview, Target Behavior

### Community 21 - "Community 21"
Cohesion: 0.33
Nodes (5): 0001 Harness-First Development, Consequences, Context, Decision, Status

### Community 22 - "Community 22"
Cohesion: 0.33
Nodes (5): 0002 Seed Specification Product Lifecycle, Consequences, Context, Decision, Status

### Community 23 - "Community 23"
Cohesion: 0.47
Nodes (5): axios, cheerio, dump(), makeAxios(), mergeCookies()

### Community 24 - "Community 24"
Cohesion: 0.47
Nodes (5): axios, cheerio, makeAxios(), mergeCookies(), testGV()

### Community 25 - "Community 25"
Cohesion: 0.47
Nodes (5): axios, cheerio, makeAxios(), mergeCookies(), testSV()

### Community 26 - "Community 26"
Cohesion: 0.47
Nodes (5): axios, cheerio, makeAxios(), mergeCookies(), testSV()

### Community 27 - "Community 27"
Cohesion: 0.47
Nodes (5): axios, cheerio, makeAxios(), mergeCookies(), testSV()

### Community 28 - "Community 28"
Cohesion: 0.47
Nodes (5): axios, cheerio, makeAxios(), mergeCookies(), testSV()

### Community 29 - "Community 29"
Cohesion: 0.40
Nodes (4): code:md (## Missing Harness Capability), Harness Backlog, Items, Template

### Community 30 - "Community 30"
Cohesion: 0.40
Nodes (4): Current State, Documentation Map, Folders, Main Files

### Community 31 - "Community 31"
Cohesion: 0.40
Nodes (4): Evidence Rules, Matrix, Status Values, Test Matrix

### Community 32 - "Community 32"
Cohesion: 0.40
Nodes (4): app, cors, express, tuafPortal

### Community 33 - "Community 33"
Cohesion: 0.40
Nodes (4): Next Steps, Project Management, Status: 🚧 Planning, TUAF Schedule

### Community 34 - "Community 34"
Cohesion: 0.50
Nodes (4): axios, checkForm(), cheerio, main()

### Community 47 - "Community 47"
Cohesion: 0.08
Nodes (23): dependencies, axios, cheerio, cors, dotenv, express, helmet, jsonwebtoken (+15 more)

### Community 48 - "Community 48"
Cohesion: 0.08
Nodes (25): dependencies, axios, expo, expo-font, expo-status-bar, @expo/vector-icons, react, react-native (+17 more)

### Community 49 - "Community 49"
Cohesion: 0.12
Nodes (15): 📊 1. Cách Lưu Trữ Thông Tin (Database Schema - MongoDB), 📱 2. Danh Sách Màn Hình Ứng Dụng (Mobile Screens), 🚶 3. Hành Trình Người Dùng & Luồng Hoạt Động (User Journey), 📋 4. Checklist Kiểm Tra & Acceptance Criteria, 🧪 5. Thiết Kế Các Bài Kiểm Thử (Test Cases), 🎨 BẢN THIẾT KẾ CHI TIẾT: TUAF Schedule, code:mermaid (erDiagram), code:block2 (┌───────────────────────────────────────────────────────────) (+7 more)

### Community 50 - "Community 50"
Cohesion: 0.22
Nodes (8): Files to Create/Modify, Functional, Implementation Steps, Non-Functional, Objective, Phase 01: Setup Environment, Requirements, Test Criteria

### Community 51 - "Community 51"
Cohesion: 0.22
Nodes (8): Files to Create/Modify, Functional, Implementation Steps, Non-Functional, Objective, Phase 02: Database & Security, Requirements, Test Criteria

### Community 52 - "Community 52"
Cohesion: 0.22
Nodes (8): Files to Create/Modify, Functional, Implementation Steps, Non-Functional, Objective, Phase 03: Student Portal Crawler, Requirements, Test Criteria

### Community 53 - "Community 53"
Cohesion: 0.22
Nodes (8): Files to Create/Modify, Functional, Implementation Steps, Non-Functional, Objective, Phase 04: Lecturer Portal SSO & Crawler, Requirements, Test Criteria

### Community 54 - "Community 54"
Cohesion: 0.22
Nodes (8): Files to Create/Modify, Functional, Implementation Steps, Non-Functional, Objective, Phase 05: Sourcing Strategy Pattern, Requirements, Test Criteria

### Community 55 - "Community 55"
Cohesion: 0.22
Nodes (8): Files to Create/Modify, Functional, Implementation Steps, Non-Functional, Objective, Phase 06: Cron Job & Backend API, Requirements, Test Criteria

### Community 56 - "Community 56"
Cohesion: 0.22
Nodes (8): Files to Create/Modify, Functional, Implementation Steps, Non-Functional, Objective, Phase 07: Mobile App - Frontend, Requirements, Test Criteria

### Community 57 - "Community 57"
Cohesion: 0.22
Nodes (8): Files to Create/Modify, Functional, Implementation Steps, Non-Functional, Objective, Phase 08: Testing & Validation, Requirements, Test Criteria

### Community 58 - "Community 58"
Cohesion: 0.22
Nodes (8): expo, assetBundlePatterns, name, orientation, plugins, slug, userInterfaceStyle, version

### Community 59 - "Community 59"
Cohesion: 0.20
Nodes (9): recent_changes, updated_at, working_on, current_phase, current_plan_path, feature, notes, status (+1 more)

### Community 60 - "Community 60"
Cohesion: 0.33
Nodes (5): Overview, Phases, Plan: TUAF Schedule Greenfield Development, Quick Commands, Tech Stack

### Community 61 - "Community 61"
Cohesion: 0.33
Nodes (5): Overview, Problem Statement, Risk Classification, Solution, Story Epic: TUAF Schedule Greenfield Development

### Community 62 - "Community 62"
Cohesion: 0.18
Nodes (11): app, authRoutes, { connectDB }, cors, express, helmet, { initCronJob }, lecturerRoutes (+3 more)

### Community 63 - "Community 63"
Cohesion: 0.40
Nodes (4): API Endpoints, Database Schema, Security Architecture, Story Design: TUAF Schedule Greenfield

### Community 64 - "Community 64"
Cohesion: 0.40
Nodes (4): Story Validation Plan: TUAF Schedule Epic, Test Matrix Reference:, Validation Strategy, Verification Objectives

### Community 65 - "Community 65"
Cohesion: 0.50
Nodes (3): Action Plan, Execution Plan: TUAF Schedule Epic, Phân chia Giai đoạn & Mile-stones:

### Community 66 - "Community 66"
Cohesion: 0.18
Nodes (9): styles, getPeriodStatus(), parseStudyTime(), styles, api, getExams(), getFinance(), getGrades() (+1 more)

### Community 68 - "Community 68"
Cohesion: 0.11
Nodes (18): API Documentation - TUAF Schedule Backend, 🔐 Authentication, code:json ({), code:json ({), code:json ({), code:json ({), code:json ({), code:json ({) (+10 more)

### Community 69 - "Community 69"
Cohesion: 0.18
Nodes (12): run(), { syncLecturerData }, cheerio, parseLecturerSchedule(), axios, cheerio, createSessionAxios(), loginLecturer() (+4 more)

### Community 70 - "Community 70"
Cohesion: 0.14
Nodes (13): { Sequelize }, Curriculum, { DataTypes }, { sequelize }, { DataTypes }, Exam, { sequelize }, { DataTypes } (+5 more)

### Community 71 - "Community 71"
Cohesion: 0.20
Nodes (10): { connectDB }, { encrypt }, Exam, Finance, Grade, run(), Schedule, strategyManager (+2 more)

### Community 72 - "Community 72"
Cohesion: 0.17
Nodes (13): decrypted, { encrypt, decrypt }, encrypted, cron, { decrypt }, runDailySync(), strategyManager, User (+5 more)

### Community 73 - "Community 73"
Cohesion: 0.15
Nodes (8): axios, { connectDB }, User, jwt, User, { DataTypes }, { sequelize }, User

### Community 74 - "Community 74"
Cohesion: 0.08
Nodes (23): allGradesWithGrade4, authMiddleware, Curriculum, { decrypt }, decryptedPassword, Exam, express, Finance (+15 more)

### Community 75 - "Community 75"
Cohesion: 0.18
Nodes (7): styles, Tab, TAB_ICONS, styles, styles, getFinanceAll(), Colors

### Community 76 - "Community 76"
Cohesion: 0.13
Nodes (11): { encrypt }, express, jwt, router, strategy, strategyManager, token, User (+3 more)

### Community 77 - "Community 77"
Cohesion: 0.07
Nodes (35): axios, cheerio, createSessionAxios(), fs, mergeCookies(), path, run(), run() (+27 more)

### Community 79 - "Community 79"
Cohesion: 0.13
Nodes (14): Acceptance Criteria, code:block1 (18/18 checks passed. No issues detected!), code:json ("dependencies": {), Design Notes, Evidence, Harness Delta, Lane, npx expo-doctor Output (+6 more)

### Community 81 - "Community 81"
Cohesion: 0.18
Nodes (9): { DataTypes }, Schedule, { sequelize }, authMiddleware, classes, classMap, express, router (+1 more)

### Community 82 - "Community 82"
Cohesion: 0.32
Nodes (7): axios, cheerio, createSessionAxios(), fs, mergeCookies(), path, run()

### Community 83 - "Community 83"
Cohesion: 0.11
Nodes (17): github, infrastructure, cron_job, data_source_mode, database, encryption, expo_sdk, port (+9 more)

### Community 85 - "Community 85"
Cohesion: 0.14
Nodes (13): features, status, features, status, features, status, features, status (+5 more)

### Community 86 - "Community 86"
Cohesion: 0.15
Nodes (12): conventions, api_prefix, backend_port, cron_sync, encryption, graphify_cli, lecturer_input, schedule_phases (+4 more)

### Community 88 - "Community 88"
Cohesion: 0.22
Nodes (6): STATUS_CONFIG, styles, styles, getCurriculum(), getGradesAll(), getGradeColor()

### Community 89 - "Community 89"
Cohesion: 0.18
Nodes (10): Acceptance Criteria, Design Notes, Evidence, Harness Delta, Lane, Product Contract, Relevant Product Docs, Status (+2 more)

### Community 90 - "Community 90"
Cohesion: 0.22
Nodes (5): styles, styles, Tab, TAB_ICONS, getLecturerClasses()

### Community 91 - "Community 91"
Cohesion: 0.22
Nodes (5): DAY_SHORT, styles, DAY_FULL, getPeriodStatus(), parseStudyTime()

### Community 92 - "Community 92"
Cohesion: 0.25
Nodes (4): styles, styles, login(), logout()

### Community 93 - "Community 93"
Cohesion: 0.40
Nodes (3): DAY_COLORS, DAY_NAMES, styles

### Community 94 - "Community 94"
Cohesion: 0.05
Nodes (42): 1. Network — `tuaf-ai-network`, 2. Container name — đặt theo subdomain, 3. Không expose ports ra host, 4. App phải listen `0.0.0.0` không phải `127.0.0.1`, 5. App phải có endpoint `/health` trả 200, 6. Tin Caddy qua X-Forwarded-* headers, 7. CORS allow `*.tuaf.edu.vn`, Bật subdomain qua Caddy (+34 more)

### Community 95 - "Community 95"
Cohesion: 0.20
Nodes (9): Curriculum, Exam, Finance, Grade, Schedule, ScheduleStrategy, { syncLecturerData }, { syncStudentData } (+1 more)

### Community 96 - "Community 96"
Cohesion: 0.20
Nodes (9): [2.0.0] - 2026-05-27, [3.0.0] - 2026-05-28, [3.1.0] - 2026-05-28, Added, Added, Added, Changed, Changelog (+1 more)

### Community 97 - "Community 97"
Cohesion: 0.29
Nodes (3): ApiStrategy, ScheduleStrategy, ScheduleStrategy

### Community 98 - "Community 98"
Cohesion: 0.40
Nodes (4): ajaxCalls, info, puppeteer, url

### Community 99 - "Community 99"
Cohesion: 0.40
Nodes (3): DAY_NAMES, styles, getDayColor()

## Knowledge Gaps
- **603 isolated node(s):** `name`, `version`, `main`, `start`, `axios` (+598 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **16 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `syncStudentData()` connect `Community 77` to `Community 95`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **Why does `syncAllSemesters()` connect `Community 77` to `Community 95`?**
  _High betweenness centrality (0.003) - this node is a cross-community bridge._
- **What connects `name`, `version`, `main` to the rest of the system?**
  _603 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.07439024390243902 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.08695652173913043 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.1111111111111111 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._