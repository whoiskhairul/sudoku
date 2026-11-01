# Sudostrike — Code Audit

**Audit date:** 2026-10-31
**Scope:** `src/App.jsx`, `src/game/store.js`, `src/game/formatters.js`, `src/styles.css`, `roomRelay.js`, `server.js`, `vite.config.js`, `package.json`, `package-lock.json`, docs, `dist/`
**Method:** static review + targeted scripts for the generator, date keys, and seed behaviour.
**Phase 1 implemented:** 2026-10-31 — items #1–#14 are checked off below.
**Batch 2 (Multiplayer trust) implemented:** 2026-11-01 — items #15, #16, #17, #18, #19, #21, #22, #26, #28 are checked off below.
**Batch 3 (Daily + navigation) implemented:** 2026-11-01 — items #31, #32, #33, #34, #36, #40, #41 are checked off below.
**Batch 4 (Performance/refactor) implemented:** 2026-11-01 — items #47, #48, #50, #52, #53, #54, #55 are checked off below.
**Batch 5 (Repo/tooling/docs) implemented:** 2026-11-01 — items #61, #62, #63, #64, #66, #67 are checked off below.
**Status key:** `P0` = breaks gameplay/data · `P1` = real bug · `P2` = architecture/design · `P3` = hygiene/slop

| # | Severity | Issue | Area |
|---|----------|-------|------|
| 1 | P0 | Generated puzzles are usually not unique | Generator |
| 2 | P0 | No generator regression test | Tests |
| 3 | P0 | Hints are half-shipped and cannot end a game | Gameplay |
| 4 | P0 | Undo/erase corrupt finished match state | Gameplay |
| 5 | P0 | Two players can both win; stats double-count | Gameplay |
| 6 | P0 | "Continue" erases winner status | Gameplay |
| 7 | P1 | "Spectate" never sets spectating state | Gameplay |
| 8 | P1 | Number pad flash effect is broken | UI |
| 9 | P1 | Digit pad soft-locks on wrong entries | Gameplay |
| 10 | P1 | Arrow-key navigation jumps to cell 1/81 | Input |
| 11 | P1 | Old persisted state crashes the app | Persistence |
| 12 | P1 | No error boundary | Robustness |
| 13 | P1 | Unguarded `localStorage` writes | Persistence |
| 14 | P1 | Repair effect trusts unvalidated relay data | Sync |
| 15 | P0 | Client-authoritative multiplayer | Architecture |
| 16 | P0 | Relay broadcasts every room to every client | Security |
| 17 | P0 | Clients persist every room they see | Privacy |
| 18 | P0 | Relay has no validation/limits | Security |
| 19 | P0 | No auth/authorization on rooms | Security |
| 20 | P1 | No WS liveness detection | Server |
| 21 | P0 | Stale clients win room-level writes | Sync |
| 22 | P0 | Pause can deadlock forever | Gameplay |
| 23 | P1 | Presence breaks in background tabs | Sync |
| 24 | P1 | Reconnect hammers without backoff | Sync |
| 25 | P1 | Countdown start times differ per client | Fairness |
| 26 | P1 | Joining is stale-first and fails silently | Sync |
| 27 | P2 | Room codes are not collision-checked | Room |
| 28 | P1 | Left players become permanent ghosts | Room |
| 29 | P1 | Ready gating contradicts docs | Lobby |
| 30 | P1 | Stale `viewingId` makes board look editable | UI |
| 31 | P1 | Daily date keys are not canonical | Daily |
| 32 | P1 | Opening a daily marks it "in progress" | Daily |
| 33 | P1 | Erase/undo un-solve a finished daily | Daily |
| 34 | P1 | Daily "pause" does not stop the clock | Daily |
| 35 | P1 | Daily mistakes UI is meaningless | Daily |
| 36 | P1 | Celebration overlays only fire once | UI |
| 37 | P2 | Fake "Pause 1" / "Rematch 1/1" limits | UI |
| 38 | P2 | Dailies are excluded from stats | Stats |
| 39 | P3 | Share links duplicated / not canonical | UI |
| 40 | P1 | Browser Back/Forward is broken | Navigation |
| 41 | P1 | Timer keeps running after a win | UI |
| 42 | P2 | Double end-of-match overlays | UI |
| 43 | P3 | Overlay exit animations never run | UI |
| 44 | P1 | Stale undo history/selection across rounds | Gameplay |
| 45 | P2 | Dark-mode toggle discards chosen theme | Theming |
| 46 | P2 | No offline/connection indicator | UX |
| 47 | P2 | Room and daily logic duplicated | Refactor |
| 48 | P2 | Player factory duplicated 4× | Refactor |
| 49 | P2 | URL/link builders duplicated | Refactor |
| 50 | P2 | Browser side effects inside the store | Architecture |
| 51 | P2 | Global `pendingGets` request map | Architecture |
| 52 | P1 | Full-state heartbeat every 2.5 s | Performance |
| 53 | P1 | Daily board regenerated on every render | Performance |
| 54 | P2 | Whole app re-renders on heartbeat | Performance |
| 55 | P1 | `AudioContext` leak per move | Performance |
| 56 | P2 | Weak PRNG / truncated seed | Generator |
| 57 | P2 | Difficulty is only a blank count | Generator |
| 58 | P2 | Static server hardening | Server |
| 59 | P2 | Crashes are swallowed | Server |
| 60 | P2 | Unbounded relay memory | Server |
| 61 | P2 | Unused LiveKit deps; lockfile out of sync | Repo |
| 62 | P3 | `package.json` metadata/scripts | Repo |
| 63 | P3 | `dist/` is committed | Repo |
| 64 | P2 | No lint/format/tests/CI | Tooling |
| 65 | P3 | Dead code and empty catches | Hygiene |
| 66 | P3 | README describes a different app | Docs |
| 67 | P2 | Missing accessibility basics | A11y |
| 68 | P2 | No reduced-motion support | A11y |
| 69 | P3 | Missing page metadata | Polish |
| 70 | P3 | No protocol documentation | Docs |

