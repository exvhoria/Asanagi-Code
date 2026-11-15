# Code Review — Full Pass (src/ and tests/)

**Date:** 2026-11-14
**Scope:** every file under `src/` and `tests/` (37 source files, 13 test files).
**Method:** line-by-line read of each file, cross-checks against the task specs in `TASK.md` through `TASK4b.md`, inspection of the installed discord.js sources for API semantics, and full re-verification after fixes.

**Verification after fixes:**
- `node --check` passes for all 50 files under `src/` and `tests/`.
- `node --test tests/` → 183 tests, 183 pass, 0 fail.

## Issues found and fixed

1. **`src/commands/clear.js`** — `Collection#first(n)` returns a plain **array**, not a Collection. The code checked `targets.size === 0` and computed `skipped` from `targets?.size`, so against the real discord.js API `size` was always `undefined`: the empty-result branch never fired (producing a confusing "Deleted 0" reply) and the skipped count became `0 - deleted.size` (never reported). Fixed by using `targets.length` for both the empty check and `skipped = targets.length - deleted.size`.
2. **`src/commands/define.js`** — dictionary definitions were passed straight to `embed.addFields` without regard to Discord's limits (1024 chars per field value, 256 per field name, 4096 for the description), so a long API definition could make `editReply` reject. Added a `truncate()` helper and clamped the title, description, field name, and field value; phonetic selection now also requires a non-empty *string* `text`.
3. **`src/lib/dice.js`, `src/lib/duration.js`, `src/lib/stats.js`** — the exported parsers/validators called `.trim()` on their argument without a type check, so a non-string value (e.g. `null` from a caller) threw `TypeError` instead of returning the documented `null` / validation error. Added `typeof input !== "string"` and `typeof text !== "string"` guards.
4. **Verified (previously fixed, still green):** `src/commands/weather.js` renders null weather fields as `N/A` via `fmt()`, and `src/commands/define.js` rejects a malformed entry without a non-empty string `word`.

The remaining sections record the per-file review, including latent edge cases worth knowing about but deliberately not changed.

---

## src/

### src/config.js
- Loads `dotenv/config` first, then exposes `config` with `token`, `clientId`, `guildId`, and `commandCooldownSeconds`; exits with a clear message when a required variable is missing, which is the right fail-fast behavior for an unattended bot.
- `optionalNumber()` handles the empty-string case before numeric validation, so `COMMAND_COOLDOWN_SECONDS=""` correctly falls back instead of silently parsing to `0`; non-finite and below-min values also fall back with a warning.
- One subtle non-issue worth noting: `Number(raw ?? fallback)` evaluates `Number(fallback)` when `raw` is undefined, but the subsequent `raw === ""` check and `Number.isFinite` gate make the result safe either way.
- `guildId: process.env.GUILD_ID || null` treats an empty string as "global registration", matching `deploy.js`'s branch — the two files agree on the sentinel.
- JSDoc on both helpers is accurate (`@throws {never}` for the exit-based helper is slightly loose, but behavior is documented in prose).

### src/store.js
- Atomic-ish persistence: writes to a `.pid.tmp` file then `renameSync`s, so a crash mid-write cannot leave a truncated `settings.json`. Good pattern.
- `readAll()` swallows parse/read errors and falls back to `{}` — resilient, but note the trade-off: a temporarily corrupted file silently resets all welcome-channel settings rather than failing loudly. Documented behavior, acceptable for this data's importance.
- `set()` does read-modify-write with no locking; two concurrent `store.set` calls from different interactions are serialized by the event loop between `await` points, so in practice no interleaving can occur inside this synchronous function. Safe as used.
- `isPlainObject` guard on the guild entry in `set()` correctly repairs a malformed (null/array) guild value instead of throwing on `all[guildId][key] = value`.
- Minor duplication note: `isPlainObject`, `readAll`, and the tmp-write pattern are duplicated in `statsStore.js`; consolidating into a shared storage helper would reduce drift risk, but is not worth churn now.

### src/loadCommands.js
- `collectCommandFiles()` recursion is correct: directories are descended with `entry.isDirectory()`, plain `.js` files collected, and the JSDoc `@throws` for an unreadable directory is accurate (`readdirSync` throws).
- The `pathToFileURL(file).href` import produces valid file URLs on all platforms (Windows drive letters included), avoiding the classic `import("/abs/path")` pitfall on POSIX here.
- Validation order is sound: import failure → missing `data.name`/`execute` → duplicate name, each with a distinct, greppable warning including the path relative to `commandsDir`.
- First-loaded wins on duplicate names (second is skipped with a warning) — deterministic given `readdirSync` order, and the warning makes the conflict visible.
- Returns a `Map`, which `interactionCreate.js` and `help.js` both consume consistently (`get` / `values`).

