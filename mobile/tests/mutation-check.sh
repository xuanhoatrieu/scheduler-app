#!/usr/bin/env bash
# Kiểm tra ngược: cố tình phá code, test PHẢI fail; sau đó khôi phục và test PHẢI pass.
set -u
cd "$(dirname "$0")/.."
BK=$(mktemp -d)
cp services/api.js services/notificationService.js services/reminderPlanner.js "$BK/"
restore() { cp "$BK/api.js" "$BK/notificationService.js" "$BK/reminderPlanner.js" services/; rm -rf "$BK"; }
trap restore EXIT

run() { timeout 60 env "$@" 2>&1 | grep -E '^# (pass|fail)' | tr '\n' ' '; echo; }

python3 - <<'PY'
p='services/api.js'; s=open(p).read(); s=s.replace("k.startsWith('cached_')","false",1); open(p,'w').write(s)
PY
echo -n "M1 logout không xóa cache theo tiền tố   → "; run node --import ./tests/register.mjs --test tests/logout.test.mjs
cp "$BK/api.js" services/

python3 - <<'PY'
p='services/notificationService.js'; s=open(p).read(); s=s.replace("if (stored !== activeOwner) {","if (false) {",1); open(p,'w').write(s)
PY
echo -n "M2 đổi tài khoản không xóa thông báo     → "; run STUB_API=1 node --import ./tests/register.mjs --test tests/accountIsolation.test.mjs
cp "$BK/notificationService.js" services/

python3 - <<'PY'
p='services/reminderPlanner.js'; s=open(p).read()
s=s.replace("      const period = parsePeriodRange(item.periodText);\n      if (!period) continue;","      const period = parsePeriodRange(item.periodText) || { start: 1, end: 1 };",1)
s=s.replace("      if (!range) continue;","      if (!range) { /* fail-open */ } else",1)
open(p,'w').write(s)
PY
echo -n "M3 fail-open (không đọc được vẫn báo)    → "; run node --import ./tests/register.mjs --test tests/reminderPlanner.test.mjs
cp "$BK/reminderPlanner.js" services/

python3 - <<'PY'
p='services/notificationService.js'; s=open(p).read()
s=s.replace("  await Notifications.cancelAllScheduledNotificationsAsync();\n\n  for (const item of plan || []) {","  for (const item of plan || []) {",1)
open(p,'w').write(s)
PY
echo -n "M4 hẹn giờ cộng dồn (không hủy cái cũ)   → "; run STUB_API=1 node --import ./tests/register.mjs --test tests/accountIsolation.test.mjs
cp "$BK/notificationService.js" services/

echo "--- Sau khi khôi phục ---"
echo -n "planner + logout → "; run node --import ./tests/register.mjs --test tests/reminderPlanner.test.mjs tests/logout.test.mjs
echo -n "account isolation → "; run STUB_API=1 node --import ./tests/register.mjs --test tests/accountIsolation.test.mjs