---

## Phase 1 — Gameplay correctness (fix before anything else)

- [x] **1. Make the puzzle generator produce unique-solution boards** (`store.js:208-226`) `P0`
  The generator builds a shuffled base lattice and removes N cells; nothing checks uniqueness. Measured with a solver over 20 random seeds:

  | Difficulty | Givens | Non-unique boards |
  |---|---|---|
  | Easy | 47 | 1/20 |
  | Medium | 39 | 11/20 |
  | Hard | 33 | 19/20 |
  | Expert / Master / Extreme | 28 / 24 / 20 | 20/20 |

  Because validation is `value === room.solution[idx]` (`store.js:881`, `932`), any other valid solution is counted as a mistake. On Expert+, a player reasoning correctly can reach 3 mistakes and lose. `README.md:10` claims unique-solution puzzles — it is not true.
  **Fix:** solver-backed digger (remove a cell only while the solution count stays 1) + a fast bitmask solver.

- [x] **2. Add a generator regression test** (new `src/game/__tests__/generator.test.js` or `node --test`) `P0`
  For every difficulty × ~200 seeds assert: exactly 1 solution, givens equal between `puzzle` and `solution`, blank count matches `difficulties`. This would have caught #1.

- [x] **3. Decide and implement hints, or delete them** (`store.js:697-773`, `App.jsx:714`, `1124`, `851-859`, `1171-1179`) `P0`
  They are implemented in the store, destructured in components, and rendered as `disabled` buttons with `onClick={undefined}`. If kept: `useHint` must evaluate `solved`, set `winnerId`/`status`/stats exactly like `pushMove` (`store.js:950-1004`), push an undo snapshot, and update `lastSeen`. Today a hint that fills the last cell can never end the game.

