#!/usr/bin/env bash
# Kiểm tra ngược cho push: cố tình phá code, test PHẢI fail; khôi phục rồi test PHẢI pass.
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
M="$ROOT/mobile"; B="$ROOT/backend"
BK=$(mktemp -d)
cp "$M/services/notificationService.js" "$M/services/reminderSync.js" "$M/services/pushRegistration.js" "$BK/"
cp "$B/services/notificationCenter.js" "$B/services/notificationRules.js" "$BK/"
restore() {
  cp "$BK/notificationService.js" "$BK/reminderSync.js" "$BK/pushRegistration.js" "$M/services/"
  cp "$BK/notificationCenter.js" "$BK/notificationRules.js" "$B/services/"
  rm -rf "$BK"
}
trap restore EXIT

run() { timeout 60 env "$@" 2>&1 | grep -E '^# (pass|fail)' | tr '\n' ' '; echo; }
mob() { (cd "$M" && run STUB_API=1 node --import ./tests/register.mjs --test tests/push.test.mjs); }
be() { (cd "$B" && run node --test tests/notificationRules.test.js tests/notificationCenter.test.js); }

mut() { python3 -c "
import sys
p,a,b=sys.argv[1],sys.argv[2],sys.argv[3]
s=open(p).read()
assert a in s, 'pattern not found: '+a
open(p,'w').write(s.replace(a,b,1))" "$@"; }

mut "$M/services/notificationService.js" "if (data.owner && data.owner !== activeOwner) return false;" ""
echo -n "M1 hiện thông báo của tài khoản khác        → "; mob
cp "$BK/notificationService.js" "$M/services/"

mut "$M/services/reminderSync.js" "if (notif && !(await isPushActiveFor(owner)))" "if (notif)"
echo -n "M2 báo điểm trùng (local + server)           → "; mob
cp "$BK/reminderSync.js" "$M/services/"

mut "$M/services/reminderSync.js" "if (pushOwner && pushOwner !== owner) return false;" ""
echo -n "M3 push ẩn của tài khoản khác vẫn đồng bộ    → "; mob
cp "$BK/reminderSync.js" "$M/services/"

mut "$M/services/pushRegistration.js" "if (pending === token) await AsyncStorage.removeItem(PUSH_KEYS.unregisterPending);
    else if (pending) await retryPendingUnregister();" "if (pending) await retryPendingUnregister();"
echo -n "M4 gỡ nhầm đăng ký của tài khoản mới         → "; mob
cp "$BK/pushRegistration.js" "$M/services/"

mut "$B/services/notificationCenter.js" "tokens = tokens.filter((t) => wanted.includes(t));" ""
echo -n "M5 bản tin gửi tới máy đã đổi tài khoản      → "; be
cp "$BK/notificationCenter.js" "$B/services/"

mut "$B/services/notificationRules.js" "  if (minutes < endMin) return vnTime(p.y, p.m, p.d, QUIET_END.h, QUIET_END.min);" ""
echo -n "M6 gửi push điểm lúc 3h sáng                 → "; be
cp "$BK/notificationRules.js" "$B/services/"

mut "$B/services/notificationCenter.js" "    if (!msg) continue; // không có buổi học / buổi thi thật → KHÔNG báo" "    if (!msg) { out.push({ userId: s.userId, targetTokens: [] }); continue; }"
echo -n "M7 bản tin sáng khi KHÔNG có buổi học        → "; be
cp "$BK/notificationCenter.js" "$B/services/"

mut "$B/services/notificationRules.js" "body: allChanged
        ? \`Điểm môn \"\${name}\" vừa được cập nhật. Mở app để xem chi tiết.\`" "body: allChanged
        ? \`Điểm môn \"\${name}\" vừa được cập nhật. \${events[0].fingerprint}\`"
mut "$B/services/notificationRules.js" ": \`Môn \"\${name}\" đã có điểm. Mở app để xem chi tiết.\`" ": \`Môn \"\${name}\" đã có điểm: \${events[0].fingerprint}\`"
echo -n "M8 lộ số điểm trong nội dung push            → "; be
cp "$BK/notificationRules.js" "$B/services/"

echo "--- Sau khi khôi phục ---"
echo -n "mobile push → "; mob
echo -n "backend     → "; be