### src/index.js
- Top-level `await loadCommands()` before client construction guarantees `client.commands` is populated before any `interactionCreate` can fire — no race with the gateway.
- `makeHandler()` keeps a single stable function reference per event so `client.once`/`client.on` registrations behave predictably; the indirection is harmless even though `event.execute` could be passed directly.
- Event loading mirrors `loadCommands.js`'s resilience: import failures and shape violations are skipped with warnings instead of crashing startup.
- `process.on("unhandledRejection")` and `client.on("error")` prevent the classic EventEmitter/`--unhandled-rejections=throw` process kills; both only log, which is appropriate.
- Login failure handler logs and `process.exit(1)` — correct for a token misconfiguration (supervisor/restart loop semantics are the operator's concern).
- Intents are minimal and correct: `GuildMembers` is present, which is required for `guildMemberAdd` to ever fire; `GuildMessages` is present for the message stats.

### src/deploy.js
- Correctly branches guild vs global registration via `config.guildId`, and `command.data.toJSON()` is the right way to serialize builders for the REST API.
- Failure path logs and exits non-zero, so CI/scripts can detect a failed deploy.
- Operational caveat (not a code bug): if zero commands load, `rest.put(..., { body: [] })` would deregister all existing commands; loadCommands always warns loudly in that case, and an empty body is the legitimate "clean slate" semantic.
- `toPayload()` would throw `TypeError` on a command lacking `toJSON`, but `loadCommands` already guarantees a `SlashCommandBuilder`-shaped `data` for every returned command, so the documented `@throws` is unreachable in practice.

### src/colors.js
- Three RGB-integer constants (brand/success/error) exactly match the values discord.js itself uses for blurple/green/red — no invalid `setColor` inputs possible.
- Used consistently by every embed-producing command (`guildMemberAdd`, `userinfo`, `serverinfo`, `avatar`, `help`, `define`, `weather`, `serverstats`), so embed colors are uniform across the bot.
- Plain data module with no imports; trivially `node --check`-safe and unit-testable if ever needed.
- Error color is currently unused (errors are plain-text replies) — harmless, keeps a slot ready for future embed-based errors.

### src/cooldowns.js
- Cooldown key is `` `${commandName}:${userId}` ``, correctly per-user *and* per-command; the tests cover cross-user and cross-command isolation.
- Non-finite, zero, or negative `seconds` short-circuits to "no cooldown" before touching the map, so a misconfigured `COMMAND_COOLDOWN_SECONDS` can never wedge the bot.
- Remaining time uses `Math.ceil`, so a blocked call never reports `0` while still throttled — matches the dedicated test.
- Opportunistic pruning only when `size > 5000` bounds memory without adding per-call scan overhead in the common case; expired entries are swept on the next spike.
- Behavioral note (intentional): the cooldown starts before the command runs, so a command that errors still consumes its window. This is the standard "pre-execution throttle" design and is simpler to reason about than refunding on failure.

### src/statsStore.js
- Module-level `load()` + `normalize()` at import time means counts are repaired before any accessor can observe malformed data; `normalize()` drops non-integer/non-positive counts and empty guilds.
- In-memory map with periodic `save()` (5-minute interval from `ready.js`) plus atomic tmp+rename writes — the same safe persistence pattern as `store.js`.
- Read accessors (`topChannels`, `totalMessages`, `trackedChannelCount`) use `peekGuildCounts`, which is non-mutating, so read-only commands cannot create guild entries as a side effect. `recordMessage` alone mutates via `guildCounts`.
- `startAutoSave` unrefs the interval so the timer never keeps the process alive, and `autoSaveTick` catches save failures so one bad disk moment doesn't kill the loop.
- Clean separation: the pure counting/sorting lives in `src/lib/stats.js` (unit-tested); this file is only the stateful wrapper — exactly the split the test task required.

### src/lib/dice.js
- `parseNotation` regex `^(\d+)d(\d+)$` with `i` flag and `trim()` correctly rejects shorthand (`d20`), signs, floats, internal whitespace, and non-ASCII lookalikes — all covered by tests including the 20-digit input case. A `typeof input !== "string"` guard now returns `null` for non-string callers instead of throwing on `.trim()`.
- Parsed values are intentionally *not* range-checked here; `isNotationInRange` does that separately (1..25 dice, 2..1000 sides), letting tests and the `/dice` command report "parsed but out of range" distinctly.
- `rollDice` maps `Math.random()` ∈ [0,1) to faces 1..sides via `1 + floor(random * sides)` — uniform and inclusive on both ends, verified by the Math.random-stubbing tests in `libAdditional.test.js`.
- `formatRollReply` omits the total for single-die rolls (cosmetic, matches tests for 1 die and 0 dice); the em-dash/comma formatting is deterministic.
- Bounds constants (`MAX_DICE`, `MAX_SIDES`) are exported and reused by `/roll`'s builder min/max values, so slash-command validation and the pure logic can never drift apart.

### src/lib/duration.js
- `parseDuration` accepts `<digits>[whitespace][s|m|h|d|w]` case-insensitively; bare numbers default to minutes; combined units (`1h30m`), floats, negatives, and exponent forms are all rejected — every rule has a dedicated test. A `typeof input !== "string"` guard returns `null` for non-string callers rather than throwing on `.trim()`.
- `"0"` parses to `0` (falsy) by design; `remind.js` rejects it downstream via `if (!ms)`, and the docstring plus tests document the coupling so nobody "fixes" the falsy check accidentally.
- `MAX_DURATION_MS` (7 days) matches the `/remind` error message and Discord's own practical limits; `1w` parses exactly to it.
- `formatMs` renders coarsest-unit-first (days → hours → minutes, rounded) without combining units; the quirky sub-minute cases (`formatMs(1)` → `"0 day(s)"`, 59,999ms → `"1 minute(s)"`) are pinned by tests, so the rounding behavior is contract, not accident.
- No mutation, no I/O — pure functions only, which is what allowed all four lib test files to run without any Discord import.

### src/lib/randomness.js
- `EIGHT_BALL_RESPONSES` is exactly 20 unique, sentence-cased, period-terminated answers with no newlines — five separate test files pin these invariants, so any accidental edit breaks loudly.
- `pick8BallResponse` indexes uniformly across the pool; the distribution test (5,000 draws must see >10 distinct answers) guards against an off-by-one collapsing the pool.
- `flipCoin` uses `Math.random() < 0.5` and is distribution-tested over 20,000 flips within 0.45–0.55 heads share — reasonable for a non-security coin.
- No seeding, no crypto — appropriate for entertainment commands; nothing here would be safe as a token generator, and nothing suggests it is used that way.
- Module is import-only data + two pure functions, so `/8ball` and `/coinflip` stay thin.

### src/lib/stats.js
- `recordMessage` mutates and returns the new count; keys are Discord snowflakes so the `__proto__`-as-key hazard of bracket assignment is unreachable in practice.
- `topChannels` sorts by count descending with `localeCompare` tie-break on channel ID, applies `Math.max(0, Math.floor(limit))` (so fractional and negative limits behave as tested), and does not mutate the input object — verified by a dedicated test.
- `totalMessages` is a plain reduce over `Object.values`, correct for empty maps and zero counts.
- `validateRepeat`/`buildRepeat` form a result-object validation pair (never throwing), with all four error strings asserted verbatim in tests; `MAX_REPEAT_LENGTH` (200) and `MAX_REPEAT_TIMES` (5) double as the `/repeat` builder limits. A `typeof text !== "string"` guard makes non-string input report "Text cannot be empty." instead of throwing.
- One naming nit: the stats module owning the `/repeat` text limits is a little surprising organizationally; moving those constants to a `lib/text.js` would be tidier, but the coupling is tested and harmless.

### src/events/interactionCreate.js
- Dispatch order is exactly right: `isChatInputCommand` filter → resolve handler → "not registered" friendly reply → cooldown check → `execute` inside try/catch.
- Cooldown length resolution allows an optional per-command `command.cooldown` override with the global `config.commandCooldownSeconds` default — no command currently sets one, but the hook is live and tested indirectly.
- Error handling covers all three reply states: fresh (`reply`), deferred (`followUp`), and already-replied (`followUp`), each with `.catch(ignoreReplyError)` so error-reporting itself can never produce an unhandled rejection.
- The cooldown-keyed reply names the command and remaining seconds, and is ephemeral — good UX and consistent with the spec.
- Minor note: a failed command still consumes its cooldown window (set before `execute`); documented in `cooldowns.js` review as intentional.

### src/events/ready.js
- `once: true` with `Events.ClientReady` is the correct registration shape, and `index.js`'s `makeHandler` forwards the client as the first argument.
- Logs identity, tag, and guild count — enough to confirm a healthy connection at a glance.
- `setActivity("/help", { type: Listening })` advertises the discovery command; failure would only surface as an unhandled rejection inside discord.js, documented in the JSDoc.
- Starts the 5-minute stats auto-save and logs it; the unref'd timer means this file introduces no shutdown hang.

### src/events/guildMemberAdd.js
- Reads the configured channel from `store`, cache-first (`channels.cache.get`) with an async fetch fallback that resolves to `null` on failure — no unhandled rejection path.
- `isTextBased()` gate correctly skips forum/category channels even if someone hand-edits `settings.json`.
- Embed uses `member.user` (mention renders as a ping-able mention), `memberCount` for the "#N" flourish, thumbnail, success color, and timestamp — all bounded and valid.
- Send failure is caught and logged with the guild context; the event handler can never throw into discord.js.

### src/events/messageCreate.js
- `message.inGuild()` filter correctly skips DMs (where `guildId` is null) and `author?.bot` skips bots and webhooks — exactly the two sources you don't want inflating channel stats.
- The handler is a thin adapter: all logic lives in the unit-tested `statsStore.recordMessage`.
- `async execute` with no awaits is fine for uniform event-handler shape; it cannot reject.
- Note: there is no `Message partials` concern here since `MESSAGE_CREATE` always carries a full author; the optional-chain is defensive, not necessary.

### src/commands/ping.js
- Replies immediately, then `fetchReply()` to compute roundtrip as `createdTimestamp - interaction.createdTimestamp` — a valid latency measure that avoids the deprecated `editReply`-timed approach.
- WebSocket heartbeat handles the `-1` sentinel (not yet measured) by printing "measuring..." instead of `-1ms` — the `Number.isFinite(ws) && ws >= 0` guard is exactly right.
- No options, no permissions, usable in DMs — appropriate for a utility command.
- Two round trips (reply + fetch + edit) is fine given Discord interaction token lifetimes (15 min).

### src/commands/help.js
- Commands are sorted alphabetically with `localeCompare` and chunked at `PAGE_SIZE = 25`, matching the embed description limit — the spec's ">25 commands → paginate" requirement is met.
- Single-page case skips buttons entirely, so small guilds get a plain embed with no interactive clutter.
- Button collector restricts paging to the invoker (`button.user.id !== interaction.user.id` → ephemeral rejection), bounds both directions with `Math.min`/`Math.max`, and disables both buttons on `end` — no way to page out of range or leave a forever-active widget.
- All collector-side `.update`/`.reply`/`.editReply` calls are `.catch`-guarded, so a deleted message or expired token cannot throw from an event callback.
- `pages[page]` indexing is always in range by construction (page clamped to `0..pages.length - 1`); the JSDoc `@throws RangeError` on `embedFor` documents the precondition rather than a real path.

### src/commands/userinfo.js
- Target resolution: `getUser("target") ?? interaction.user` and matching `getMember`/`interaction.member` — correct pairing so a non-member target gracefully omits member fields instead of crashing.
- Timestamps are rendered via Discord `<t:...:R>` relative format with `Math.floor(.../1000)` — correct epoch-seconds conversion.
- `member.joinedTimestamp` nullability handled with "Unknown", and `roles.highest?.name ?? "None"` covers the (rare) role-less member.
- No `setDMPermission(false)`: in DMs `member` is absent and the embed degrades to user-only fields — deliberate, works as designed.

### src/commands/serverinfo.js
- Guards `!guild` first with an ephemeral message, so an accidental DM registration can't crash on `guild.channels.cache`.
- Counts are cache-based (`channels.cache.filter(...).size`), which is honest about being "visible to the bot" rather than promising guild-wide totals; field naming ("Text channels") doesn't overclaim.
- `<@${guild.ownerId}>` mention, `<t:...:R>` creation date, and `premiumSubscriptionCount ?? 0` are all null-safe.
- `setThumbnail(guild.iconURL(...))` accepts the `null` a guild without an icon produces — discord.js ignores a null thumbnail, so no crash.
- `ChannelType.GuildText` / `GuildVoice` filters are exact-type checks, correctly excluding announcements/threads from both counts.

### src/commands/avatar.js
- Defaults to the invoker, supports the optional `target`, and builds direct `PNG`/`WebP` links at size 1024 as markdown in the description — useful and within length limits.
- `displayAvatarURL({ size: 1024 })` (no extension) for the embed image lets Discord serve the best format automatically.
- All three URL variants come from the same `displayAvatarURL` source, so they can never disagree.
- Usable in DMs by design; no guild data touched.

### src/commands/8ball.js
- Required `question` option with `setMaxLength(1000)` keeps the reply under Discord's 2000-char limit even with the longest canned answer.
- `allowedMentions: { parse: [] }` means a question like "@everyone vote" can never ping anyone — an easy thing to forget on a raw content reply, done correctly here.
- Randomness is delegated to the unit-tested `pick8BallResponse`; the command itself is pure Discord plumbing.
- Question is echoed verbatim inside bold markers — markdown injection is cosmetically possible (e.g. `**` in the question) but harmless since mentions are suppressed.

### src/commands/roll.js
- Both options carry `setMinValue`/`setMaxValue` derived from `MAX_DICE`/`MAX_SIDES`, so Discord itself rejects out-of-range input before `execute` runs — no double validation needed.
- Defaults (`sides: 6`, `dice: 1`) match the option descriptions exactly.
- Rendering is delegated to the shared `formatRollReply`, keeping `/roll` and `/dice` output visually identical.
- Usable in DMs; no guild state.

### src/commands/poll.js
- Option parsing: split on `,`, trim each, filter empties — so `"a,,b"` yields 2 options, and `" , "` yields none (falls through to 👍/👎 mode) — sensible degenerate handling.
- `options.length === 1` is rejected with guidance, `> 10` rejected with the limit; the 10 emoji table (`NUMBER_EMOJIS`) is the single source of the max.
- Reaction loop is sequential `await`s after `fetchReply()`, so reactions attach in option order; any failure propagates to the interaction-level error handler which follows up ephemerally.
- `allowedMentions: { parse: [] }` on both reply forms prevents option/question text from pinging users — same discipline as `/8ball`.
- Note: there is no de-duplication of options; duplicate options just get separate emoji, which is acceptable and self-explanatory.

### src/commands/clear.js
- Double-layered permission enforcement: builder-level `setDefaultMemberPermissions(ManageMessages)` plus an in-handler `memberPermissions.has(...)` check with an ephemeral denial — defense in depth against stale registrations.
- `deferReply({ ephemeral: true })` before fetching, since 100-message fetch + bulk delete can exceed the 3-second interaction window.
- Fetches 100, filters to the optional user, takes `amount` (builder-capped 1..100 ≤ bulk-delete API cap of 100); `bulkDelete(targets, true)` with `filterOld` handles the 14-day rule, which is the right transparency for moderation ops.
- **Fixed in this review:** the fetched/filtered result of `Collection#first(amount)` is an array, so emptiness is checked with `targets.length === 0` and `skipped` is `targets.length - deleted.size`. The old `.size` reads were always `undefined` against the real API.
- `interaction.channel?.isTextBased()` guard prevents a crash from a weird channel type; empty result reports "nothing found" instead of a misleading "deleted 0".
- Note: the skipped-message wording says "outside the recent 100", but every target comes from the newest 100 — only the 14-day `filterOld` rule can actually skip one. Wording could be tightened (behavior is correct).

### src/commands/kick.js
- `setDMPermission(false)` + builder default permissions + runtime `KickMembers` check — consistent triple-guard like the other moderation commands.
- Validation ladder is complete and correctly ordered: member exists → not self → `member.kickable` (covers role hierarchy and the bot's own permissions) → kick with reason.
- Reason defaults to `"No reason provided"` and is passed to the audit log via `member.kick(reason)` — good audit hygiene.
- Confirmation reply is ephemeral with `allowedMentions: { parse: [] }` so the kicked user's tag in bold doesn't ping.
- `getMember("target")` returning null for a user outside the guild gets a clear dedicated message rather than a `null.kick` crash.

### src/commands/ban.js
- Same triple-guard as `/kick`; self-ban blocked on the *user* (not member) level, correctly allowing bans of users not currently in the guild — the main functional difference from `/kick`'s member requirement.
- `member && !member.bannable` skips the hierarchy check for non-members (nothing to compare against), which is the right semantics for user-level bans.
- `delete_messages` option is days 0..7 converted to `deleteMessageSeconds: deleteDays * 86400` — exactly the API's 604,800-second maximum.
- Reason forwarded to the audit log; confirmation reports message deletion only when nonzero, avoiding a confusing "deleted 0 day(s)" string.
- No ban of the bot itself guard — bannable check covers it in guild; theoretical non-member self-target is the bot banning its own user object, which Discord permits and is harmless.

### src/commands/timeout.js
- `minutes` option capped at 40,320 = Discord's 28-day maximum, so the API can never reject for length; min 1 prevents zero/negative timeouts.
- Validation ladder mirrors `/kick`: member exists → not self → `member.moderatable` → `member.timeout(ms, reason)`.
- Reason defaults and audit-log forwarding match the other moderation commands; reply is ephemeral with mentions suppressed.
- Communication shows the exact minutes requested (not a rounded human string), which is what a moderator wants to confirm.
- `setDMPermission(false)` and both permission layers present — consistent with the family.

### src/commands/welcome-message.js
- Subcommand structure (`set`/`clear`/`show`) with channel-type restriction to `GuildText`/`GuildAnnouncement` at the builder level, so `store` can only ever hold a postable channel ID.
- `ManageGuild` enforced at builder and runtime; `setDMPermission(false)` guarantees `interaction.guildId` is non-null when `store.set` is called.
- `clear` stores `null` (rather than deleting the key), and both `guildMemberAdd.js` (`if (!channelId) return`) and `show` (`channelId ? ... : ...`) treat null/undefined identically — consistent sentinel handling.
- `show` renders `<#${channelId}>` which degrades gracefully to a raw ID if the channel was deleted since configuration.
- Persistence is immediate via `store.set` (tmp+rename write), so a crash right after acknowledgment doesn't lose the setting.

### src/commands/remind.js
- Duration parsing/validation delegated to `lib/duration.js`; `!ms` rejects both parse failures and `"0"` (falsy by documented design), and the 7-day max is enforced against `MAX_DURATION_MS`.
- Confirmation includes both a human string (`formatMs`) and `<t:${dueAt}:R>` absolute timestamp — the latter stays accurate even if the message is read late.
- `setTimeout(...).unref?.()` correctly avoids keeping the process alive for a pending reminder; the documented trade-off (reminders lost on restart) is inherent to the in-memory design and stated in the JSDoc.
- Delivery targets `interaction.channel?.send` with `allowedMentions: { parse: ["users"] }` — precisely the reminder recipient pingable, nothing else.
- Delivery failure is caught, logged with a `[remind]` prefix, and can never reject out of a timer callback (which would be an unhandled rejection).

### src/commands/coinflip.js
- Minimal command: builder + tested `flipCoin()` + templated reply; nothing to get wrong.
- No options, no permissions, DM-safe — matches `/8ball` and `/roll` in style.
- Output uses bold around the result for visual consistency with other fun commands.
- Randomness lives in `lib/randomness.js`, keeping this file Discord-only like the rest of the extraction work.

### src/commands/dice.js
- `notation` option is required with `setMaxLength(20)` — comfortably above `25d1000` (7 chars) while preventing absurd payloads.
- Two-stage validation mirrors the lib: `parseNotation` null → "Invalid notation" message; `isNotationInRange` false → range message quoting the exact live `MAX_DICE`/`MAX_SIDES` values, so the text can never drift from the code.
- Rendering via shared `formatRollReply` keeps `/roll` and `/dice` consistent.
- Invalid-input replies are ephemeral, matching the bot-wide convention for user errors.

### src/commands/define.js
- `deferReply()` before the network call is mandatory here (dictionaryapi.dev can take seconds); both later paths use `editReply` — correct lifecycle discipline.
- Robust HTTP handling: 404 → "not found" copy; other non-OK → thrown and caught → generic service-down copy with the real error logged server-side; `AbortSignal.timeout(10s)` bounds the wait.
- Response shape is defended in depth: `Array.isArray(entries)`, entry guard (now including a string, non-empty `word` after this review), phonetic selection across `entry.phonetic` and `phonetics[].text`, meanings sliced to 3, definitions filtered for non-empty strings and sliced to 2 per meaning.
- Field names fall back to `"Definition"` when `partOfSpeech` is missing/blank, and empty definition blocks are skipped so no field ever has an empty value (Discord rejects those).
- **Fixed in this review:** entry guard requires `typeof entry.word === "string" && entry.word.trim()`, preventing a `📖 undefined` title from a malformed payload; phonetic selection requires non-empty string `text`.
- **Fixed in this review:** a `truncate()` helper clamps the title (256), description (4096), field names (256), and field values (1024) to Discord's embed limits, so an unusually long dictionary definition can no longer make `editReply` reject.

### src/commands/weather.js
- Two-stage fetch (geocoding → forecast) each with its own try/catch, distinct user-facing messages, server-side error logs, and 10-second abort timeouts — failure of either service is fully contained.
- "City not found" is distinguished from "service down" (coordinates must be numbers), avoiding the classic "API hiccup looks like a typo" UX bug.
- `WEATHER_CODES` covers all WMO codes open-meteo emits (0–99); unknown codes simply omit the description instead of crashing or printing `undefined`.
- `where` line composes name/admin1/country with `filter(Boolean)` and an "Unknown location" fallback.
- **Fixed in this review:** added `fmt(value, unit)` so `null` API fields (which open-meteo returns for e.g. ocean coordinates) render as `N/A` instead of `null°C` / `null%` / `null km/h` in all three embed fields.

### src/commands/serverstats.js
- Guild guard first; zero-state ("No messages tracked yet") handled before building any embed, so the empty store never renders an empty leaderboard.
- Top 25 channels rendered as `<#channelId>` mentions with bold counts; deleted channels degrade to an unrendered mention rather than crashing.
- Aggregate fields combine store data (`totalMessages`, `trackedChannelCount`) with guild cache (`GuildText` count) — each correctly sourced.
- Read-only: uses `peekGuildCounts`-backed accessors, so merely viewing stats can't create store entries (verified in the statsStore design).
- Timestamp on the embed dates the snapshot, appropriate for a cumulative counter.

### src/commands/topchannels.js
- Top 10 with medal prefixes for the podium and `**#N**` for the rest — a nice touch that stays deterministic via the shared `topChannels` ordering (count desc, ID asc tie-break).
- Zero-state ephemeral message mirrors `/serverstats` wording — consistent UX across the two stats commands.
- Plain content reply (no embed) keeps the small leaderboard lightweight; channel mentions are `allowedMentions`-safe since channel mentions don't ping via message content.
- Guild guard identical to `/serverstats`; no DM path can reach the store.

### src/commands/repeat.js
- Builder limits (`setMaxLength(MAX_REPEAT_LENGTH)`, `setMinValue(1)`/`setMaxValue(MAX_REPEAT_TIMES)` on `times`) are derived from the same constants the validator enforces — zero drift between Discord validation and `validateRepeat`.
- Worst-case output is 5×200 + 4 newlines = 1004 chars, safely under Discord's 2000-char message limit — the reason the length constant is 200.
- `allowedMentions: { parse: [] }` means repeated text can never ping users/roles/everyone despite raw echo — essential for a text-echo command and correctly applied.
- Validation errors surface ephemerally with the `⚠️` prefix, consistent with `/dice` and `/remind` error styling.

---

## tests/

### tests/index.js
- Exists solely so runners that treat the `tests/` directory argument as a child entry module still execute the whole suite via a single aggregated import file; on scanning runners (including Node 24) it is correctly *not* picked up because it doesn't match the `*.test.js` glob — no double-run.
- All 12 imports resolve to real files (verified during review; `libAdditional.test.js` exists despite being easy to overlook).
- Import order is alphabetical and stable, so any failure report names files deterministically.
- The explanatory comment documents exactly why the file exists and why it won't double-execute — good future-proofing against someone "cleaning it up" and breaking Node-18-style invocation.

### tests/commandsShape.test.js
- Dynamically enumerates every file under `src/commands/` (recursively, sorted for determinism) and validates each as a real slash command: default-export object, `data instanceof SlashCommandBuilder`, non-empty string name/description, executable `execute`.
- Checks the Discord API contract itself via `toJSON()`: name regex `^[-_a-z0-9]{1,32}$`, description ≤ 100 chars — the same rules the real registration endpoint enforces, so `npm run deploy` failures are caught locally first.
- Enforces filename ↔ `data.name` equality, preventing the classic "renamed file, forgot the builder" drift.
- Imports `discord.js` directly, which exercises the real dependency (and its lockfile) in tests rather than stubbing builders.

### tests/cooldowns.test.js
- `withFakeClock` monkey-patches `Date.now` with an advanceable clock and restores it in `finally` — deterministic timing tests with zero sleeping and no leakage between tests.
- Covers the spec matrix completely: first call allowed, second blocked with 1–2s remaining, per-user isolation, per-command isolation, expiry re-allowance, zero/negative and NaN/±Infinity as "disabled", `resetCooldown`, and the `Math.ceil` guarantee that a blocked call never reports 0 remaining.
- The 4999ms + 2ms expiry test pins the boundary precisely (blocked just before, allowed just after) — exactly where off-by-one bugs live.
- Uses distinct user/command strings per test to avoid cross-test interference through the module-level `buckets` Map.

### tests/dice.test.js
- Core parsing suite: standard NdN, whitespace tolerance, case-insensitivity (including rejecting the doubled separator `2dD6`), and a 12-case rejection list covering empty, shorthand, signs, floats, wrong separators, and embedded words.
- Range checks test both edges of the accepted box (1×2 and 25×1000) and each individual boundary violation (0 dice, 26 dice, 1 side, 1001 sides).
- Randomness tests are statistical but bounded: 100 trials of 7d6 for shape + total consistency, and 5,000 d2 flips asserting both faces appear — enough to catch a systematic bias without flakiness.
- Formatting tests pin the exact reply strings for multi-die (with total) and single-die (without), keeping the command output contract explicit.

### tests/diceMore.test.js
- Edge-focus companion to `dice.test.js`: `0d6` and `1000d6` parse successfully but fail the range check (the "parse vs validate" split is explicitly exercised), shorthand `d20`/`D20` rejected, position independence (`6d2`), and leading zeros normalized (`0002d06` → 2/6).
- Numeric robustness: a 20-digit count parses to `1e20` without crashing and is then range-rejected — guards against regex/parsing surprises with huge inputs.
- Unicode hardening: a small-caps ᴅ and a katakana long-vowel mark are rejected as lookalike separators; unicode minus `−1d6` rejected.
- Roll-shape tests at scale (1,000 dice) verify length, per-face bounds, and total consistency; `formatRollReply` pinned at `MAX_SIDES`.

### tests/duration.test.js
- Primary spec suite for `/remind` parsing: all five units at representative values, bare-number-as-minutes default, case-insensitivity, and internal-whitespace tolerance (`"1 W"`).
- Ten-case rejection list (empty, letters-only, wrong units, multi-char units, reversed order, negative, float, two numbers) matches the lib's documented grammar exactly.
- The `0` contract is pinned explicitly: `"0"` and `"0s"` parse to `0` *and* the test asserts falsiness, encoding the downstream `if (!ms)` coupling so it can't be silently broken.
- `MAX_DURATION_MS` asserted both as the literal formula and as `parseDuration("7d")`, and `formatMs` pinned across day/hour/minute outputs including the 61-minute non-promotion case.

### tests/durationMore.test.js
- Adversarial companion: combined units (`1h30m`, `1d12h`, `1h30`) rejected; every zero variant (`0h`, `0d`, `0w`, `00`) parses to falsy `0`; negatives including unicode minus rejected.
- Floats in every position (`0.5m`, `1.5h`, `2.d`, `.5s`) and exponent forms (`1e2`, `1E2m`) rejected — protects against `Number()`-style parsing sneaking in via regex changes.
- Cross-checks unit equivalence (`1h` === `60m`) and the week/max relationship (`1w` === `MAX_DURATION_MS` === `7d`), plus `10080m` = exactly 7 days while `10_080m` (underscore) is rejected.
- `formatMs` boundary behavior fully pinned: zero → "0 day(s)", 59,999ms rounds up to one minute, 73h and 45min stay unpromoted — the coarsest-unit-first policy has no untested corner.

### tests/libAdditional.test.js
- Uses `Math.random` stubbing (with `finally` restore) to make dice rolls fully deterministic at both extremes: `random()=0` → all 1s, `random()≈1` → all max faces — proving the `1 + floor(r*sides)` mapping is correct and inclusive, which statistical tests alone cannot.
- Confirms `rollDice` returns a fresh array per call (no shared/cached rolls buffer).
- Parsing corner cases: line breaks inside notation (`"2\nd6"`, `"2d\n6"`) rejected; space before `d`/`w` units accepted; bare unit (`" s"`, `"d"`, `"w"`) rejected.
- Range checker rejects fractional boundary violations (`MAX_DICE + 0.5`), and `topChannels` floors a fractional limit (`2.9` → 2 entries) — non-integer input behavior is contractual, not accidental.
- Stats invariants re-verified from a fresh angle: first-record = 1, increment of a pre-seeded 41 → 42, and `buildRepeat` newline count = times − 1 at the maximum.

### tests/libEdge.test.js
- Cross-module edge battery (dice + duration + randomness + stats in one file) with 30 focused tests — designed to be the "anything weird" sweep.
- Dice: parse/validate split again, `formatRollReply` with and without totals, zero-dice empty result.
- Duration: case-insensitivity, combined-unit rejection, blank rejection, and `formatMs` promotion rules (exact days vs 1439-minute non-promotion).
- 8-ball: pool size 20 + uniqueness, every answer a period-terminated sentence — content invariants, not just type checks.
- Repeat/stats: whitespace-only text rejected, counts below 1 rejected, exact-limit acceptance, `buildRepeat` single-repetition identity and forwarded error, `totalMessages({})` === 0.

### tests/libExtra.test.js
- Complementary angles on the same modules: numeric field types from `parseNotation` (numbers, not strings), negative dice/sides rejected by the range check, max-boundary acceptance.
- `rollDice(1, 1)` deterministically returns `[1]` (documents the sides≥1 floor behavior even though the range check normally requires sides ≥ 2), and max-bounds rolls (25×1000) stay consistent.
- `formatRollReply` for zero dice (`"🎲 Rolled **0d6**: "`) and exact bold-notation embedding are pinned.
- Duration: `7200s` === 2h, underscores rejected, `10080m` === max, `1w` === `7d`; `formatMs` at 73h/45min matches the policy tests.
- Stats: three-channel independence, `topChannels` non-mutation (snapshot compare), `totalMessages` === sum of `topChannels` counts, and all four `validateRepeat` error messages asserted verbatim; `validateRepeat("hi", "3")` rejects string types.

### tests/libMore.test.js
- 31-test sweep with an emphasis on statistical and aggregate properties: 200 trials of 5d8 keep totals in [5,40] and equal the roll sum.
- One-sided dice (`rollDice(3, 1)` → `[1,1,1]`) and formatting of a total that is deliberately ignored for single dice (`(1, 6, [4], 100)` → no total shown) pin subtle behaviors.
- Duration whitespace matrix (tabs/newlines around and *inside* `"5\tm"`, `"2\nh"`) plus full unit-table conversion and the `2w > max` inequality.
- Randomness: 500 8-ball draws always in-pool, 1,000 coin flips always Heads/Tails — type-level contracts over large samples.
- Stats: 12-channel map with default limit 10 (both ends of the slice pinned: rank 1 = chan-12, rank 10 = chan-3), ID tie-break ordering, zero-count sums, whitespace-preserving `buildRepeat`, and non-finite/NaN/Infinity repeat counts all rejected.

### tests/randomness.test.js
- Dedicated distribution file for the randomness module (plus one `rollDice` shape test): 2,000 flips type-checked, 5,000 flips must produce *both* outcomes, and a 20,000-flip balance window (0.45–0.55 heads) — the only test that would catch a systematically biased `flipCoin`.
- 8-ball: 2,000 draws always in-pool, pool size 20 + uniqueness re-asserted here, and a 5,000-draw spread requirement (>10 distinct answers) to catch a collapsed index calculation.
- Boundaries are chosen so flaky-failure probability is negligible (a fair coin missing both outcomes in 5,000 flips is ~2⁻⁴⁹⁵⁵); the balance window is ±5%, far wider than the ~±0.7% sampling noise.
- All assertions use clear failure messages including the actual observed values, making any future failure diagnosable from the log alone.

### tests/stats.test.js
- Primary suite for `lib/stats.js`: `recordMessage` return values (1 → 2 → 1 across channels) and the resulting map shape asserted with `deepEqual`.
- `topChannels` ordering verified with mixed counts and duplicate-count tie-breaks (`b-chan`/`c-chan` both 3, ID order enforced), plus limit behavior (2, 0, negative → floor to zero) and empty-map handling.
- `totalMessages` across populated and empty maps; `validateRepeat` acceptance at exactly-limit values and rejection with `assert.match` on the error strings (`/max 200/`, `/at most 5/`) — semi-strict matching that survives cosmetic message edits while still catching semantic regressions.
- `buildRepeat` output shape (`hi\nhi\nhi`) and error forwarding (`buildRepeat("", 2)` === `validateRepeat("", 2)`, exact object equality) close the loop on the validation/result contract.