- [x] **4. Make undo/erase restore full state, and guard them** (`store.js:1007-1077`) `P0`
  Undo restores only `board`/`notes`; it leaves `mistakes`, `status`, `winnerId`, `room.status`, `finishedMs`, `personalSolvedAt` untouched. After winning, undo empties a cell while the room still says "ended" and the player keeps `status: "winner"`. Both actions also skip guards that `pushMove` has: `room.pausedAt`, `room.status === "countdown"`, `viewingId !== player.id`, `me.status === "lost"/"spectating"`.
  **Fix:** snapshot and restore `{board, notes, mistakes, status, winnerId, roomStatus, finishedMs, personalSolvedAt}`; disallow undo/erase after a win.

- [x] **5. Resolve winners deterministically instead of racing** (`store.js:950-1004`) `P0`
  Two players solving in the same broadcast window both set `winnerId = self`, both set `status: "winner"`, and both increment `wins` (`962-968`). Resolve by `finishedMs` (ideally server-side, see #15/#21), award stats only for the confirmed winner, and route the second solver to continue/spectate.

- [x] **6. Stop "Continue" from erasing winner status** (`store.js:672-696`, `App.jsx:1325`) `P0`
  `continueMode` overwrites `status: "winner"` with `"continue"`, so the crown disappears from the player list and the end dialog changes meaning. Derive the crown from `room.winnerId === p.id`, or keep a separate `finished` flag.

- [x] **7. Make "Spectate" actually spectate** (`store.js:684-696`, `619-635`, `formatters.js:19`) `P1`
  `spectateAfterLoss` sets `status: "continue"`, so `"spectating"` is dead state, `statusLabel` never shows it, and the player can switch back to their own board and keep playing. Set `status: "spectating"`, block moves for it, and show a "Spectating <name>" banner with "Back to my board".

- [x] **8. Fix the NumberPad flash effect** (`App.jsx:1266-1279`) `P1`
  `counts` is a fresh array every render, so the `[counts]` effect re-runs immediately, its cleanup cancels the 800 ms timer, and `flash` is never cleared. Memoize `counts` (keyed on the board) and drive the flash from a `useRef` of previous counts.

- [x] **9. Stop the digit pad from soft-locking on wrong entries** (`store.js:354`, `857-891`, `914`) `P1`
  `countPlaced` counts wrong digits too, so nine misplaced copies of `n` permanently disable `n`. Count only solution-correct placements, or allow overwrite.

- [x] **10. Clamp arrow-key navigation properly** (`App.jsx:314-346`) `P1`
  At row 0 / col 0 / row 8 / col 8 the math pushes to cell 0 or 80 instead of staying put. Compute row/col independently with clamped deltas; consider ignoring `event.repeat`.

- [x] **11. Crash-proof persisted state** (`App.jsx:656-661`, `store.js:236-242`, `308`, `427-434`, `948-968`, `1035`) `P1`
  `stats.bestTimes[difficulty]` throws for any `sv-stats` written by a pre-`bestTimes` build; `me.notes.map` throws for rooms from older schemas; `[...room.puzzle]` throws in the repair effect. Add `normalizeStats()`, `normalizeRoom()`, `normalizePlayer()` at read time and drop unrepairable rooms.

- [x] **12. Add an error boundary** (`src/main.jsx`) `P1`
  One bad persisted object or a malformed relay payload yields a blank page. Add a top-level boundary with "clear local data / reload".

- [x] **13. Guard every `localStorage` write** (`store.js:253`, `255-258`, `285`, `323`, `337-340`, `545`, `294`) `P1`
  Quota/private-mode failures throw inside `publish`, the heartbeat, and zustand updaters, which silently kills sync. Use a `safeStorage` helper with a one-time warning.

- [x] **14. Validate before publishing a repaired room** (`App.jsx:945-969`) `P1`
  The repair effect spreads whatever arrived from the relay. Validate `code`, `puzzle`, `solution` (81 entries each), and the `players` shape first.

### Phase 1 implementation notes

- Generator + bitmask solver moved to `src/game/sudoku.js`; `store.js` re-exports `difficulties`/`digitIsComplete`. Regression tests live in `src/game/sudoku.test.js` and `src/game/store.test.js` (`npm test`).
- Undo/erase/hints are blocked at terminal states (win, loss, ended-unless-continue, paused, countdown, viewing someone else) instead of restoring stats; mistakes stay permanent by design.
- Winner races are reduced client-side with `resolveWinnerId` (earliest `finishedMs`), and rematches explicitly clear the previous winner. True authority still needs #15/#21.
- `normalizeRoom` / `normalizeStats` / `normalizePlayer` guard persisted + relay data; `storage` wraps every `localStorage` access with a one-time warning.
- Master/Extreme can finish a few blanks short of the target because digging stops when uniqueness would break; uniqueness is always guaranteed.

## Phase 2 — Multiplayer integrity, security, sync

- [x] **15. Pick an authority model** (`store.js:342-353`, `roomRelay.js:53-66`) `P0`
  Every client publishes whole-room snapshots and the relay trusts them. Choose: (a) server-authoritative rooms with a monotonic `rev` and client *commands* (`place`, `erase`, `hint`, `vote`, `ready`, `kick`), or (b) accept that cheating is trivial. Most items below become cheap with (a).

- [x] **16. Broadcast only to room participants** (`roomRelay.js:53-66`) `P0`
  `for (const client of wss.clients)` sends every room to every socket. Track each socket's joined code and send only to subscribers; emit a small `room:closed` on expiry.

- [x] **17. Stop persisting other people's rooms** (`App.jsx:124-136`) `P0`
  Every broadcast calls `writeRoom(msg.room)` regardless of ownership, so users accumulate every room in the relay and `joinRoom` can later resume a stale copy of a room they never joined. Only persist when the message matches the current room.

- [x] **18. Validate and rate-limit the relay** (`roomRelay.js:104-123`) `P0`
  Add: schema checks (6-char code, `players` object, 81-length arrays), `maxPayload` (~128 KB), per-socket rate limit, max rooms, reject unknown types. Today one 50 MB publish is rebroadcast to every client.

- [x] **19. Authenticate/authorize rooms** (`roomRelay.js:93-123`) `P0`
  No auth exists; anyone who has seen any room (which is everyone, per #16) can publish `winnerId`/`solution`. Issue a secret `roomToken` at creation, require it on publish, return read-only snapshots to `get`, and allowlist `Origin` on `upgrade` to block cross-site WebSocket hijacking.

- [ ] **20. Add WS liveness detection** (`roomRelay.js:104-126`) `P1`
  No ping/pong, so dead sockets linger and `send` keeps buffering. Add a 30 s ping/`isAlive` termination and close sockets with excessive `bufferedAmount`.

- [x] **21. Fix merge semantics and stop stamping stale state** (`store.js:342`, `94-128`, `roomRelay.js:27-51`) `P0`
  `publish` sets `updatedAt: now()` unconditionally, so a client that wakes from sleep wins the room-level base (status, winnerId, puzzle, countdown) while player entries merge by `lastSeen`. Adopt a per-room `rev` owned by the authority and reject older revisions; make room-level and player-level merges follow the same rule; union `kickedIds` server-side.

- [x] **22. Fix the pause deadlock** (`store.js:636-671`, `81-84`, `App.jsx:1129-1140`) `P0`
  `pausedByIds` is frozen at pause time and resume requires every one of them. If one voter leaves or closes the tab, nobody can ever resume. Recompute the electorate from currently-online paused voters, auto-resume after inactivity, or grant the owner a force-resume.

- [ ] **23. Make presence reliable** (`App.jsx:246-266`, `store.js:80`, `roomRelay.js:9-17`) `P1`
  The 2.5 s heartbeat stops/throttles in background tabs, so a player in another tab is "offline" after 15 s and blocks ready/pause/rematch. Prefer server-side connection presence, increase grace, react to `visibilitychange`, and tick the player list so the Wifi icons aren't stale.

- [ ] **24. Add reconnect backoff** (`App.jsx:107-151`) `P1`
  350 ms retries forever across 3 URLs, with no cap/jitter, duplicate `open` listeners, and StrictMode double sockets. Use exponential backoff with jitter, pause when `navigator.onLine` is false, resume on `online`, and clear `ws` state deterministically.

- [ ] **25. Use the countdown deadline as the start time** (`App.jsx:238-258`, `store.js:520-527`, `810-815`) `P1`
  Each client flips `countdown → playing` with its own `now()`, up to 2.5 s apart, and LWW decides. Set `startedAt = countdownEndsAt` and let only one authority perform the transition.

- [x] **26. Fix joining** (`store.js:410-491`, `App.jsx:165-205`, `445-454`) `P1`
  Prefer the server when a socket is open (local copies are stale, see #17); queue the request while connecting instead of returning `false`; show "not found / still connecting / full / finished" instead of silently falling back to Home; fix the "not found on this device" message; clear the 4 s timeout on success; support concurrent joins for different codes (the `pendingGets` map is keyed only by code).

- [ ] **27. Generate collision-checked room codes** (`store.js:357`) `P2`
  `Math.random` with no uniqueness check while the server merges by code. Use `crypto.getRandomValues` over an unambiguous alphabet, verify locally and against the server, and handle a "code exists" response.

- [x] **28. Fix room membership lifecycle** (`store.js:492-506`, `507-528`, `827-853`) `P1`
  `leaveRoom` only sets `connected: false`, leaving a permanent ghost; add a `left` state or remove the player and clean up their votes. Transfer `ownerId` when the owner leaves. Add a player cap and define joining mid-match. Reset votes correctly on rematch.

- [ ] **29. Make ready gating match the docs** (`store.js:511-514`, `Project Overview.md:48`) `P1`
  `toggleReady` requires *all* players including offline ones, while rematch voting counts only online ones; the overview says online-only. Pick one rule, apply it to both, and add a host "start anyway" for testing.

- [ ] **30. Reset a stale `viewingId`** (`store.js:619-635`, `App.jsx:1196-1201`, `911-913`) `P1`
  If the viewed player is kicked/leaves, `Board` falls back to your board and looks editable, but `pushMove` still refuses because `viewingId !== player.id`. Reset to self when the target disappears, and show a "watching <name>" indicator.

## Phase 3 — Daily mode

- [x] **31. Canonicalize daily date keys** (`store.js:31-46`, `529-535`, `556-586`) `P1`
  `?daily=2026-02-01` and `?daily=01-02-2026` parse to the same date but produce different puzzles and separate progress (verified). Invalid dates silently roll over (`31-02-2026` → Mar 3). Validate strictly and always re-key through `toDateKey()` before generating or storing.

- [x] **32. Fix the "in progress" status bug** (`store.js:577-584`) `P1`
  Opening a board writes a snapshot and then sets `status: "in_progress"` just because a snapshot exists. Derive status from actual filled cells and stop writing the snapshot as an open side effect.

- [x] **33. Don't let erase/undo un-solve a finished daily** (`store.js:1007-1027`, `1047-1057`) `P1`
  Both set `status: "in_progress"` and remove the calendar checkmark. Lock solved boards (reset via Rematch) or derive the checkmark from `solvedAt`.

- [x] **34. Make daily pause actually pause** (`store.js:589`, `536-547`, `732`, `893`, `1020`) `P1`
  Time keeps accruing while paused. Track `pausedAt`/`totalPausedMs` like rooms and persist across reloads.

- [ ] **35. Decide what daily mistakes mean** (`App.jsx:838`, `889`) `P1`
  The UI shows `0/3 … 3/3`, but mistakes never do anything and display clamped. Either enforce a limit (with continue mode) or show the raw count and drop `/3`.

- [x] **36. Reset celebration state on rematch** (`App.jsx:1497-1503`, `1544-1553`) `P1`
  `shownRef` is keyed by date and never cleared, so a second solve after `dailyRematch` never shows the overlay. Clear the refs on reset or key on `solvedAt`.

- [ ] **37. Remove the fake limits** (`App.jsx:861`, `864`) `P2`
  "Pause 1" and "Rematch 1/1" imply limits that don't exist. Implement one-rematch-per-day or drop the numbers.

- [ ] **38. Count or explicitly exclude dailies in stats** (`store.js:548`, `549-555`, `App.jsx:646-663`) `P2`
  `markDailySolved` is dead code and dailies never touch `played`/`wins`/`bestTimes`, while the dashboard is labelled generically. Either wire daily results in (separate section) or label the stats "Versus stats".

- [ ] **39. Keep the daily share link canonical** (`App.jsx:736`, `893-904`) `P3`
  Build links from one helper using `toDateKey()`, `encodeURIComponent`, and the current origin; stop duplicating the URL string across Home/Room/Daily.

## Phase 4 — Timer, overlays, navigation

- [x] **40. Fix browser history** (`store.js:85-93`, `243-251`, `342-353`, `394`, `408`, `504`, `585`, `605`, `App.jsx:207-234`, `409-415`) `P1`
  `publish()` already replaces the URL, so the later `syncRoomUrl(code, historyMode)` is a no-op: entering a room **replaces** the home entry (Back exits the site), while leaving **pushes** (Back re-enters the room/daily you left). Replace both helpers with one `syncUrl(params, {push})`: push once on enter, replace on activity, push on leave. Verify Home → Room → Home → Daily with Back/Forward.

- [x] **41. Freeze the timer for finished players** (`App.jsx:1151`, `formatters.js:3-7`) `P1`
  `elapsed(room)` keeps counting after a win, so the topbar disagrees with the recorded finish time. Use `finishedMs` for finished players and stop the clock when the room ends.

- [ ] **42. Remove the double end-of-match overlays** (`App.jsx:986-987`, `1354-1418`, `1538-1599`) `P2`
  The winner gets both `WinnerChampionOverlay` and `EndDialog`, and the winner's dialog offers "Continue Mode". Show one overlay (champion + rematch/watch/home) and keep the end dialog for non-winners.

- [ ] **43. Fix overlay exit animations** (`App.jsx:1420-1463`, `1492-1507`, `1538-1554`) `P3`
  These components `return null` when hidden, so the outer `AnimatePresence` never animates out. Keep the wrapper mounted and toggle the child, or drop `AnimatePresence`.

- [ ] **44. Clear selection/undo history on round transitions** (`store.js:392-394`, `405-408`, `825`) `P1`
  Verify `selected`, `history`, `inputMode`, `viewingId` reset on create/join/rematch; `history` is cleared on rematch but not on join/reconnect, which can let a stale undo snapshot overwrite a new round.

- [ ] **45. Theme controls** (`store.js:309-318`, `App.jsx:431-473`) `P2`
  The moon/sun button flips only between Cyberpunk and Nordic, silently discarding Pastel/Sepia, and labels itself light/dark. Separate "theme" from "light/dark variant" (give each theme a dark palette) or cycle within the current theme. Also avoid one unstyled frame with an invalid stored theme.

- [ ] **46. Add an offline/connection indicator** (`App.jsx:61`) `P2`
  `ws` state exists but nothing explains why cross-device play fails. Show "Offline — rooms only work on this device" when the socket is down and annotate the share/QR buttons.

## Phase 5 — Architecture, duplication, performance

- [x] **47. Deduplicate the room/daily move engine** (`store.js:697-1077`) `P2`
  `pushMove`, `useHint`, `erase`, `undo` each branch daily-vs-room — ~300 duplicated lines that have already diverged. Extract a pure `applyMove(boardState, action, puzzle, solution)` used by both, with a thin persistence adapter per mode.

- [x] **48. Single source for player creation and voter math** (`store.js:355-391`, `410-441`, `462-490`, `948-968`; `App.jsx:1131-1139`, `1363`; `store.js:778-780`) `P2`
  Four copies of the player-default object (already inconsistent: `lossPromptDismissed` missing in three) and three copies of online-voter math. Create `createPlayer(puzzle)` and `getOnlineVoterIds(room)`.

- [ ] **49. Create `syncUrl` and link builders once** (`store.js:85-93`, `243-251`; `App.jsx:1019`, `1030`, `736`) `P2`
  Two near-identical URL helpers, and the room link string is duplicated for copy + QR.

- [x] **50. Move browser side effects out of the store** (`store.js:255-258`, `342-353`, `153-167`, `289-308`) `P2`
  The store touches `localStorage`, `window.history`, `CustomEvent`, `AudioContext`, `navigator`, and holds `ws`/`channel`. Move to `src/net/`, `src/persist/`, `src/audio/`; keep the store pure. Replace the `sv-snack` global event bus with a snack slice (also fixes overflow — only one snack can exist today).

- [ ] **51. Replace the global `pendingGets` map** (`store.js:3`, `447-461`, `App.jsx:126-131`) `P2`
  Map of resolvers keyed by code, overwritten on concurrent joins, no correlation id. Use request ids inside the net module.

- [x] **52. Stop broadcasting full snapshots from the heartbeat** (`App.jsx:246-266`) `P1`
  Every 2.5 s each client publishes the whole room (all boards + notes), writes it to localStorage, and the relay rebroadcasts it. Send a small presence/command message and persist only on user actions.

- [x] **53. Cache generated daily boards** (`store.js:529-535`, `App.jsx:491`) `P1`
  `Home` regenerates the puzzle on every render, including every keystroke in the room-code input. Memoize per date key in the store; with a solver-based generator this becomes mandatory.

- [x] **54. Reduce re-render scope** (`App.jsx:51-61`, `262`, `1303-1352`) `P2`
  `useGame(s => s.room)` re-renders the whole app on every heartbeat while `PlayersPanel` doesn't tick, so presence icons go stale. Split selectors, isolate the timer, memoize `Board`/`NumberPad`, and tick only presence-dependent components.

- [x] **55. Fix the `AudioContext` leak** (`store.js:153-167`) `P1`
  One context per sound hits the browser limit (~6) and then silently stops. Use a singleton, `resume()` on first gesture, close on teardown, and persist a mute setting.

- [ ] **56. Tighten the PRNG / seed handling** (`store.js:191-197`, `209`) `P2`
  `seeded(0)` returns 0 forever and `seed % 233280` collapses the seed space (no date collisions in a 10-year sample, but unnecessary). Use a 32-bit xorshift/mulberry32 and keep a full 32-bit seed.

- [ ] **57. Improve difficulty beyond "number of blanks"** (`store.js:7-14`, `220-224`) `P2`
  After #1, rate puzzles by required techniques (naked singles → pairs → pointing → X-wing) so Easy/Medium/Hard carry meaning, and display the given count.

- [ ] **58. Harden the static server** (`server.js:27-42`) `P2`
  Replace the `startsWith(DIST_DIR)` check with `resolve(DIST_DIR, "." + pathname)` + `path.relative`; handle `HEAD`; return 404 for missing assets instead of `index.html` with `text/html`; add `Cache-Control: immutable` for hashed `/assets/*`; add compression; add `.woff/.map/.webmanifest` MIME types; handle `EADDRINUSE`.

- [ ] **59. Stop swallowing crashes** (`server.js:46-47`) `P2`
  `uncaughtException` keeps a half-broken relay alive. Log and exit (under a supervisor), keep `unhandledRejection` logging, and shut down gracefully on `SIGTERM`.

- [ ] **60. Bound server memory** (`roomRelay.js:6`, `68-91`) `P2`
  No max room count and no max players per room; TTL only applies to offline rooms. Add caps and oldest-first eviction, and consider a persistent store so a restart doesn't wipe every match.

## Phase 6 — Repo, docs, tooling, accessibility

- [x] **61. Remove unused dependencies and sync the lockfile** (`package.json`, `package-lock.json`) `P2`
  Delete `@livekit/components-react`, `livekit-client`, `livekit-server-sdk`. Regenerate the lock: it currently has no LiveKit entries and still says `"name": "vibe"`, so `npm ci` fails.

- [x] **62. Fix `package.json` metadata and scripts** (`package.json`) `P3`
  Add `name`, `version`, `private: true`; move `@vitejs/plugin-react` to `devDependencies`; drop `dotenv-cli`/`-e .env` (or add `.env.example`); add `"start": "node server.js"`; remove the redundant `--host` from `dev`.

- [x] **63. Remove committed build output** (`dist/`) `P3`
  Build artifacts are tracked and drift; add `dist/` to `.gitignore` and build in CI/deploy.

- [x] **64. Add lint + format + tests + CI** (new files) `P2`
  ESLint (`react-hooks` would flag the unused `useHint`, the array-dependency effect, and missing effect deps), Prettier, and Vitest/`node --test` for generator uniqueness, date-key normalization, merges, `applyMove`, `elapsed`, and winner resolution. Add a workflow running `npm ci`, lint, test, build.

- [ ] **65. Remove dead code and empty catches** (`store.js:47-53`, `548-555`; `App.jsx:714`, `1124`, `737`, `1126`, `1141-1144`, `1267`) `P3`
  `isPastDateKey`, `markDailySolved`, unused `useHint`, `void tick`, `const [, setTick]`, `onClick={undefined}`, and the 14+ empty `catch (e) {}` blocks (replace with a logged helper).

- [x] **66. Rewrite `README.md` and correct the overview** (`README.md:9-15`, `32-37`, `62-68`; `Project Overview.md:48`, `117-123`) `P3`
  The README describes a different app (single-player, unique puzzles, hints, undo/redo, save/load, 4 difficulties) and says `cd vibe`. The overview claims online-only readiness and working hints. Document reality, dev/prod/relay steps, architecture, and known limitations.

- [x] **67. Add accessibility basics** (`App.jsx:785-804`, `1218-1244`, `1281-1299`, `1601-1625`) `P2`
  `role="grid"`/`gridcell` + per-cell `aria-label` ("row 3 column 5, 7, fixed"), `aria-live="polite"` for snacks, `role="dialog"`/`aria-modal` + focus trap/restore for modals, labels for the theme select and icon buttons, and stop globally `preventDefault()`-ing Space (it blocks activation of focused buttons). Add visible focus styles.

- [ ] **68. Respect `prefers-reduced-motion`** (`App.jsx:1512-1525`, `1559-1572`) `P2`
  Skip or reduce the confetti/champion animations via `useReducedMotion()`.

- [ ] **69. Add page metadata and polish** (`index.html`) `P3`
  Add `description`, `theme-color`, favicon, and `apple-touch-icon`; either load Inter (the Tailwind config names it) or use the system stack.

- [ ] **70. Document the relay protocol and target authority model** (new `docs/` section) `P3`
  Short spec of `room`/`get`/`publish` with versions, plus the migration plan to server-authoritative commands (#15), so snapshot merging doesn't creep back in.

---

## Known-good / verified while auditing

- Daily seed has no collisions across 10 years of dates (3650 days) after the `% 233280` reduction.
- `toDateKey`/`parseDateKey` round-trip for the app's own `DD-MM-YYYY` format.
- `elapsed()` correctly subtracts `totalPausedMs` while paused; the math is right once the pause flow itself is fixed (#22).
- Tailwind/CSS grid borders, theme tokens, and responsive layout are consistent; no broken class names found.
- `dist/` was built from the latest code commit (only the docs commit came after it).

## Suggested execution batches

1. **Gameplay safety:** #1, #2, #4, #5, #8, #9, #11, #12, #13
2. **Multiplayer trust:** #15, #16, #17, #18, #19, #21, #22, #26, #28
3. **Daily + navigation:** #31, #32, #33, #34, #36, #40, #41
4. **Performance/refactor:** #47, #48, #50, #52, #53, #54, #55
5. **Repo/tooling/docs:** #61, #62, #63, #64, #66, #67
