# Architecture

This document is a file-by-file architectural reference for the `bot-stress`
Discord bot. It covers every module under `src/` and every test file under
`tests/`. Each section records the file's purpose, its exports, the modules it
collaborates with, and the design decisions and edge cases that shaped the
implementation.

## How to read this document

- The bot is a discord.js v14 slash-command application written in plain
  JavaScript with Node ESM (`"type": "module"`), no build step, and Node 18+.
- Files are grouped by architectural layer: root modules, `src/lib` helpers,
  event modules, command modules, and tests.
- "Interactions" lists the modules that import the file or are imported by it,
  including indirect relationships through the command registry.
- The tests are documented per file because they encode the contracts that the
  runtime code is expected to keep; they are part of the architecture, not an
  afterthought.
- All file paths are relative to the repository root.

## Runtime and dependency overview

```
                       +----------------------+
                       |     src/index.js     |  process entry, event wiring
                       +----------+-----------+
                                  |
          +-----------------------+-----------------------+
          |                       |                       |
 +--------v--------+    +---------v---------+    +--------v---------+
 | src/config.js   |    | src/loadCommands  |    |   src/events/*   |
 | env + settings  |    | command Map       |    | ready, message,  |
 +--------+--------+    +---------+---------+    | interaction,     |
          |                       |              | guildMemberAdd   |
          |                       v              +--------+---------+
          |              src/commands/*                   |
          |              21 slash commands                |
          |                       |                       |
          |      +----------------+-------------+---------+
          |      |                |             |         |
          v      v                v             v         v
     src/store.js  src/statsStore.js  src/cooldowns.js  src/colors.js
          |              |
          v              v
  data/settings.json  data/stats.json

  lib/ helpers used by commands and stores:
  src/lib/dice.js  src/lib/duration.js  src/lib/randomness.js  src/lib/stats.js
```

- `src/index.js` is the composition root. It loads configuration, builds the
  discord.js client, loads commands into `client.commands`, dynamically imports
  every event module, and logs in.
- `src/deploy.js` is a separate composition root used only by `npm run deploy`.
  It reuses `src/loadCommands.js` so the registered command set always matches
  the running command set.
- Commands are thin adapters: they parse slash-command options, validate user
  input, call a pure helper or a store, and reply through discord.js.
- State lives in two JSON files under `data/`: `settings.json` (per-guild
  settings, read on every access) and `stats.json` (message counts, held in
  memory and saved periodically).
- Infrastructure concerns (colors, cooldowns) are tiny standalone modules so
  commands and events do not reach across the tree for shared constants.
- There are no database, HTTP server, or external queue dependencies. The only
  outbound network calls are `fetch` calls to dictionaryapi.dev and open-meteo
  inside `/define` and `/weather`.
- `discord.js` is pinned at 14.16.3 and `dotenv` at 16.4.5 in `package.json`.

## Cross-layer contracts

- Every command module must default-export `{ data, execute }`, where `data` is
  a `SlashCommandBuilder` whose `.name` equals the file's basename. This is
  enforced by `tests/commandsShape.test.js`.
- Every event module must default-export `{ name, execute }` and may set
  `once: true`. This is enforced (with a warning, not a crash) by
  `src/index.js`.
- `store` values are JSON-serializable; `null` is used as the "unset" marker
  for the welcome channel instead of deleting a key.
- Command handlers are allowed to throw; `src/events/interactionCreate.js`
  catches, logs, and reports failures. Direct reply failures inside commands
  are therefore not individually caught in most command files.
- Pure helpers never throw for bad user input; they return `null`, `false`, or
  a `{ ok, error }` result so commands can render friendly messages.
- Timers created by the bot (`statsStore` auto-save, `/remind`) are `unref()`'d
  so they do not keep the process alive on their own.

---

# Root modules

The root modules form the process shell and the shared infrastructure. They are
imported by many files and are intentionally small and dependency-light.

## `src/index.js`

**Purpose.** Process entry point. Builds the discord.js client, loads command
modules once at startup, auto-registers every event module in `src/events/`, and
logs the bot in with fail-fast error handling.

**Exports.** None. This is an executable module whose top-level side effects do
the work; it is referenced by `package.json` (`"main"` and `npm start`).

**Interactions.** Imports `discord.js` (`Client`, `GatewayIntentBits`),
`src/config.js`, and `src/loadCommands.js`. Dynamically imports every `.js` file
in `src/events/`; those event modules in turn call into `src/cooldowns.js`,
`src/store.js`, and `src/statsStore.js`. It is the only place where
`client.commands` is assigned.

**Design decisions and notable details.**

- The client requests exactly three intents: `Guilds`, `GuildMembers`, and
  `GuildMessages`. `GuildMembers` is needed for the join event and
  `GuildMessages` for message counting; `MessageContent` is deliberately not
  requested because the bot never reads message text for prefix commands.
- Commands are loaded before login (`client.commands = await loadCommands()`),
  so the interaction handler can never observe a partially populated registry.
- Event discovery is data-driven: `fs.readdirSync(eventsDir).filter(isEventModule)`
  scans for `.js` files, so adding an event requires no edit to `index.js`.
- `isEventModule` is a pure `endsWith(".js")` check and is intentionally
  case-sensitive; a `README` or `.txt` file in `events/` is ignored.
- Dynamic imports use `pathToFileURL(...).href`, which is required for reliable
  ESM imports on all platforms and avoids hand-built `file://` strings.
- A failed event import is caught, logged with the module name, and skipped
  rather than crashing the process; the same applies to modules missing
  `name` or `execute`.
- `makeHandler` wraps `event.execute` in a stable arrow function. This keeps one
  listener reference per event, makes forwarding trivial, and preserves the
  original arguments (`execute(...args)`).
- `event.once === true` selects `client.once`; every other truthy/falsey value
  selects `client.on`, matching discord.js's convention.
- Only module-level errors in `index.js` itself (for example, an unreadable
  `events/` directory) are allowed to crash startup; runtime event errors are
  expected to be handled by event modules.
- `process.on("unhandledRejection", ...)` logs instead of terminating, so a
  stray rejected promise in a command cannot take the whole bot down.
- `client.on("error", ...)` is installed so an EventEmitter `"error"` event
  (WebSocket failures, etc.) is logged rather than thrown.
- Login failures are handled by `.catch(exitOnLoginFailure)`, which logs and
  calls `process.exit(1)`; this avoids a half-running bot with no gateway.
- There is no graceful-shutdown hook (no `SIGINT` handler, no final
  `statsStore.save()`), so stats written since the last auto-save tick can be
  lost on shutdown. This is a known trade-off, not an oversight in the event
  wiring.
- Top-level `await` is used, so the file relies on the Node 18+ ESM guarantee
  already declared in `package.json`'s `engines`.

## `src/config.js`

**Purpose.** Centralizes environment-variable reading and exposes a validated
`config` object so no other module touches `process.env` directly for
configuration.

**Exports.** `config`, with `token`, `clientId`, `guildId`, and
`commandCooldownSeconds`.

**Interactions.** Imported by `src/index.js` (token), `src/deploy.js` (token,
client ID, guild ID), and `src/events/interactionCreate.js` (default command
cooldown). It imports `dotenv/config` for its side effect of loading `.env`.

**Design decisions and notable details.**

- `dotenv/config` is imported for side effects at the top of the module, so any
  module that imports `config` automatically gets `.env` loading without extra
  setup.
- `DISCORD_TOKEN` and `CLIENT_ID` are required. `requireEnv` prints a helpful
  "copy `.env.example`" message and calls `process.exit(1)` rather than
  throwing, because configuration errors are unrecoverable at startup.
- `GUILD_ID` is optional and normalizes an empty string to `null` via
  `process.env.GUILD_ID || null`, which selects global command registration in
  `deploy.js`.
- `COMMAND_COOLDOWN_SECONDS` is optional and defaults to `3` with a minimum of
  `0`. The minimum allows operators to disable cooldowns entirely.
- `optionalNumber` trims raw input, rejects empty strings, and falls back with
  a warning for non-finite values or values below `min`; bad input never
  crashes startup.
- The empty-string check is explicit (`raw === ""`) because `Number("")` is
  `0`, which would otherwise silently become a valid zero cooldown.
- Numeric validation uses `Number.isFinite`, so `"Infinity"` and `"NaN"` fall
  back instead of leaking non-finite values into the cooldown calculation.
- No token-format validation is performed; Discord rejects malformed tokens at
  login time, which keeps this module dependency-free.
- The object is frozen only by convention; nothing mutates `config` after
  import.
- Because `requireEnv` exits at module evaluation time, importing `config.js`
  in a unit test without environment variables would terminate the test
  process. The test suite therefore avoids importing it.
- The module deliberately does not read `data/` or any file; it is pure
  environment configuration.
- `guildId` being a string or `null` lets callers use a single truthiness check
  to choose between guild-scoped and global behaviour.

## `src/store.js`

**Purpose.** Tiny persistent key/value settings store for per-guild
configuration, backed by `data/settings.json`.

**Exports.** `store`, an object with `get(guildId, key)` and
`set(guildId, key, value)`.

**Interactions.** Imported by `src/commands/welcome-message.js` (writes and
reads `welcomeChannel`) and `src/events/guildMemberAdd.js` (reads
`welcomeChannel`). It uses only Node built-ins (`fs`, `path`, `url`).

**Design decisions and notable details.**

- The data path is derived from `import.meta.url`, not the current working
  directory, so the bot behaves the same whether started from the repo root or
  elsewhere.
- `readAll` re-reads and re-parses the file on every `get`/`set`, trading
  performance for simplicity and freshness; there is no in-memory cache to
  invalidate.
- Malformed JSON, a missing file, or a non-object top-level value all fall back
  to `{}` without throwing, so a corrupt settings file degrades to "no
  settings" instead of blocking startup.
- `isPlainObject` excludes arrays and `null`, preventing `store.set` from
  treating an array as a guild map.
- `set` performs a read-modify-write of the entire file. Concurrent writers in
  different processes would last-write-win; within the single Node process the
  event loop serializes synchronous calls, so this is safe in practice.
- Writes are atomic: data is serialized to `settings.json.<pid>.tmp`, then
  renamed over the target, preventing readers from observing a half-written
  file after a crash.
- `fs.mkdirSync(dataDir, { recursive: true })` makes first-run creation
  idempotent.
- `JSON.stringify(data, null, 2)` keeps the file human-editable, which matters
  for a bot whose configuration is often inspected by hand.
- `null` is stored as a real JSON value (used by `/welcome-message clear`);
  there is no delete API, so the guild entry and key remain with a `null`
  value. Consumers check truthiness.
- The module is synchronous by design: settings are small and changed rarely,
  and synchronous file I/O avoids races between interleaved async handlers.
- `writeAll` intentionally lets filesystem errors propagate so command handlers
  can fail visibly; only reads are fail-soft.
- The store is generic (`guildId`, arbitrary string key) even though only one
  key is currently used, leaving room for future per-guild settings without a
  schema migration.
- Corrupt-file recovery discards existing data on the next `set` (it starts
  from `{}`), which is acceptable because there is no backup strategy and the
  file is small.

## `src/loadCommands.js`

**Purpose.** Discovers and validates every command module under
`src/commands/`, returning a name-keyed `Map` for the client.

**Exports.** `loadCommands()`, an async function returning
`Map<string, command>`.

**Interactions.** Imported by `src/index.js` (runtime registry) and
`src/deploy.js` (registration payloads). It dynamically imports everything in
`src/commands/`, which transitively pulls in `src/lib/*`, `src/colors.js`,
`src/store.js`, and `src/statsStore.js`.

**Design decisions and notable details.**

- Discovery is recursive via `collectCommandFiles`, so future nested command
  folders work without changes; results are collected depth-first.
- The filter is `entry.isFile() && entry.name.endsWith(".js")`, which skips
  directories, non-JS files, and symlink-loop risks that a naive recursive
  walker might hit.
- Imports are dynamic and use `pathToFileURL`, matching `index.js` and avoiding
  platform-specific URL bugs.
- A module that fails to import is logged and skipped with its path relative to
  `src/commands`, so one broken command cannot prevent the rest from loading.
- Validation requires both `command.data.name` and a function `execute`;
  missing either produces a warning rather than a throw.
- Duplicate command names are detected with `commands.has(...)` and the later
  file is skipped with a warning. Which file wins is therefore directory-order
  dependent, but the failure is loud.
- The returned `Map` is keyed by `data.name`, not by filename, and
  `interactionCreate` looks commands up by the Discord-provided name.
- The function logs the final count, giving operators a quick startup sanity
  check.
- No validation of `data` being a `SlashCommandBuilder` happens here; the test
  suite enforces that shape, while the loader only needs a name and execute at
  runtime.
- No hot reload or cache busting is implemented: imports are evaluated once per
  process, and changing a command requires a restart (and `npm run deploy` for
  Discord to see schema changes).
- Errors reading the commands directory itself are not caught, because an
  unreadable `src/commands` is a deployment/packaging error that should stop
  startup.
- The function is async only because dynamic `import()` is async; there is no
  I/O concurrency or parallelism, which keeps load order deterministic.

## `src/deploy.js`

**Purpose.** One-shot script that registers all locally loaded slash commands
with Discord via the REST API.

**Exports.** None; executable module used by `npm run deploy`.

**Interactions.** Imports `REST`/`Routes` from `discord.js`, `config` from
`src/config.js`, and `loadCommands` from `src/loadCommands.js`. It therefore
loads every command module, including their transitive store imports.

**Design decisions and notable details.**

- Registration reuses the runtime loader, guaranteeing that what is deployed is
  exactly what the bot will look up in `client.commands`.
- Each command is converted with `command.data.toJSON()`; the helper is trivial
  but documents the expected builder contract.
- `config.guildId` toggles between `Routes.applicationGuildCommands` (instant,
  guild-scoped) and `Routes.applicationCommands` (global, potentially slow to
  propagate). This lets development use a test guild and production go global.
- `REST().setToken(config.token)` relies on `config.js` having already validated
  the token's presence.
- A single `PUT` replaces the entire command set, which removes stale commands
  but also means a failed partial deploy cannot leave a mixed state.
- The script logs the number of registered commands and whether they were
  guild-scoped, using the array returned by the API.
- Any failure is caught, logged with full error detail, and converted to
  `process.exit(1)` so CI or a shell chain sees a non-zero status.
- There is no diffing or dry-run mode; every deploy sends the full payload even
  when nothing changed, which is acceptable for a small command set.
- The script does not log in to the gateway; it only needs the REST token, so it
  can run without the bot being online.
- Top-level `await` is used for the loader and the REST call, consistent with
  the ESM runtime requirement.
- `toPayload` would throw a `TypeError` if a command lacked `data.toJSON`;
  that is acceptable because all commands use `SlashCommandBuilder`.
- Environment requirements differ from `index.js` only in practice: `GUILD_ID`
  is meaningful here, and `CLIENT_ID` is mandatory for both scopes.

## `src/colors.js`

**Purpose.** Single source of truth for embed colors, so the visual identity is
consistent and easy to change.

**Exports.** `COLORS`, an object with `brand`, `success`, and `error` numeric
24-bit RGB values.

**Interactions.** Imported by `src/commands/help.js`, `userinfo.js`,
`serverinfo.js`, `avatar.js`, `define.js`, `weather.js`, `serverstats.js`, and
`src/events/guildMemberAdd.js`. It imports nothing.

**Design decisions and notable details.**

- Values match Discord's brand palette: blurple `0x5865f2`, green `0x57f287`,
  and red `0xed4245`.
- Numbers (not strings) are used because discord.js `EmbedBuilder#setColor`
  accepts integer colors directly and avoids repeated hex parsing.
- The module is intentionally tiny and dependency-free so it can be imported by
  every layer without creating cycles.
- `brand` is the dominant color for informational embeds (help, user info,
  server info, avatar, dictionary, weather, stats).
- `success` is used by the welcome embed, where a positive tone is appropriate.
- `error` is currently exported but unused by runtime code; it exists for
  consistency and future error embeds. Commands use plain text with emoji
  instead of red embeds for errors.
- Centralizing colors prevents drift where one command would use a slightly
  different hex code than another.
- The object is not frozen; the small surface makes accidental mutation
  unlikely, and freezing would add noise for no practical gain.
- No theme or per-guild color support exists; that would require a settings
  lookup and is deliberately out of scope.
- Because the module has no side effects, importing it in tests is cheap and
  safe.

## `src/cooldowns.js`

**Purpose.** In-memory, per-user, per-command cooldown tracking used to throttle
slash-command spam.

**Exports.** `checkCooldown(userId, commandName, seconds)` and
`resetCooldown(userId, commandName)`.

**Interactions.** Imported only by `src/events/interactionCreate.js`, which
passes the invoking user's ID, the resolved command name, and either the
command's own `cooldown` override or `config.commandCooldownSeconds`.

**Design decisions and notable details.**

- State is a module-level `Map` keyed by `` `${commandName}:${userId}` ``;
  command name first makes keys readable and avoids collisions between IDs.
- Values are absolute expiry timestamps in epoch milliseconds, so checks are a
  single comparison and do not require decrementing counters.
- The first allowed call both returns `0` and starts the window, meaning the
  cooldown begins at execution time rather than at reply time.
- A blocked call returns `Math.ceil((expiresAt - now) / 1000)`, so the user is
  told a whole number of seconds and never sees `0` while still blocked.
- A blocked call does not extend the window; repeated attempts do not reset the
  timer, which avoids punishing users indefinitely.
- `seconds` values that are non-finite or `<= 0` short-circuit to `0`,
  providing a clean way to disable throttling per command or globally.
- Expired entries are pruned opportunistically only when the map exceeds 5000
  entries; the sweep removes entries whose expiry is `<= now`.
- Because the sweep only removes expired entries, a map full of active
  cooldowns can exceed the threshold temporarily; this is bounded by the number
  of active users and is acceptable.
- There is no persistence: restarts clear all cooldowns, which is desirable for
  a lightweight bot and avoids stale timestamps.
- There is no cross-process coordination; running multiple bot instances would
  give each its own cooldown state.
- `resetCooldown` is exposed for administrative or testing use; no command
  currently calls it, but it makes the module complete and testable.
- Single-threaded JavaScript means there is no locking around check-and-set;
  the read and write happen synchronously with no await between them.
- The module deliberately does not depend on discord.js or config, keeping it
  trivially unit-testable with a fake clock.

## `src/statsStore.js`

**Purpose.** Persistent per-guild, per-channel message statistics. Loads counts
once at startup, updates them in memory, and periodically flushes them to
`data/stats.json`.

**Exports.** `recordMessage(guildId, channelId)`, `topChannels(guildId, limit)`,
`totalMessages(guildId)`, `trackedChannelCount(guildId)`, `save()`, and
`startAutoSave(intervalMs)`.

**Interactions.** Imports pure helpers from `src/lib/stats.js` (aliased to
`bumpCount`, `sortChannels`, `sumCounts`). Imported by
`src/events/messageCreate.js` (record), `src/events/ready.js` (auto-save), and
commands `serverstats` and `topchannels` (read).

**Design decisions and notable details.**

- Counts are loaded once into the module-level `counts` object and normalized
  immediately, unlike `store.js` which re-reads on every access. This avoids
  per-message file I/O on the hot path at the cost of not seeing external
  edits.
- The shape is `guildId -> channelId -> count`, a plain JSON-friendly nested
  object with no dependency on `Map`.
- `guildCounts` lazily creates a guild map for writes; `peekGuildCounts` is the
  read-only counterpart and returns a fresh empty object for absent or
  malformed guilds, so read paths never create empty guild entries.
- `normalize` deletes non-object guild maps, non-integer or `< 1` counts, and
  guild maps that become empty. This protects against hand-edited or partially
  written files.
- Normalization runs at load and again before every save, so invalid values
  introduced in memory cannot be persisted.
- `load` is fail-soft: any read or parse error yields `{}`; a corrupt file is
  replaced on the next save.
- `recordMessage` delegates the actual increment to the pure helper, keeping
  the counting rule in one place shared with tests.
- `topChannels` delegates sorting/limits to `lib/stats.js`, so the store only
  owns persistence and guild scoping.
- `totalMessages` and `trackedChannelCount` are read-only and do not mutate the
  counts object.
- `save` uses the same atomic temp-file-plus-rename pattern as `store.js`, with
  a PID-suffixed temp file to avoid collisions between concurrent writers.
- `startAutoSave` uses `setInterval` and calls `timer.unref?.()`, so the timer
  never keeps the process alive; `ready.js` starts it with a five-minute
  interval.
- `autoSaveTick` catches and logs save failures instead of letting them escape
  the timer callback, which would otherwise become an unhandled rejection or
  crash.
- The save cadence means up to five minutes of counts can be lost on an abrupt
  shutdown; this is the deliberate trade-off for avoiding a write per message.
- `startAutoSave` can be called more than once and would create multiple
  intervals; only `ready.js` calls it, and the ready event is `once: true`, so
  this is safe in the current wiring.

---

# Library modules (`src/lib`)

The `lib/` modules contain pure, framework-free logic. They have no discord.js
imports and no I/O, which makes them the primary target of the unit tests. Each
helper either returns a result object or a sentinel (`null`, `false`) for
invalid input rather than throwing.

## `src/lib/dice.js`

**Purpose.** Parses and rolls tabletop dice notation, and formats the result
message used by `/dice` and `/roll`.

**Exports.** `MAX_DICE` (25), `MAX_SIDES` (1000), `parseNotation(input)`,
`rollDice(dice, sides)`, `formatRollReply(dice, sides, rolls, total)`, and
`isNotationInRange({ dice, sides })`.

**Interactions.** Imported by `src/commands/dice.js` (full pipeline) and
`src/commands/roll.js` (constants, roll, format). Imported by five test files
(`dice`, `diceMore`, `libMore`, `libEdge`, `libExtra`, `libAdditional`,
`libFinal`) which pin down its parsing and range contracts.

**Design decisions and notable details.**

- Parsing and range validation are separate. `parseNotation` answers "is this
  the NdN shape?" while `isNotationInRange` answers "is it allowed?", so the
  command can give distinct error messages for malformed versus out-of-range
  input.
- The parser uses a single anchored regex, `/^(\d+)d(\d+)$/i`, with `trim()`
  for surrounding whitespace. As a result `" 2d6 "` is valid but `"2 d6"`,
  `"2d 6"`, and `"2d6x"` are not.
- The regex is case-insensitive for the `d` separator but not for digits, so
  full-width or Arabic-Indic digit lookalikes are rejected (the test suite
  checks this).
- Shorthand like `"d20"`, modifiers like `"2d6+1"`, signed counts, floats, and
  combined dice expressions are intentionally unsupported, keeping the command
  surface small and unambiguous.
- `Number(match[1])` and `Number(match[2])` mean enormous values parse
  successfully (for example a 20-digit count becomes `1e20`) and are then
  rejected by the range check rather than crashing the parser.
- `isNotationInRange` enforces `dice >= 1 && dice <= MAX_DICE` and
  `sides >= 2 && sides <= MAX_SIDES`. Sides of 1 are rejected even though
  `rollDice` can technically handle them, matching the user-facing contract.
- `rollDice` does not validate its arguments; it trusts callers (or tests) to
  pass sane values. This keeps it a small primitive and lets tests deliberately
  exercise `rollDice(1000, 6)` and `rollDice(0, 6)`.
- Each die is `1 + Math.floor(Math.random() * sides)`, producing a uniform
  integer in `[1, sides]`; `Math.floor` makes `Math.random() === 0` map to 1
  and values just below 1 map to `sides`.
- `Math.random` is not cryptographically secure, which is fine for a game
  command but is why the helper is not reused for anything security-sensitive.
- The total is computed with a reducer over the rolls array rather than being
  accumulated during generation, guaranteeing it always equals the sum the user
  sees.
- Zero dice is a valid primitive input and yields `{ rolls: [], total: 0 }`,
  though the commands cannot request it because Discord enforces a minimum of
  one.
- `formatRollReply` includes the total only when `dice > 1`; a single-die roll
  omits a redundant "total" and a zero-die roll produces a trailing label with
  an empty list (tested as an edge case).
- The reply embeds the canonical `NdN` notation in bold and joins faces with
  `", "`, which keeps output stable for snapshot-style tests.

## `src/lib/duration.js`

**Purpose.** Parses human duration strings for `/remind` and renders a
human-readable duration for confirmation messages.

**Exports.** `MAX_DURATION_MS` (seven days in milliseconds), `parseDuration`,
and `formatMs`.

**Interactions.** Imported by `src/commands/remind.js`, which uses all three
exports, and by `duration`, `durationMore`, `libMore`, `libEdge`, `libExtra`,
`libAdditional`, and `libFinal` tests.

**Design decisions and notable details.**

- The accepted grammar is exactly `^(\d+)\s*([smhdw]?)$` after trimming, so a
  bare number defaults to minutes and an optional single unit follows.
- A single regex is used instead of a tokenizer because the grammar has no
  compound expressions; rejecting `"1h30m"` is simpler and safer than trying to
  sum components.
- Units are case-insensitive; `M` means minutes, not months, and there is no
  year/month unit. `W` means weeks.
- `\s*` between the number and unit allows spaces, tabs, and newlines
  (`"5 m"`, `"1\tw"`), while still rejecting whitespace inside the number.
- Floats, scientific notation, negative numbers, a leading `+`, duplicated
  units, and unit-only strings all fail the regex and return `null`.
- `"0"`, `"0s"`, and other zero forms parse to `0`. Zero is intentionally not
  treated as invalid in the parser; the command relies on the falsiness of `0`
  to reject it, which the duration tests document explicitly.
- The parser does not clamp to `MAX_DURATION_MS`; it returns the true value so
  the command can tell the user the difference between "invalid" and "too
  long". `/remind` applies the seven-day ceiling.
- The unit table is an object literal keyed by the normalized unit; the empty
  key provides the minutes default in the same lookup, avoiding a branch.
- `MAX_DURATION_MS` is computed from readable multiplicative constants rather
  than a magic number, and the tests assert it equals seven days exactly.
- `formatMs` rounds to the nearest minute first, then picks the coarsest unit
  that divides evenly: whole days if divisible by 1440, else whole hours if
  divisible by 60, else minutes.
- It never combines units, so 90 minutes renders as `"90 minute(s)"` rather
  than `"1 hour(s) 30 minute(s)"`; this is a deliberate simplicity choice.
- `formatMs(0)` and other sub-minute values round to zero minutes, and zero is
  divisible by 1440, so they render as `"0 day(s)"` — an odd but tested and
  documented edge case.
- The `"(s)"` suffix sidesteps pluralization logic at the cost of slightly
  clunky copy.

## `src/lib/randomness.js`

**Purpose.** Supplies the random choices for `/8ball` and `/coinflip` from a
fixed, jargon-free data set.

**Exports.** `EIGHT_BALL_RESPONSES` (a 20-string array) and the functions
`pick8BallResponse()` and `flipCoin()`.

**Interactions.** Imported by `src/commands/8ball.js` and
`src/commands/coinflip.js`; exercised by `randomness`, `libMore`, `libEdge`,
`libExtra`, `libAdditional`, and `libFinal` tests.

**Design decisions and notable details.**

- The answer pool is a frozen-by-convention array literal, half affirmative and
  half non-committal/negative, so results feel like a real Magic 8-Ball.
- Answers are complete sentences ending in a period, with no leading or
  trailing whitespace and no newlines; tests assert all three properties.
- The canonical first and last answers (`"It is certain."` and
  `"Very doubtful."`) are pinned by tests because they define the mapping of the
  random extremes.
- `pick8BallResponse` uses `Math.floor(Math.random() * length)`, the same
  uniform-index pattern as the dice roller; `0` selects the first answer and
  values just below 1 select the last.
- `flipCoin` uses `Math.random() < 0.5 ? "Heads" : "Tails"`, so the midpoint
  `0.5` belongs to Tails; tests pin this boundary.
- Return values are plain strings/string literals, not objects, which keeps the
  command code trivial and the tests readable.
- No crypto randomness is used; these are entertainment features, and using
  `crypto.randomInt` would add asynchronous complexity for no user-visible
  benefit.
- The array is exported so tests and the `/8ball` command share one canonical
  list; nothing mutates it, but it is not deeply frozen.
- `Math.random` is the only source of nondeterminism; tests replace it with
  scripted values to verify the exact index and coin boundary behaviour.
- There is no localization or per-guild customization; the pool is intentionally
  fixed and small.
- Because the module is pure and side-effect free, it is safe to import from
  any layer, though only the two commands do.

## `src/lib/stats.js`

**Purpose.** Pure message-count and repeat-string utilities shared by
`src/statsStore.js` and the `/repeat` command.

**Exports.** `MAX_REPEAT_TIMES` (5), `MAX_REPEAT_LENGTH` (200),
`recordMessage(counts, channelId)`, `topChannels(counts, limit = 10)`,
`totalMessages(counts)`, `validateRepeat(text, times)`, and
`buildRepeat(text, times)`.

**Interactions.** Imported by `src/statsStore.js` (counting/sorting/summing,
with aliases to disambiguate from its own exports) and
`src/commands/repeat.js` (limits and builders). Covered by `stats`, `libMore`,
`libEdge`, `libExtra`, `libAdditional`, and `libFinal` tests.

**Design decisions and notable details.**

- `recordMessage` mutates the caller's plain object and returns the new count.
  Mutation is deliberate: `statsStore` owns the object and wants in-place
  updates without copying nested maps.
- A missing or zero count is treated as `0` via `(counts[channelId] ?? 0) + 1`,
  so a stored zero restarts at one.
- `topChannels` maps entries to `{ channelId, count }` objects before sorting,
  producing a stable, serializable result that is easy to assert in tests.
- The comparator is `b.count - a.count || a.channelId.localeCompare(b.channelId)`,
  giving descending counts and deterministic ascending-ID tie breaks.
- The limit is normalized with `Math.max(0, Math.floor(limit))`. Negative and
  fractional limits become `0` or are floored; `NaN` propagates to `slice(0, NaN)`
  which returns an empty array; `Infinity` returns all entries.
- Default limit is 10, matching `/topchannels`; `/serverstats` passes 25
  explicitly.
- Sorting is done on a mapped copy, so the input counts object is never
  mutated — a property asserted by the tests.
- `totalMessages` is a simple `Object.values(...).reduce(...)`, so it sums odd
  values (including negatives) arithmetically rather than validating them;
  validation is `statsStore.normalize`'s job.
- `validateRepeat` returns a discriminated union `{ ok: true }` or
  `{ ok: false, error }` instead of throwing, letting the command render the
  exact message.
- Text is checked with `typeof text === "string" && text.trim()`, so non-string
  values and whitespace-only text share the "Text cannot be empty." error.
- Length is checked on the raw string, preserving intentional leading/trailing
  spaces in the repeated output while still enforcing the 200-character limit.
- The repeat-count checks use `Number.isInteger(times) && times >= 1`, which
  rejects `NaN`, infinities, numeric strings, and booleans, then enforce the
  hard maximum of 5.
- `buildRepeat` delegates validation to `validateRepeat` so the command and the
  helper can never disagree, and joins copies with `"\n"` using
  `Array(times).fill(text)`.
- The limits (5 repetitions, 200 characters, default/minimum of one) are chosen
  to prevent the command from being used as a message-spam or amplification
  tool.

---

# Event modules (`src/events`)

Event modules are loaded dynamically by `src/index.js`. Each default-exports a
`name` from discord.js's `Events` enum, an `execute` function, and optionally
`once: true`. They contain orchestration but almost no business logic.

## `src/events/interactionCreate.js`

**Purpose.** Central slash-command dispatcher: resolves the command, enforces
cooldowns, and runs the handler with error reporting.

**Exports.** A default event object with `name: Events.InteractionCreate` and
`execute(interaction)`.

**Interactions.** Imports `discord.js` (`Events`), `src/config.js` (default
cooldown), and `src/cooldowns.js` (`checkCooldown`). It reads
`interaction.client.commands`, the `Map` populated by `src/index.js`, and calls
every command's `execute`.

**Design decisions and notable details.**

- Only `isChatInputCommand()` interactions are handled; buttons, modals,
  autocomplete, and context-menu interactions return immediately. `/help`
  manages its own button collector, so no global component routing is needed.
- Unknown command names produce an ephemeral message suggesting `npm run deploy`
  instead of silently failing, which directly addresses the common "registered
  in code but not deployed" mismatch.
- Cooldown resolution prefers `command.cooldown` when it is a number, falling
  back to `config.commandCooldownSeconds`; this lets future commands opt into
  custom throttling without changing the dispatcher.
- The cooldown key is user ID plus `command.data.name`, so two commands cannot
  share a bucket accidentally.
- A cooldown rejection includes the remaining whole seconds and is ephemeral,
  so it does not clutter the channel.
- The command's `execute` is wrapped in `try/catch`; the dispatcher is the one
  place that guarantees command failures never become unhandled rejections.
- Error reporting adapts to interaction state: if the command already deferred
  or replied, it uses `followUp`; otherwise it uses `reply`. This avoids the
  "interaction already acknowledged" error.
- Both the cooldown reply and the error report use `.catch(ignoreReplyError)`,
  so a failure to notify the user cannot cascade into a second throw.
- Errors are logged with the command name and the full error object; the user
  sees a generic apology rather than internal details.
- The dispatcher performs no permission checks of its own. Commands declare
  `setDefaultMemberPermissions` and also check `memberPermissions` at runtime,
  which covers both Discord's UI gating and direct invocation edge cases.
- There is no per-guild enable/disable or command allowlist; every loaded
  command is available wherever Discord permits it.
- Because the handler is `async` and awaited by discord.js, long-running
  commands do not block other interactions; each invocation runs independently
  on the event loop.

## `src/events/ready.js`

**Purpose.** One-time startup hook that reports the logged-in identity, sets the
bot's presence, and starts the stats auto-save loop.

**Exports.** A default event object with `name: Events.ClientReady`,
`once: true`, and `execute(client)`.

**Interactions.** Imports `ActivityType`/`Events` from discord.js and
`startAutoSave` from `src/statsStore.js`.

**Design decisions and notable details.**

- `once: true` is essential: the ready event can fire again after a reconnect,
  and starting a new interval each time would leak timers and multiply saves.
- The log line includes the bot tag, user ID, and guild count, which is the
  fastest way to confirm the correct token and intents at startup.
- Presence is set to `Listening to "/help"` so users can discover the help
  command from the member list; `ActivityType.Listening` is used with a string
  that reads naturally.
- The auto-save interval is five minutes, matching the comment in the log line
  and balancing data-loss exposure against write frequency.
- The timer returned by `startAutoSave` is not stored; because it is `unref`'d
  and the ready event runs once, there is no need to cancel it.
- `client.user` is assumed non-null in the ready handler; discord.js guarantees
  this when `ClientReady` fires.
- No command registration happens here; deployment is a separate explicit step,
  avoiding accidental global command churn on every restart.
- No cache warming or member fetching is performed, keeping startup fast and
  avoiding rate-limit bursts.
- There is no error handling around `setActivity`; a failure would surface as a
  rejected promise. In practice this call is local and does not fail once the
  gateway is ready.
- The handler logs that auto-save is active, so operators can confirm the
  persistence loop started even before the first save.
- No shutdown hook is registered, so the final five-minute window can be lost;
  this is consistent with the statsStore design trade-off.

## `src/events/guildMemberAdd.js`

**Purpose.** Sends a welcome embed when a member joins a guild, if that guild
has configured a welcome channel.

**Exports.** A default event object with `name: Events.GuildMemberAdd` and
`execute(member)`.

**Interactions.** Imports `EmbedBuilder`/`Events` from discord.js, `store` from
`src/store.js`, and `COLORS` from `src/colors.js`. The channel ID is written by
`src/commands/welcome-message.js`.

**Design decisions and notable details.**

- The handler is a no-op when no `welcomeChannel` is stored, so the feature is
  opt-in per guild and costs a single synchronous settings read otherwise.
- It first checks `member.guild.channels.cache`, then falls back to
  `channels.fetch`, because the channel may not be cached on a fresh start or
  after a long idle period.
- A failed fetch is converted to `null` by `ignoreFetchError`, allowing a single
  truthiness check for "channel unavailable" instead of a try/catch block.
- `!channel || !channel.isTextBased()` guards against deleted channels and
  misconfigured IDs; announcement channels are text-based, matching the
  command's channel-type restriction.
- The embed mentions the user, includes the guild name and current member count,
  and uses the user's 256px avatar as a thumbnail.
- The description intentionally uses `member.guild.memberCount` rather than a
  fetched count; it is cheap and may be approximately cached, which is
  acceptable for a welcome message.
- `COLORS.success` gives welcome messages a distinct positive visual identity
  compared with the brand-colored informational embeds.
- `.setTimestamp()` adds the join time to the footer, giving users context
  without extra fields.
- Send failures are caught and logged rather than thrown; a missing permission
  in one guild must not produce an unhandled rejection or affect other guilds.
- The handler does not check the bot's own permissions before sending, relying
  on the catch to absorb `Missing Permissions` errors.
- There is no per-guild message template, delay, or DM fallback; those would
  require settings schema and UX that the current command surface does not
  expose.
- Because the welcome channel is read from disk on every join, configuration
  changes take effect immediately without a restart — unlike stats data, which
  is cached.

## `src/events/messageCreate.js`

**Purpose.** Increments the per-channel message counter for every eligible
message.

**Exports.** A default event object with `name: Events.MessageCreate` and
`execute(message)`.

**Interactions.** Imports `Events` from discord.js and `recordMessage` from
`src/statsStore.js`. The counts it builds are read by `/serverstats` and
`/topchannels`.

**Design decisions and notable details.**

- `if (!message.inGuild() || message.author?.bot) return;` filters out DMs, group
  DMs, and bot/webhook messages so statistics reflect human guild activity.
- The optional chaining on `author` is defensive; a normal message always has an
  author, but the handler should not throw on partial payloads.
- No `MessageContent` intent is requested, and the handler never reads
  `message.content`; it only needs IDs and author metadata, which keeps the bot
  in the lower-privilege intent tier.
- The handler is intentionally synchronous in effect: `recordMessage` mutates an
  in-memory object and returns immediately, so message throughput is not gated
  by disk I/O.
- Counts are keyed by `message.guildId` and `message.channelId`, both of which
  are guaranteed present after `inGuild()`.
- Threads and forum posts are counted under their own channel/thread IDs,
  because the handler does not walk up to a parent channel. This is a simple,
  predictable rule.
- There is no prefix-command handling; all user interactions go through slash
  commands, so message content is irrelevant.
- The `async` keyword is technically unnecessary because no promise is awaited,
  but it matches the event-module contract and keeps the handler future-proof.
- Deleted messages are not decremented and edits do not double-count, because
  only the create event is observed. This measures messages sent, not messages
  currently present.
- Failures inside `recordMessage` would propagate to the event emitter; the
  function itself only performs in-memory arithmetic and cannot fail for valid
  IDs.
- Persistence is decoupled: the handler never calls `save()`. The five-minute
  auto-save in `ready.js` is the only writer, which prevents a write storm on
  busy servers.
- Because the stats store is loaded once at startup, messages sent while the
  bot is offline are not counted; there is no backfill.

---

# Command modules (`src/commands`)

Each command default-exports `{ data, execute }`. The `data` builder defines
Discord's slash-command schema (options, permissions, DM policy), while
`execute` receives a `ChatInputCommandInteraction` already acknowledged by the
dispatcher's cooldown check. Commands reply directly; the dispatcher catches
unexpected failures.

## `src/commands/ping.js`

**Purpose.** Reports round-trip latency and the gateway WebSocket heartbeat.

**Exports.** Default `{ data, execute }`; command name `ping`.

**Interactions.** Imports only `SlashCommandBuilder` from discord.js. Uses
`interaction.client.ws.ping` and the interaction/reply timestamps. No store or
lib dependencies.

**Design decisions and notable details.**

- The command sends `"🏓 Pinging..."` first, then measures by fetching that
  reply, so the reported round trip includes two API trips rather than an
  internal timer.
- Roundtrip is `reply.createdTimestamp - interaction.createdTimestamp`, which
  reflects real Discord API latency from the bot's perspective.
- `interaction.client.ws.ping` is the heartbeat latency maintained by
  discord.js; it is displayed alongside the roundtrip because the two numbers
  answer different questions.
- The heartbeat is validated with `Number.isFinite(ws) && ws >= 0`; before the
  first heartbeat, discord.js can report `-1`, so the command displays
  `"measuring..."` instead of a negative number.
- `Math.round` is applied to the heartbeat but not the roundtrip; roundtrip
  timestamps are already integer milliseconds.
- The reply is edited in place with `editReply`, so users see one message that
  transitions from "Pinging" to the result.
- There is no deferred reply; the initial reply acknowledges the interaction
  immediately, and editReply updates it.
- The output is plain text with bold numbers rather than an embed, keeping the
  command lightweight and fast.
- No cooldown override is declared, so the global default applies.
- The command does not catch its own reply/edit failures; the dispatcher's
  error path handles them.
- No permissions are required and the command works in DMs because
  `setDMPermission` is not disabled.
- The emoji (🏓) provides a visual cue without affecting parsing or tests.

## `src/commands/help.js`

**Purpose.** Lists every loaded slash command in alphabetically sorted, paginated
embeds with Previous/Next buttons.

**Exports.** Default `{ data, execute }`; command name `help`.

**Interactions.** Imports several discord.js builders plus `COLORS` from
`src/colors.js`. Reads `interaction.client.commands` (the `Map` from
`src/loadCommands.js`) and creates its own message-component collector.

**Design decisions and notable details.**

- Commands are sorted by `data.name.localeCompare` so the listing is stable and
  independent of filesystem import order.
- `PAGE_SIZE` is 25, matching Discord's 25-field/line practical limits and
  keeping each embed readable; the footer shows `Page X/Y • N commands`.
- An empty registry returns an ephemeral "No commands loaded." message instead
  of rendering an empty page.
- A single page replies directly with no buttons, avoiding needless components
  for small deployments.
- Multi-page output attaches two `Primary` buttons with custom IDs
  `help_prev` and `help_next`; the row disables Previous on the first page and
  Next on the last page.
- The collector is scoped to the help message
  (`message.createMessageComponentCollector`) and lasts `COLLECTOR_MS`
  (120 seconds), so it cannot react to unrelated buttons.
- Only the original invoker may change pages; other users receive an ephemeral
  rejection, preventing one user from hijacking another's help session.
- Page state is a closure variable, and bounds are clamped with
  `Math.min`/`Math.max`, so rapid clicks cannot move out of range.
- On collector end (timeout), both buttons are disabled via
  `row(page, true)` and an `editReply`, making the expired state visible without
  deleting the message.
- All optional reply/update calls use `.catch(ignoreError)` so a deleted message
  or missing permissions cannot crash the collector.
- The embed title and color are rebuilt through small `base`/`embedFor` helpers,
  keeping per-page formatting consistent and easy to test conceptually.
- No command metadata beyond name and description is shown; options and
  permissions are omitted to keep the page within embed limits.
- Cooldowns and permissions still apply through the dispatcher; help itself
  declares no special permissions and works in DMs if the client is present.

## `src/commands/userinfo.js`

**Purpose.** Shows an embed describing a user: tag, ID, bot status, account age,
and (when available) guild membership details.

**Exports.** Default `{ data, execute }`; command name `userinfo`.

**Interactions.** Imports `EmbedBuilder`/`SlashCommandBuilder` and `COLORS`.
Depends only on interaction data; no stores or libs.

**Design decisions and notable details.**

- The `target` option is optional; both `getUser` and `getMember` fall back to
  the invoking user and member when it is omitted.
- `getMember("target")` can return `null` for a user who is not in the guild
  (or if the member cache is unavailable), so membership fields are added only
  when a member object exists.
- The embed uses the user's 256px avatar as a thumbnail and the username in the
  title, keeping the visual focus on identity.
- Core fields are inline pairs: tag, ID, bot status, and account creation, with
  relative Discord timestamps (`<t:...:R>`) so every viewer sees a localized
  "x years ago".
- Membership fields add nickname, join date, and highest role, all inline;
  missing values fall back to `"None"` or `"Unknown"`.
- `member.roles.highest?.name` is optional-chained because a member may have no
  resolvable highest role in partial states.
- The command performs no network fetch for the member; it uses cached options
  data, which is fast but can be stale for very recent joins.
- No permissions are required and no DM restriction is set; user info is
  non-sensitive and useful in DMs.
- The reply is a single embed with no components, so it is safe to send without
  deferring.
- Error handling is delegated to the dispatcher; the command does not catch
  reply failures.
- Field count stays well below Discord's 25-field limit, leaving headroom for
  future additions.
- Timestamps are floored to whole seconds before interpolation, as Discord's
  timestamp syntax requires integer Unix seconds.

## `src/commands/serverinfo.js`

**Purpose.** Displays an embed summarizing the current guild: ID, owner, member
count, creation date, text/voice channel counts, roles, and boosts.

**Exports.** Default `{ data, execute }`; command name `serverinfo`.

**Interactions.** Imports `ChannelType`/`EmbedBuilder`/`SlashCommandBuilder` and
`COLORS`. Uses `guild.channels.cache` and `guild.roles.cache`; no stores.

**Design decisions and notable details.**

- The command is guild-only at runtime: `interaction.guild` is checked and a
  friendly ephemeral message is returned in DMs. `setDMPermission(false)` is
  not set here, but the runtime guard makes DMs harmless.
- Channel counts come from the cache and filter on `ChannelType.GuildText` and
  `ChannelType.GuildVoice`; threads, categories, forums, and stage channels are
  excluded from both counts.
- Member count uses `guild.memberCount`, which Discord maintains and which may
  be approximate under some intents; this is acceptable for an info command.
- The owner is rendered as a mention via `<@${guild.ownerId}>`, making it
  clickable even if the owner is not cached.
- Creation date uses a relative Discord timestamp, matching `/userinfo`'s
  presentation.
- Boost count falls back to `0` when `premiumSubscriptionCount` is null, which
  happens on some guild payloads.
- `guild.iconURL({ size: 256 })` may return `null` for iconless guilds;
  `setThumbnail(null)` is accepted by discord.js and simply omits the image.
- No API fetch is made; counts reflect cache state and may lag after bulk
  channel/role changes.
- All fields are inline to produce a compact grid; there is no attempt to list
  individual channels or roles.
- The command does not require permissions and does not catch reply failures.
- Field values are stringified explicitly (`String(...)`) because embed values
  must be strings.
- The embed has no timestamp, keeping output deterministic for a given cache
  state and avoiding implying real-time accuracy.

## `src/commands/avatar.js`

**Purpose.** Shows a user's avatar as an embed image with direct PNG and WebP
links.

**Exports.** Default `{ data, execute }`; command name `avatar`.

**Interactions.** Imports `EmbedBuilder`/`SlashCommandBuilder` and `COLORS`. No
stores or helpers.

**Design decisions and notable details.**

- The optional `target` option falls back to the invoking user, matching
  `/userinfo`'s ergonomics.
- Three URLs are generated: a 1024px default-format image for display and
  explicit 1024px PNG and WebP URLs for the link line.
- Using explicit extensions gives users predictable downloadable formats rather
  than Discord's automatic format selection (which may be GIF for animated
  avatars).
- The embed title is `"<username>'s avatar"` and the image is set with
  `setImage`, so the avatar renders at full width inside the embed.
- Links are markdown hyperlinks in the description, separated by a bullet,
  keeping the embed to one field area.
- The brand color is applied for consistency with the other informational
  embeds.
- No fetch is performed; `displayAvatarURL` builds a CDN URL from the user
  object already present in the interaction.
- The command works in DMs and requires no permissions.
- Animated avatars are still visible through the default image URL; users who
  want the animation can open the linked formats.
- No size option is exposed, keeping the command single-purpose and the embed
  predictable.
- Reply failures propagate to the dispatcher rather than being swallowed.
- The command name matches its filename, satisfying the shape test.

## `src/commands/8ball.js`

**Purpose.** Answers a user's yes/no question with a random Magic 8-Ball
response.

**Exports.** Default `{ data, execute }`; command name `8ball`.

**Interactions.** Imports `SlashCommandBuilder` and `pick8BallResponse` from
`src/lib/randomness.js`.

**Design decisions and notable details.**

- The `question` option is required and capped at 1000 characters, which keeps
  the reply within Discord's 2000-character message limit even after adding the
  answer and labels.
- The answer is selected by the pure helper, so the command contains no
  randomness of its own and the pool stays centralized.
- The reply quotes the question and answer in a two-line format with a 🎱
  emoji, making the cause-and-effect obvious.
- `allowedMentions: { parse: [] }` prevents the user's question (or the answer)
  from pinging roles, users, or everyone — an important injection defense for
  any command that echoes user text.
- Markdown in the question is not escaped, so users can format their question;
  mentions are still suppressed, which is the safety-critical part.
- The command does not use an embed, keeping it fast and simple.
- No cooldown override is declared; the global cooldown applies.
- The command works in DMs and requires no permissions.
- The answer is not validated against the question; it is intentionally random
  and non-semantic.
- Errors from replying are handled by the dispatcher.
- Because the response pool is fixed, the command is fully deterministic under a
  mocked `Math.random`, which the tests exploit.
- The command name begins with a digit, which is legal for Discord slash
  commands and is asserted against the filename by the shape test.

## `src/commands/roll.js`

**Purpose.** Rolls a user-specified number of dice with a user-specified number
of sides and replies with the faces and total.

**Exports.** Default `{ data, execute }`; command name `roll`.

**Interactions.** Imports `MAX_DICE`, `MAX_SIDES`, `formatRollReply`, and
`rollDice` from `src/lib/dice.js`.

**Design decisions and notable details.**

- Both options are optional: `sides` defaults to 6 and `dice` defaults to 1,
  making bare `/roll` behave like a single d6.
- The builder enforces `sides` in `[2, MAX_SIDES]` and `dice` in
  `[1, MAX_DICE]`, so the command does not repeat range validation in
  `execute`; Discord rejects out-of-range values before the bot sees them.
- The maximum bounds are interpolated from the shared constants, so changing the
  lib limit automatically updates the command schema and description.
- The command uses the same `rollDice`/`formatRollReply` pair as `/dice`,
  guaranteeing identical output for the same rolls.
- `getInteger` returns `null` for omitted options, hence the `??` defaults;
  `0` could not be returned for these options because of the minimums.
- No defer is needed because dice rolling is synchronous and CPU-trivial.
- The reply is plain text, not an embed, matching `/dice` and keeping the
  command fast.
- `allowedMentions` is not set because the output contains no user-provided
  text; there is nothing to inject.
- The command requires no permissions and works in DMs.
- Errors from replying are left to the dispatcher.
- The command does not enforce a cooldown override; the global cooldown applies.
- Because `rollDice` does not validate, the command's only range protection is
  the builder schema; direct invocation of `execute` with hand-made options is
  not a supported path.

## `src/commands/poll.js`

**Purpose.** Creates a reaction poll with either 👍/👎 voting or up to ten
numbered options.

**Exports.** Default `{ data, execute }`; command name `poll`.

**Interactions.** Imports only `SlashCommandBuilder`. Uses `NUMBER_EMOJIS`, a
module-local array, and `message.react` via the fetched reply.

**Design decisions and notable details.**

- The `question` option is required and capped at 500 characters; `options` is
  optional comma-separated text capped at 500 characters.
- Raw options are split on commas, trimmed, and filtered with `Boolean`, so
  stray commas and whitespace do not create empty choices.
- Exactly one option is rejected with an ephemeral explanation, because a
  one-choice poll is meaningless; zero options is a valid thumbs-up/down poll.
- More than ten options is rejected because only ten number emojis exist; the
  limit is derived from `NUMBER_EMOJIS.length` rather than hard-coded.
- With no options, the bot posts the question, fetches the message, and adds
  👍 then 👎 reactions; with options it formats `emoji option` lines and reacts
  with the first N number emojis.
- Reactions are added sequentially with `await`, which preserves order; each
  `react` call is individually `.catch(logReactionError)`, so a missing
  "Add Reactions" permission logs and lets the remaining reactions proceed
  instead of failing the already-posted poll.
- The question and options are echoed with `allowedMentions: { parse: [] }`,
  preventing mention injection.
- `fetchReply` is required because slash-command replies return an interaction
  response, not a `Message` with a `react` method.
- There is no button-based poll, no vote closing, and no deduplication of
  reactions; users can add multiple reactions manually, and results are read
  directly from Discord's reaction counts.
- The command does not defer, since posting plus reacting is relatively quick
  and Discord's initial response tolerates it; on very slow connections the
  dispatcher's error path would report a failure.
- No permissions are required and DMs are not explicitly disabled, though
  reactions work in DMs as well.
- Number emojis include the keycap ten (`🔟`) so the array length matches the
  maximum option count exactly.
- Markdown in option text is not escaped; formatting is allowed, but mentions
  are suppressed.

## `src/commands/clear.js`

**Purpose.** Bulk-deletes recent messages in the current channel, optionally
limited to one author, and reports how many were deleted or skipped.

**Exports.** Default `{ data, execute }`; command name `clear`.

**Interactions.** Imports `PermissionFlagsBits`/`SlashCommandBuilder`. Uses the
channel's message manager and bulk-delete API; no stores or helpers.

**Design decisions and notable details.**

- The command is gated three ways: `setDefaultMemberPermissions(ManageMessages)`
  hides it from unauthorized members, `setDMPermission(false)` restricts it to
  guilds, and `execute` re-checks `memberPermissions` for direct invocation.
- `amount` is required and constrained to 1–100, matching Discord's bulk-delete
  batch limit.
- An optional `user` filter deletes only messages by that author, which is the
  common moderation use case.
- The channel is checked with `isTextBased()`; voice/stage/forum channels that
  do not support message fetching get a friendly ephemeral error.
- The command defers ephemerally after validation so the potentially slow fetch
  and delete calls have time to complete without a "thinking" timeout.
- It fetches the latest 100 messages regardless of `amount` because that is
  Discord's maximum fetch page size and enough to find up to 100 targets.
- When filtering by user, it filters the fetched collection then takes the
  first `amount`; without a filter it takes the first `amount` directly.
- `bulkDelete(targets, true)` passes `true` to filter out messages older than
  14 days, which Discord refuses to bulk delete anyway; the returned collection
  contains only messages actually deleted.
- The skipped count is computed as `targets.length - deleted.size` and explained
  as "older than 14 days or outside the recent 100", covering both failure
  modes.
- An empty target list produces an ephemeral "no messages found" message rather
  than attempting a delete.
- Pinned messages are not explicitly protected here; Discord's bulk-delete
  behavior and the 14-day filter determine what is removed.
- The command does not log deletions to an audit channel; Discord's audit log
  records the bulk delete under the bot's identity.
- Reply strings use `**` bold and a 🧹 emoji for readability, and the final
  summary is an edit of the deferred reply.

## `src/commands/kick.js`

**Purpose.** Kicks a member from the guild with an optional reason.

**Exports.** Default `{ data, execute }`; command name `kick`.

**Interactions.** Imports `PermissionFlagsBits`/`SlashCommandBuilder`. Uses the
guild member object's `kickable` flag and `kick` method.

**Design decisions and notable details.**

- Permission is enforced by `setDefaultMemberPermissions(KickMembers)` and
  re-checked at runtime for defense in depth.
- `setDMPermission(false)` prevents nonsensical DM invocation.
- `target` is required and resolved as both a user and a member; the member
  object is needed for hierarchy checks and the kick call.
- A null member (user not in the guild) produces a clear ephemeral error.
- Self-kick is blocked explicitly, even though Discord would reject it, to give
  a better message.
- `member.kickable` encapsulates the bot's permission and role-hierarchy
  checks; if false, the command explains that the role is too high or
  permissions are missing.
- The optional `reason` defaults to `"No reason provided"` and is passed to
  Discord, where it appears in the audit log.
- The confirmation reply is ephemeral so the channel is not cluttered, and it
  uses `allowedMentions: { parse: [] }` to prevent the quoted user tag from
  pinging.
- The command does not DM the kicked user; Discord does not do so automatically,
  and no notification flow is implemented.
- The kick API call is awaited before replying, so a failed kick surfaces
  through the dispatcher's generic error instead of a false success.
- No cooldown override is declared; the global cooldown applies.
- The command does not verify that the target is not the guild owner; Discord's
  hierarchy rules reject that case through `kickable` or the API.

## `src/commands/ban.js`

**Purpose.** Bans a user from the guild, optionally deleting recent messages and
recording a reason.

**Exports.** Default `{ data, execute }`; command name `ban`.

**Interactions.** Imports `PermissionFlagsBits`/`SlashCommandBuilder`. Uses
`guild.members.ban` with `deleteMessageSeconds`.

**Design decisions and notable details.**

- Permission is enforced by `setDefaultMemberPermissions(BanMembers)` and
  re-checked at runtime; DMs are disabled.
- `target` is a required user option, which allows banning users who are not
  currently members — unlike `/kick`, which requires a member object.
- The optional `member` lookup is only used for the `bannable` hierarchy check;
  if the user is not in the guild, the ban can still proceed through the API.
- `delete_messages` accepts 0–7 days, matching Discord's maximum
  `deleteMessageSeconds` window; the value is converted to seconds with
  `deleteDays * 24 * 60 * 60`.
- Self-ban is blocked explicitly before any API call.
- The optional `reason` defaults to `"No reason provided"` and is attached to
  the ban for the audit log.
- The reply is ephemeral and includes the deleted-days detail only when
  non-zero, keeping the common case concise.
- `allowedMentions: { parse: [] }` prevents the quoted user tag from pinging.
- The command does not check whether the target is the guild owner; Discord
  rejects that through the API/hierarchy and the dispatcher reports the failure.
- No DM notification is sent to the banned user.
- A failed ban is not caught locally, so the dispatcher's generic error path
  handles it and the user does not see a success message.
- The `bannable` check is skipped for non-members, which is intentional: there
  is no member hierarchy to compare, and Discord will still reject an
  unauthorized ban.

## `src/commands/timeout.js`

**Purpose.** Applies a Discord communication timeout to a member for a number
of minutes, with an optional reason.

**Exports.** Default `{ data, execute }`; command name `timeout`.

**Interactions.** Imports `PermissionFlagsBits`/`SlashCommandBuilder`. Uses
`member.moderatable` and `member.timeout(ms, reason)`.

**Design decisions and notable details.**

- Permission is enforced by `setDefaultMemberPermissions(ModerateMembers)` and
  re-checked at runtime; DMs are disabled.
- `target` is a required user option but resolved with `getMember`, because
  timeouts only apply to guild members; a null member yields a clear ephemeral
  error.
- `minutes` is required and constrained to 1–40320, exactly Discord's 28-day
  maximum timeout duration.
- The duration is converted to milliseconds with `minutes * 60 * 1000` before
  calling `member.timeout`.
- Self-timeout is blocked explicitly.
- `member.moderatable` captures the bot's permission and role-hierarchy
  requirements; a false value produces an explanatory ephemeral error.
- The optional `reason` defaults to `"No reason provided"` and is recorded in
  the audit log.
- The confirmation is ephemeral, quotes the member tag, states the duration in
  minutes, and suppresses mentions.
- There is no subcommand to clear an existing timeout early; a moderator would
  have to use another tool or wait for expiry. This keeps the command simple.
- The timeout call is awaited before replying, so failures are reported by the
  dispatcher rather than as a false success.
- No cooldown override is declared; the global cooldown applies.
- Because Discord requires the member to be moderatable, the command does not
  attempt to fetch or escalate permissions.

## `src/commands/welcome-message.js`

**Purpose.** Configures the channel used by the join event for welcome embeds,
with `set`, `clear`, and `show` subcommands.

**Exports.** Default `{ data, execute }`; command name `welcome-message`.

**Interactions.** Imports `ChannelType`/`PermissionFlagsBits`/
`SlashCommandBuilder` and the `store` from `src/store.js`. The stored
`welcomeChannel` value drives `src/events/guildMemberAdd.js`.

**Design decisions and notable details.**

- The command uses subcommands instead of separate top-level commands, keeping
  related configuration under one discoverable name.
- `set` takes a required `channel` option restricted to `GuildText` and
  `GuildAnnouncement`, matching the channel types the event can send to.
- `clear` writes `null` rather than deleting the key, because the store has no
  delete API; consumers already treat falsy values as "disabled".
- `show` reads the current value and renders either a channel mention or
  instructions to run `set`, making the command self-documenting.
- Permission is enforced by `setDefaultMemberPermissions(ManageGuild)` and
  re-checked at runtime, so only administrators can change the configuration.
- DMs are disabled because settings are per guild and `interaction.guildId` is
  required for the store key.
- The command does not verify that the bot can send messages in the chosen
  channel; the join event catches and logs send failures instead of blocking
  configuration.
- Channel deletion or permission changes after `set` leave a stale ID; the join
  event handles this by fetching, checking `isTextBased`, and no-oping.
- Replies are ephemeral, keeping configuration chatter out of the channel.
- The channel option value is used by ID (`channel.id`), not by mention string,
  keeping the stored value stable across renames.
- There is no per-guild custom welcome text, embed color, or DM toggle; the
  message content is fixed in the event.
- Because `store.get` re-reads the file, `/welcome-message show` reflects the
  latest persisted value even if another process wrote it.

## `src/commands/remind.js`

**Purpose.** Schedules a one-off reminder message in the current channel after a
user-specified duration.

**Exports.** Default `{ data, execute }`; command name `remind`.

**Interactions.** Imports `SlashCommandBuilder` and
`MAX_DURATION_MS`/`formatMs`/`parseDuration` from `src/lib/duration.js`. Uses a
`setTimeout` timer that captures the interaction.

**Design decisions and notable details.**

- `duration` and `text` are both required; `text` is capped at 1000 characters
  to leave room for the reminder formatting within Discord's message limit.
- Durations are parsed by the shared helper, so the accepted syntax matches the
  documented `30s`, `10m`, `2h`, `1d`, `1w` forms and defaults to minutes.
- A falsy parsed value (including `0`) is treated as invalid; this is why the
  duration parser can keep zero rather than returning `null`.
- Durations longer than `MAX_DURATION_MS` (seven days) are rejected with an
  explicit message, keeping timers bounded and avoiding accidental year-long
  reminders.
- The confirmation computes `dueAt` as Unix seconds and renders a relative
  Discord timestamp plus a human duration, so the user sees both "in 10
  minutes" and the absolute moment.
- The confirmation is ephemeral; the actual reminder is sent to the channel, not
  as a DM, because the command captures `interaction.channel`.
- The timer callback explicitly checks `interaction.channel`; if it is
  unavailable it logs a warning and drops the reminder rather than sending into
  a deleted or inaccessible channel.
- The callback wraps the send in `try/catch` and logs failures, so a missing
  permission does not become an unhandled rejection.
- The reminder mentions the invoking user and uses
  `allowedMentions: { parse: ["users"] }`, allowing only the intended ping.
- `setTimeout(...).unref?.()` prevents a pending reminder from keeping the
  process alive, but also means reminders are lost on restart; there is no
  persistence or catch-up.
- There is no queue, deduplication, or per-user reminder limit beyond the global
  cooldown; many timers can exist simultaneously.
- The command does not defer and replies immediately, since scheduling is
  synchronous.
- `interaction.channel` may be null in edge cases (for example, if the channel
  is deleted or inaccessible); the explicit guard logs the event and drops the
  reminder, while the later optional chaining is a secondary defense.
- The timer is not stored, so it cannot be cancelled later; adding a cancel
  command would require a registry keyed by user/message.

## `src/commands/coinflip.js`

**Purpose.** Flips a fair coin and replies with Heads or Tails.

**Exports.** Default `{ data, execute }`; command name `coinflip`.

**Interactions.** Imports `SlashCommandBuilder` and `flipCoin` from
`src/lib/randomness.js`.

**Design decisions and notable details.**

- The command has no options, making it the simplest possible slash command and
  ideal as a smoke test for deployment.
- Randomness is delegated to the pure `flipCoin` helper, so the command contains
  no logic and the 50/50 boundary is tested in one place.
- The reply is a single formatted line with a 🪙 emoji and bold result, keeping
  it readable in both light and dark clients.
- No embed, buttons, or defer are used; the response is immediate and cheap.
- No permissions are required and DMs are allowed by default.
- No cooldown override is declared; the global cooldown prevents spam.
- There is no "best of N" or streak tracking; the command intentionally does one
  flip per invocation.
- The output is deterministic under a mocked `Math.random`, which the lib tests
  use to pin the extremes.
- Reply failures are handled by the dispatcher.
- The command name matches its file and is valid under Discord's name rules.
- Because the result is two fixed strings, localization would be a lib-level
  change rather than a command-level one.
- The helper is shared with tests but not with any other command, which is fine;
  keeping the pool and the flip together in `randomness.js` is more cohesive
  than a one-off util.

## `src/commands/dice.js`

**Purpose.** Rolls dice expressed in `NdN` notation (for example `2d6` or
`4d20`).

**Exports.** Default `{ data, execute }`; command name `dice`.

**Interactions.** Imports `MAX_DICE`, `MAX_SIDES`, `formatRollReply`,
`isNotationInRange`, `parseNotation`, and `rollDice` from `src/lib/dice.js`.

**Design decisions and notable details.**

- `notation` is required with a 20-character cap, enough for the largest
  supported expression and some malformed input that the parser will reject.
- The description embeds the current maxima from the shared constants, so the
  in-client help never drifts from the enforced limits.
- Parsing and range checks are separate, producing distinct error messages:
  "invalid notation" for shape problems and "out of range" for valid shapes
  outside 1–25 dice or 2–1000 sides.
- The parser intentionally accepts shapes like `0d6` and `1000d6`; the range
  check is what rejects them, which keeps the error messaging precise.
- The command uses the same roll and format helpers as `/roll`, so output is
  identical apart from how the arguments were supplied.
- No defer is needed; rolling is synchronous and bounded by the 25-die limit.
- The reply is plain text, matching `/roll` and avoiding embed overhead.
- `allowedMentions` is unnecessary because the output contains no user text.
- The command requires no permissions and works in DMs.
- There is no default notation; an omitted option is impossible because Discord
  enforces `setRequired(true)`.
- The command does not validate that `dice` and `sides` are safe integers beyond
  the range check; the regex only produces integer strings, and the range
  bounds keep the values small enough for array allocation.
- Reply errors are left to the dispatcher.

## `src/commands/define.js`

**Purpose.** Looks up an English word on dictionaryapi.dev and replies with an
embed of phonetics and up to three meanings.

**Exports.** Default `{ data, execute }`; command name `define`.

**Interactions.** Imports `EmbedBuilder`/`SlashCommandBuilder` and `COLORS`.
Calls the external `dictionaryapi.dev` v2 endpoint with the global `fetch`. No
stores or libs.

**Design decisions and notable details.**

- The word option is required, capped at 100 characters, and trimmed before
  being URL-encoded, so spaces and punctuation cannot break the request.
- The command defers immediately because the network lookup can exceed Discord's
  three-second initial-response window.
- Every fetch uses `AbortSignal.timeout(10_000)`, preventing a hung connection
  from leaving the interaction pending indefinitely.
- A `404` is treated as "no entry" with a user-friendly message; any other
  non-OK status throws and is caught as a service failure.
- The response shape is validated defensively: it must be a non-empty array,
  the first entry must be an object with a non-empty string `word`, and
  `meanings` must be an array.
- Phonetics are selected from `entry.phonetic` first, then the first
  `entry.phonetics` element with non-empty `text`; if neither exists, the
  description is omitted.
- Up to three meanings are rendered; each meaning contributes a field named by
  `partOfSpeech` (or `"Definition"`) with up to two numbered definitions.
- Malformed definitions are filtered out, and empty meanings contribute no
  field, so the embed never contains blank values.
- `truncate` enforces Discord embed limits: 256 for the title and field name,
  4096 for the description, and 1024 for field values, appending an ellipsis
  when cutting.
- The embed uses `COLORS.brand` and a 📖 prefix, matching the bot's visual
  identity.
- No results, malformed results, and empty meanings all return a plain-text
  "no definitions" edit instead of an empty embed.
- Network and non-OK errors are logged with the word context and reported as a
  generic service-unavailable message; no API key or rate-limit handling is
  needed because the service is public.
- The command does not cache lookups, so repeated words hit the API each time;
  this keeps behaviour fresh at the cost of extra requests.

## `src/commands/weather.js`

**Purpose.** Shows current weather for a city using the keyless open-meteo
geocoding and forecast APIs.

**Exports.** Default `{ data, execute }`; command name `weather`.

**Interactions.** Imports `EmbedBuilder`/`SlashCommandBuilder` and `COLORS`.
Performs two external `fetch` calls (geocoding, then forecast).

**Design decisions and notable details.**

- The city option is required and capped at 100 characters, then trimmed and
  URL-encoded for the geocoding query.
- The command defers because two sequential network calls can easily exceed the
  initial-response deadline.
- Both fetches use `AbortSignal.timeout(10_000)`; a slow or hung service cannot
  stall the interaction forever.
- Geocoding requests are limited to one result with `count=1`, English names,
  and JSON format, reducing payload size and ambiguity.
- The first geocoding result is validated for numeric `latitude` and
  `longitude`; missing results or non-numeric coordinates produce a friendly
  "couldn't find that city" message.
- The forecast request asks only for the needed `current` fields: temperature,
  apparent temperature, relative humidity, wind speed, and weather code,
  keeping the response small.
- `fmt` renders numeric finite values with a unit and falls back to `"N/A"` for
  null/non-numeric values, which open-meteo can return for unusual coordinates
  such as open ocean.
- The location line joins `name`, `admin1`, and `country`, filtering empties,
  and falls back to `"Unknown location"` if all are missing.
- WMO weather codes are mapped to human descriptions; unknown codes simply omit
  the description rather than showing a raw number.
- The embed includes temperature/feels-like, humidity, and wind as inline fields,
  plus a relative timestamp; it uses `COLORS.brand`.
- The API is metric by default, so units are °C and km/h; there is no unit
  option.
- Failures in either fetch are logged with the stage name and reported as a
  generic service error, never as a partial embed.
- No caching or rate limiting is implemented; each invocation performs two
  requests, which is acceptable for the public open-meteo service.

## `src/commands/serverstats.js`

**Purpose.** Displays a message-statistics embed: total tracked messages, number
of tracked channels, text-channel count, and a top-25 channel leaderboard.

**Exports.** Default `{ data, execute }`; command name `serverstats`.

**Interactions.** Imports `ChannelType`/`EmbedBuilder`/`SlashCommandBuilder`,
`COLORS`, and `topChannels`/`totalMessages`/`trackedChannelCount` from
`src/statsStore.js`.

**Design decisions and notable details.**

- The command is guild-only at runtime, returning an ephemeral error when
  `interaction.guild` is absent.
- `totalMessages(guild.id) === 0` is the empty-state signal; the command then
  replies with a prompt to send messages and check back later instead of
  rendering an empty embed.
- The leaderboard uses `topChannels(guild.id, 25)`, showing more entries than
  `/topchannels` (which shows 10) because the embed has room for them.
- Leaderboard lines are numbered (`1.`, `2.`, …) and render channels as
  mentions with bold counts, making the ranking scannable.
- `trackedChannelCount` reports channels with at least one recorded message,
  which can be smaller than the number of text channels.
- The text-channel count comes from `guild.channels.cache` filtered on
  `ChannelType.GuildText`; it is cache-based and excludes threads, forums,
  voice, and categories.
- The embed shows three inline aggregate fields (total messages, tracked-in,
  text channels) plus a timestamp, with `COLORS.brand`.
- The description is built from up to 25 lines; each line is short, but the
  command does not truncate the joined description, so a pathological set of
  very long channel IDs is still well within the 4096-character embed limit.
- Stats are read from the in-memory store, so they reflect messages seen since
  the process started (plus the last saved file), not a live Discord count.
- No permissions are required beyond being in a guild, and the reply is a normal
  channel message, not ephemeral.
- Reply failures propagate to the dispatcher.
- The command does not offer a time range or per-user breakdown; the store only
  tracks per-channel totals.

## `src/commands/topchannels.js`

**Purpose.** Shows a compact leaderboard of the ten most active channels in the
guild.

**Exports.** Default `{ data, execute }`; command name `topchannels`.

**Interactions.** Imports `SlashCommandBuilder` and `topChannels` from
`src/statsStore.js`.

**Design decisions and notable details.**

- Guild-only at runtime; DMs receive an ephemeral explanation.
- The limit is hard-coded to 10 to fit comfortably in a single plain-text
  message and match the helper's default.
- An empty result produces the same "No messages tracked yet" ephemeral prompt
  as `/serverstats`, giving users a consistent empty state.
- The first three places use 🥇/🥈/🥉 medals; later places use bold `#N` ranks,
  which makes the podium visually obvious.
- Channels are rendered as mentions (`<#id>`) and counts in bold, matching
  `/serverstats`'s formatting.
- The reply is plain text with a 🏆 header rather than an embed, keeping it
  lightweight and fast.
- Counts come from the in-memory stats store, so the leaderboard is a
  since-start cumulative tally, not a message-search result.
- No permissions are required and the reply is public in the channel.
- The command does not catch reply failures; the dispatcher handles them.
- There is no option to change the limit or timeframe; separate commands would
  be needed for that.
- The `topChannels` helper already sorts by descending count and ascending ID,
  so rendering order is deterministic and tie behavior is consistent.
- The command does not filter out deleted channels; a deleted channel still has
  its ID in the stats and will render as an unclickable mention until the data
  file is cleaned.

## `src/commands/repeat.js`

**Purpose.** Repeats user-provided text a small number of times, primarily as a
safe demonstration command.

**Exports.** Default `{ data, execute }`; command name `repeat`.

**Interactions.** Imports `SlashCommandBuilder` and
`MAX_REPEAT_LENGTH`/`MAX_REPEAT_TIMES`/`buildRepeat` from `src/lib/stats.js`.

**Design decisions and notable details.**

- `text` is required and capped at `MAX_REPEAT_LENGTH` (200) in the builder, and
  the helper re-validates the same limit for direct callers.
- `times` is optional, defaulting to 1, and constrained to 1–`MAX_REPEAT_TIMES`
  (5) in both the builder and the helper.
- Validation is delegated to `buildRepeat`, which returns a discriminated union;
  the command renders `⚠️ ${result.error}` ephemerally when invalid.
- Output is joined with newlines by the helper, preserving surrounding
  whitespace in each copy.
- `allowedMentions: { parse: [] }` prevents repeated text from pinging anyone,
  even though the text is user-supplied; this is the key safety measure.
- Markdown in the text is not escaped, allowing formatting but not mentions.
- The low repetition limit (5) and length limit (200) keep the output under
  Discord's 2000-character message limit even in the worst case (5 × 200 plus
  separators).
- The command does not defer; building and sending the string is synchronous.
- No permissions are required and DMs are allowed by default.
- The helper's exact error strings are asserted by tests, so they double as a
  user-facing contract.
- The command does not use an embed, keeping output copyable.
- Reply failures are handled by the dispatcher.

---

# Test files (`tests`)

The project uses Node's built-in test runner (`node --test tests/`) and
`node:assert/strict`; there is no Jest/Vitest dependency. Most tests import the
pure `src/lib` modules directly, and the cooldown tests import
`src/cooldowns.js`. `commandsShape.test.js` additionally imports discord.js and
every command module (plus their transitive store/lib imports) to verify
structure, but no client is created, no login occurs, and no network access is
made. Time and randomness are controlled by replacing `Date.now` and
`Math.random` with restoring `try/finally` blocks.

## `tests/index.js`

**Purpose.** Aggregator entry point that imports every test file, ensuring the
suite runs on Node versions that treat a directory argument as a single module
rather than scanning it for `*.test.js`.

**Exports.** None. The module is imported for its side effects: each imported
test module calls `test(...)` and registers cases with the runner.

**Interactions.** Imports all fourteen `*.test.js` files in the directory,
including `libTwenty.test.js`. It is
deliberately named `index.js`, not `*.test.js`, so runners that already scan the
directory do not load it twice.

**Design decisions and notable details.**

- The file contains only import statements; no logic, no exports, no custom
  runner configuration.
- Import order follows a stable grouping: command shape, cooldowns, dice,
  duration, extra lib families, randomness, and stats.
- The comment explains the Node-version compatibility problem that motivated
  the file, which is valuable because the indirection is otherwise surprising.
- Because imports are static, any syntax error in a test file fails the
  aggregator immediately, which is desirable for CI.
- If a single imported test file throws at module load, subsequent files are not
  registered; the files are written to fail only inside test callbacks, so this
  is an accepted trade-off.
- When the runner scans the directory itself, the individual `.test.js` files
  are picked up and `index.js` is ignored by the default glob, so there is no
  duplicate execution.
- The file does not re-export the runner or any test utilities; there are no
  shared helpers between test files.
- It does not import `src/config.js` or any module requiring environment
  variables, preserving the suite's ability to run without a `.env`.
- Running `node --test tests/index.js` executes the same set as
  `node --test tests/`, giving operators a deterministic fallback.
- The aggregator is intentionally trivial so it never becomes a place for
  hidden test setup or global mocks.
- All test files it imports are documented individually below.

## `tests/dice.test.js`

**Purpose.** Core contract tests for `src/lib/dice.js`: parsing, range checks,
rolling, and reply formatting.

**Exports.** None; registers nine `test(...)` cases as an import side effect.

**Interactions.** Imports `node:test`, `node:assert/strict`, and
`MAX_DICE`/`MAX_SIDES`/`formatRollReply`/`isNotationInRange`/`parseNotation`/
`rollDice` from `../src/lib/dice.js`.

**Design decisions and notable details.**

- "parseNotation accepts standard NdN notation" checks `2d6`, `4d20`, `1d1`, and
  the maximum `25d1000`, establishing that boundaries parse.
- A separate case verifies surrounding whitespace, including spaces, tabs, and
  newlines, so input from slash commands is tolerant.
- Case-insensitivity is tested with `2D6`; `2dD6` is asserted to be invalid,
  pinning the "single separator" rule.
- The rejection case enumerates twelve malformed inputs (`""`, `"d6"`, `"2d"`,
  `"2"`, negatives, floats, trailing characters, words, doubled `d`), serving
  as a compact specification.
- `isNotationInRange` tests both inclusive boundaries (`1,2` and `25,1000`) and
  each out-of-range direction (zero dice, too many dice, one side, too many
  sides).
- `rollDice` is run 100 times with seven dice to assert array length, integer
  faces, `1..6` bounds, and total consistency, catching distribution-shape
  regressions without relying on exact rolls.
- A 5000-roll d2 experiment asserts both faces appear, detecting a constant or
  off-by-one roller while remaining overwhelmingly unlikely to flake.
- Zero dice is pinned to `{ rolls: [], total: 0 }`, documenting the primitive's
  behaviour even though commands cannot request it.
- `formatRollReply` assertions cover the multi-die total suffix and the
  single-die omission, including the emoji and bold notation.
- The tests use `assert.deepEqual` for object results and `assert.equal` for
  primitives, keeping failure output precise.
- No `Math.random` mocking is used here; this file checks properties rather than
  exact sequences, leaving determinism tests to later files.

## `tests/diceMore.test.js`

**Purpose.** Additional dice-parser edge cases and primitive behaviour that
complement the core `dice.test.js` file.

**Exports.** None; registers thirteen `test(...)` cases.

**Interactions.** Imports the same six exports from `../src/lib/dice.js`.

**Design decisions and notable details.**

- `"0d6"` is asserted to parse but fail the range check, documenting the
  deliberate separation between shape and bounds.
- A huge count (`"1000d6"`) is asserted to parse and fail range validation,
  including a direct check against `MAX_DICE + 1`.
- The `d20` shorthand is rejected in both lower and upper case, pinning the
  "count is mandatory" rule.
- `"6d2"` verifies that the two Ns are independent (dice count and sides), not
  ordered or constrained relative to each other.
- Leading zeros (`"0002d06"`, `"01d0999"`) are shown to parse as ordinary
  decimal because `Number` normalizes them.
- Signed counts (`"+2d6"`, Unicode minus) are rejected, and internal whitespace
  (`"2 d6"`, `"2d 6"`) is rejected, complementing the outer-whitespace tests.
- A 20-digit count is asserted to parse to `100000000000000000000` and fail the
  range check, documenting precision behaviour for oversized input.
- Non-ASCII lookalike separators (`"2ᴅ6"`, `"2dー6"`) and other separators
  (`-`, `/`) are rejected, preventing homoglyph bypasses.
- `rollDice(1000, 6)` deliberately exceeds `MAX_DICE` to prove the primitive
  does not enforce command-level limits, and checks length, bounds, and total.
- `rollDice(0, 1000)` confirms zero dice is valid for any sides value.
- `formatRollReply` with `MAX_SIDES` checks that large numbers do not change the
  message shape (no separators or scientific notation).
- The file demonstrates that range policy belongs to commands, not the roller,
  which is an architectural boundary the tests make explicit.

## `tests/duration.test.js`

**Purpose.** Core contract tests for `src/lib/duration.js`: unit parsing,
defaults, case handling, rejection, and coarse formatting.

**Exports.** None; registers seven `test(...)` cases.

**Interactions.** Imports `MAX_DURATION_MS`/`formatMs`/`parseDuration` from
`../src/lib/duration.js`.

**Design decisions and notable details.**

- Every documented unit is checked (`30s`, `10m`, `2h`, `1d`, `1w`) with exact
  millisecond expectations, so the unit table cannot silently drift.
- Bare numbers are asserted to mean minutes (`5` → 300000, `90` → 5400000),
  matching the command description.
- Case-insensitivity and inner spacing are covered (`30S`, `2H`, `1 W`,
  surrounding spaces), pinning the regex's tolerance.
- A rejection case enumerates blank, word, unit-only, trailing-unit,
  double-unit, negative, float, and multi-token inputs.
- Zero is explicitly documented as parsing to `0` and being falsy, with a
  comment explaining that the command rejects it downstream.
- `MAX_DURATION_MS` is asserted to equal exactly seven days and to equal
  `parseDuration("7d")`, linking the constant to the grammar.
- `formatMs` is tested at day, multi-day, hour, minute, and a 61-minute value,
  confirming it never combines units and never promotes 61 minutes to hours.
- The tests avoid a real clock entirely; durations are pure arithmetic.
- Exact equality is used rather than ranges because the grammar produces exact
  integers.
- The file establishes that parsing beyond the maximum is allowed (the limit is
  a command concern), leaving that behaviour to `durationMore.test.js`.
- No environment or Discord imports are involved, so the file runs anywhere.

## `tests/durationMore.test.js`

**Purpose.** Edge-case coverage for duration parsing and formatting beyond the
core unit table, especially rejection and rounding boundaries.

**Exports.** None; registers twelve `test(...)` cases.

**Interactions.** Imports `MAX_DURATION_MS`/`formatMs`/`parseDuration` from
`../src/lib/duration.js`.

**Design decisions and notable details.**

- Combined units (`1h30m`, `1d12h`, `1h30`) are rejected, fixing the
  single-component grammar.
- All zero variants (`0h`, `0d`, `0w`, `00`) are asserted to be `0`, and at
  least one is checked to be falsy, reinforcing the command's downstream rule.
- Negative durations are rejected, including a Unicode minus, preventing
  locale-specific bypasses.
- Floats in every position (`0.5m`, `1.5h`, `2.d`, `.5s`) are rejected, showing
  the grammar is integer-only.
- Scientific notation (`1e2`, `1E2m`) is rejected, which also prevents large
  exponential values from slipping past the length check.
- A space before the unit is accepted (`5 m`, `2 H`), extending the
  tolerance tests to more separator positions.
- Uppercase `M` and `W` are pinned to minutes and weeks respectively, avoiding
  the common "M means month" ambiguity.
- Leading zeros are preserved as decimal (`007m`, `000s`), complementing the
  dice parser's leading-zero tests.
- Durations beyond `MAX_DURATION_MS` (`365d`) are shown to parse successfully,
  proving the parser does not clamp.
- Doubled and stray units (`5mm`, `5s s`, `hh`) are rejected, covering
  malformed suffixes.
- `formatMs(0)` is pinned to `"0 day(s)"`, an odd but intentional consequence
  of the divisibility order.
- Rounding cases (`59999ms` → one minute, `1ms` → zero days) document the
  round-first-then-divide behaviour and its boundary effects.

## `tests/cooldowns.test.js`

**Purpose.** Behavioural tests for the in-memory cooldown module, including
expiry, per-user/per-command isolation, disabling, reset, and rounding.

**Exports.** None; registers eight `test(...)` cases plus a local
`withFakeClock` helper.

**Interactions.** Imports `node:test`, `node:assert/strict`, and
`checkCooldown`/`resetCooldown` from `../src/cooldowns.js`.

**Design decisions and notable details.**

- `withFakeClock(ms, run)` replaces `Date.now` with a controllable clock,
  exposes `advance`/`get`, and restores the original in a `finally` block so a
  failing assertion cannot leak a fake clock into other tests.
- Clock values start at `1_000_000` rather than zero, avoiding false positives
  from initializing an expiry map to `0`.
- The first test confirms separate users are independent within the same
  command bucket window.
- The second confirms a second call inside the window is blocked and returns a
  remaining value between 1 and 2 for a 3-second window.
- The per-user/per-command test checks four combinations (two users, two
  commands) and verifies only the actually reused bucket is blocked.
- Expiry is tested immediately before (`4999ms`) and after (`5001ms`) a
  5-second window, pinning the inclusive/exclusive boundary.
- Zero and negative cooldowns are shown to disable throttling, as are `NaN`,
  `+Infinity`, and `-Infinity`.
- `resetCooldown` is verified to clear an active bucket so the next check
  returns `0`.
- The final test checks `Math.ceil`-style rounding: 2.9 seconds elapsed in a
  3-second window reports exactly `1` second remaining.
- The tests do not sleep or use real timers, keeping the suite fast and
  deterministic.
- Because the module's map is shared across tests, each case uses unique user
  IDs (`user-a` … `user-i`) to avoid inter-test coupling.

## `tests/randomness.test.js`

**Purpose.** Tests the coin flip and Magic 8-Ball helpers, including their
domains, diversity, and rough balance.

**Exports.** None; registers seven `test(...)` cases.

**Interactions.** Imports `EIGHT_BALL_RESPONSES`/`flipCoin`/`pick8BallResponse`
from `../src/lib/randomness.js` and `rollDice` from `../src/lib/dice.js`.

**Design decisions and notable details.**

- A 2000-flip domain test asserts every result is exactly `"Heads"` or
  `"Tails"`, catching stray values or capitalization drift.
- A 5000-flip set test asserts both outcomes occur, detecting a constant
  implementation.
- A 20,000-flip balance test asserts the heads share is strictly between 0.45
  and 0.55; the wide band makes flakiness effectively impossible while still
  catching a badly biased coin.
- `pick8BallResponse` is checked 2000 times against membership in the exported
  pool, ensuring the function never synthesizes an answer.
- The pool is asserted to contain exactly 20 unique strings, pinning the data
  set's size and avoiding duplicates.
- A 5000-call diversity test asserts more than ten distinct answers are seen,
  catching an implementation that always indexes a small prefix.
- The file also checks `rollDice(10, 20)` shape, bounds, and total consistency,
  linking randomness primitives used by different commands.
- Tests rely on probability rather than mocking, so they exercise the real
  `Math.random` path; the chosen trial counts make false failures negligible.
- The upper-bound checks account for the inclusive range (`total <= 200` for
  10d20).
- No timing or ordering assertions are made, since randomness is not required to
  be reproducible.
- The file documents that "fair" is asserted statistically, not
  cryptographically.

## `tests/stats.test.js`

**Purpose.** Contract tests for `src/lib/stats.js`: counting, leaderboard
sorting/limits, totals, and repeat validation/building.

**Exports.** None; registers twelve `test(...)` cases.

**Interactions.** Imports the seven exports of `../src/lib/stats.js`.

**Design decisions and notable details.**

- `recordMessage` is tested for first increment, repeated increment on the same
  channel, and independence of a second channel, including the returned count
  and the final object shape.
- `topChannels` sorting is tested with a mix of counts and a deliberate tie,
  asserting descending counts and ascending channel-ID tie breaks.
- Limits are tested at a normal value and at zero; a separate case asserts a
  negative limit is treated as zero.
- An empty counts object is asserted to produce an empty array, covering the
  empty state used by the commands.
- `totalMessages` is tested with two channels and with an empty object, pinning
  the additive identity.
- `validateRepeat` acceptance covers a normal string, the maximum repeat count,
  and text at exactly the maximum length.
- Empty and whitespace-only text are both rejected, matching the helper's
  `trim()` check.
- Over-length text is rejected with an error matched against `/max 200/`,
  ensuring the user-facing message includes the limit.
- Out-of-range repeat counts cover `0`, negative, above-maximum, fractional, and
  `undefined`, with the above-maximum message matched against `/at most 5/`.
- `buildRepeat` joining is tested for three repetitions and a single
  repetition, confirming newline separation and no trailing newline.
- The error-forwarding test uses `assert.deepEqual` against
  `validateRepeat("", 2)`, proving `buildRepeat` returns the exact validation
  object rather than reshaping it.
- The file deliberately tests only the pure helper, not `statsStore`, avoiding
  filesystem side effects.

## `tests/commandsShape.test.js`

**Purpose.** Structural/contract test that every file in `src/commands` exports
a valid slash command and that its name matches the filename.

**Exports.** None; registers one aggregate guard test plus one dynamically
generated test per command file (22 total for the current 21 commands).

**Interactions.** Imports `node:fs`, `node:path`, `node:url`, discord.js's
`SlashCommandBuilder`, and dynamically imports every command module. It
re-implements the recursive file collection rather than importing
`src/loadCommands.js`, keeping the test independent of the loader.

**Design decisions and notable details.**

- Files are collected recursively and sorted, so test output and failure order
  are deterministic.
- A guard test asserts at least one command file exists, preventing the
  per-file loop from silently passing on an empty directory.
- Each command is imported with `pathToFileURL`, which is required for ESM on
  all platforms.
- The default export is asserted to be a non-null object, catching missing or
  misnamed default exports.
- `data` is asserted to be an actual `SlashCommandBuilder` instance (not just a
  lookalike object), ensuring `deploy.js` can call `toJSON`.
- `data.name` and `data.description` must be non-empty strings after trimming.
- `execute` must be a function; this is the same runtime requirement the loader
  checks.
- `data.toJSON()` is asserted to preserve the name and description, tightening
  the link between builder metadata and API payload.
- The name is matched against `/^[-_a-z0-9]{1,32}$/`, Discord's valid command
  name character set and length limit.
- The description is checked to be at most 100 characters, Discord's maximum.
- The command name must equal the filename without `.js`, enforcing the
  one-file-one-command convention used by the loader and docs.
- No client login or network access is required; the test does import every
  command module (and thus their transitive store modules, which may read data
  files), but it never constructs a client or opens a gateway connection.

## `tests/libMore.test.js`

**Purpose.** Broad supplementary coverage across all four lib modules with an
emphasis on boundary values and formatting details.

**Exports.** None; registers twenty-three `test(...)` cases.

**Interactions.** Imports the full public surface of `../src/lib/dice.js`,
`../src/lib/duration.js`, `../src/lib/randomness.js`, and
`../src/lib/stats.js`.

**Design decisions and notable details.**

- One-sided dice (`rollDice(3, 1)`) are pinned to all ones, testing the lower
  edge of the random formula.
- Five-dice totals are checked over 200 trials for both theoretical bounds and
  sum consistency.
- `formatRollReply(1, 6, [4], 100)` verifies the total argument is ignored for
  single-die rolls, not merely that it is usually omitted.
- Multi-roll formatting is checked for comma-space separation.
- `isNotationInRange` accepts both remaining boundary corners (`1, MAX_SIDES`
  and `MAX_DICE, 2`).
- Dice parsing rejects surrounding words and internal spaces, complementing the
  outer-whitespace acceptance tests.
- Duration parsing tolerates tabs and newlines both around and inside the
  duration (`"5\tm"`, `"2\nh"`), which is broader than the core tests.
- Every unit is re-checked with the value `3`, independently verifying the
  millisecond table.
- Two weeks is asserted to exceed the seven-day maximum while `7d` equals it.
- Formatting tests cover rounding (`89999` → 1 minute, `90000` → 2 minutes),
  59 minutes staying minutes, 25 hours staying hours, and 48 hours becoming
  two days.
- The 8-ball pool is checked for non-empty strings, and the picker is checked
  for pool membership.
- `recordMessage` is shown to mutate the original object, `topChannels`
  defaults to ten and breaks ties ascending, and `totalMessages` sums many
  channels including zeros.
- Repeat tests preserve surrounding whitespace, accept exact limits, and reject
  `NaN`/`Infinity`/fractional counts.

## `tests/libEdge.test.js`

**Purpose.** Edge-case and error-path coverage for the four lib modules, focused
on rejection and exact boundary behaviour.

**Exports.** None; registers thirty `test(...)` cases.

**Interactions.** Imports dice, duration, randomness, and stats exports from
`../src/lib/*`; does not import any runtime service.

**Design decisions and notable details.**

- Dice parsing is re-checked for case-insensitivity, surrounding whitespace, and
  empty/whitespace-only rejection.
- Decimal, signed, and combined forms (`1.5d6`, `-1d6`, `+1d6`, `2d6+1`) are all
  rejected in one case, pinning the "no modifiers" rule.
- Out-of-range parses (`0d6`) are explicitly retained for the range check to
  reject, documenting the two-stage pipeline.
- Range tests cover low/high side counts and dice above the maximum.
- `rollDice` is checked for exact count, face bounds on a 20d12 roll, and the
  zero-dice shape.
- Both formatting branches are covered (single die omits total, multiple dice
  include it).
- Duration tests cover bare numbers (including `0`), uppercase units, combined
  units, negatives/floats, and blank input.
- `formatMs` boundaries include zero (`0 day(s)`), sub-minute rounding, whole
  hours, and whole days up to seven.
- The 8-ball pool is asserted to have twenty unique answers, all ending with a
  period, and each longer than one character.
- `topChannels` covers a zero limit, a limit above the entry count, and an empty
  map, while `totalMessages` covers an empty map.
- Repeat validation covers whitespace-only text, counts below one, exact limits,
  and the forwarded too-many-repetitions error from `buildRepeat`.
- `buildRepeat("x", 1)` is pinned to a single unchanged copy.

## `tests/libExtra.test.js`

**Purpose.** Additional type-level, equivalence, and canonical-data tests for
the lib modules.

**Exports.** None; registers twenty `test(...)` cases.

**Interactions.** Imports dice, duration, randomness, and stats exports from
`../src/lib/*`.

**Design decisions and notable details.**

- Parsed notation fields are asserted to be numbers (not numeric strings),
  protecting arithmetic in `rollDice`.
- Range validation rejects negative dice and sides and accepts the maximum
  combination.
- One-sided dice roll a one; maximum-bound `rollDice(MAX_DICE, MAX_SIDES)`
  checks count, bounds, and total.
- A 100-trial single-die test asserts total equals the sole roll.
- `formatRollReply(0, 6, [], 0)` is pinned to a trailing-label string, an
  intentional edge case.
- The bold NdN notation is checked as a substring for two examples.
- Duration equivalence tests (`1h == 60m`, `2h == 120m`, `7d == 1w`) verify the
  unit table's arithmetic relationships rather than isolated values.
- `"7200s"` and `"10080m"` are checked against exact millisecond values, and
  `"10_080m"` is rejected because numeric separators are not part of the
  grammar.
- Formatting checks include the seven-day maximum, 73 hours staying hours, and
  45 minutes staying minutes.
- The 8-ball canonical first/last answers are pinned, and every answer is
  checked for no newlines and an uppercase first character.
- `recordMessage` is tested for three-channel independence; `topChannels` is
  asserted not to mutate its input; `totalMessages` is compared with the sum of
  `topChannels` counts.
- All four exact `validateRepeat` error strings are asserted, and non-string
  repeat counts are rejected.
- `buildRepeat("ab", 4)` is checked to contain exactly three newline
  separators.

## `tests/libAdditional.test.js`

**Purpose.** Extra edge coverage for parsing, randomness determinism, duration
boundaries, and stats limits.

**Exports.** None; registers twenty `test(...)` cases.

**Interactions.** Imports the public exports of the four `../src/lib/*` modules.

**Design decisions and notable details.**

- Dice notation containing line breaks is rejected, tightening the
  internal-whitespace rule.
- Range validation is checked at both accepted corners and at just-outside
  fractional values (`MAX_DICE + 0.5`, `MAX_SIDES + 0.5`).
- `rollDice` is asserted to return a fresh array each call, catching accidental
  reuse of a module-level array.
- `Math.random` is patched to `0` to verify every die maps to 1, and to
  `0.999999` to verify every die maps to `sides`; both patches restore the
  original in `finally`.
- Duration parsing checks one second and one minute exactly, plus a space before
  day/week units.
- Unit-only inputs (`" s"`, `"d"`, `"w"`) are rejected, complementing the
  number-only rejection cases.
- `formatMs` checks a whole hour, 1439 minutes staying minutes, and 1440/2880
  minutes becoming days, pinning the promotion thresholds.
- `flipCoin` is asserted to return a primitive string.
- The 8-ball picker is checked for trailing periods, representative answers,
  and no leading/trailing whitespace.
- `recordMessage` is checked both for a brand-new channel and for incrementing
  an existing stored count.
- `topChannels` is shown to floor a fractional limit (2.9 → 2 entries).
- `buildRepeat` at the maximum is checked for exactly `MAX_REPEAT_TIMES - 1`
  newline separators.

## `tests/libFinal.test.js`

**Purpose.** Final defensive coverage: non-string inputs, homoglyphs, controlled
random sequences, unusual limits, and the remaining documented edge cases.

**Exports.** None; registers twenty `test(...)` cases.

**Interactions.** Imports dice, duration, randomness, and stats exports from
`../src/lib/*`.

**Design decisions and notable details.**

- `parseNotation` is called with numbers, `null`, `undefined`, objects, and
  arrays, all expected to return `null` rather than throwing.
- Non-ASCII digit lookalikes (`"٢d٦"`, `"2d６"`) are rejected, extending the
  homoglyph defense beyond separators.
- Trailing tabs and newlines around notation are accepted, matching the
  `trim()`-based tolerance.
- Range checks reject values only barely above each maximum
  (`MAX_DICE + 0.0001`, `MAX_SIDES + 0.0001`), pinning strict comparison.
- `Math.random` is instrumented to count calls: exactly once per die and zero
  times for zero dice, proving the implementation does not preallocate
  randomness.
- A scripted `Math.random` sequence (`0`, `0.999`, `0.5`) is asserted to map to
  rolls `[1, 2, 2]`, verifying order-of-consumption and boundary mapping.
- Both formatting branches are re-checked for a two-die and a one-die roll.
- `parseDuration` is called with non-string inputs and expected to return
  `null`.
- Unsupported units (`1y`, `1mo`, `1ms`) are rejected, while `"1M "` is pinned
  to 60 seconds' worth of minutes, confirming `M` means minutes.
- A tab between the number and week unit is accepted.
- `formatMs` is checked never to combine days with leftover minutes (1441
  minutes stays minutes; 90 minutes stays minutes) and to round just past a day
  boundary to `10081 minute(s)`.
- 8-ball and coin-flip extremes are pinned by mocking `Math.random` to `0`,
  `0.499999`, `0.5`, and `0.999999`, including the midpoint belonging to Tails.
- A stored count of zero is shown to restart at one, and `totalMessages` is
  shown to sum negative values arithmetically.
- `topChannels` is tested with an infinite limit (returns all, sorted) and a
  `NaN` limit (returns none), covering the `slice` coercion behaviour.
- `validateRepeat` rejects non-string text and boolean counts, and
  `buildRepeat` at the maximum produces exactly `MAX_REPEAT_TIMES` copies.

## `tests/libTwenty.test.js`

**Purpose.** A final supplementary lib suite that pins exported constants,
additional parser boundaries, controlled randomness mappings, and stats
edge cases not already covered by the earlier files.

**Exports.** None; registers twenty `test(...)` cases.

**Interactions.** Imports the public exports of `../src/lib/dice.js`,
`../src/lib/duration.js`, `../src/lib/randomness.js`, and
`../src/lib/stats.js`; it is imported by `tests/index.js`.

**Design decisions and notable details.**

- The dice limit constants are asserted literally (`MAX_DICE === 25`,
  `MAX_SIDES === 1000`), catching accidental changes to the user-facing maxima
  even if the parser and range logic stay mutually consistent.
- Three-digit notation (`123d456`) is shown to parse correctly, extending the
  numeric-width coverage beyond one- and two-digit examples.
- Range checks are re-pinned at the minimum side count (2) and at maximum dice
  with minimum sides, covering corners not emphasized in the other files.
- `rollDice(MAX_DICE, 2)` checks the largest permitted die count against the
  smallest permitted face count, including exact face membership and total
  consistency.
- `formatRollReply(2, 6, [0, 0], 0)` pins zero-valued faces and a zero total for
  a multi-die roll, proving formatting does not special-case falsy numbers.
- Duration parsing is checked with a leading-zero unit value (`"007s"`), a
  newline before the unit (`"2\nh"`), a combined duration (`"1 h 30m"`), and a
  leading plus sign (`"+5m"`), extending the grammar boundary matrix.
- `formatMs` is checked at exactly one hour and at a sub-minute value that
  rounds to zero and therefore lands in the days branch (`"0 day(s)"`).
- `pick8BallResponse` is pinned at `Math.random() === 0.5` to the eleventh
  answer (`EIGHT_BALL_RESPONSES[10]`), tightening the index mapping beyond the
  extremes tested elsewhere.
- `flipCoin` is pinned at quarter and three-quarter randoms to Heads and Tails
  respectively, confirming the threshold is exactly 0.5 rather than an
  approximate midpoint.
- The repeat constants are asserted literally (`MAX_REPEAT_TIMES === 5`,
  `MAX_REPEAT_LENGTH === 200`), complementing the dice constant checks.
- `recordMessage` is exercised three times on one channel, asserting each
  returned count and the final stored object.
- `topChannels` tie-breaking is re-checked with keys deliberately out of
  alphabetical insertion order (`z`, `a`, `m`) to prove sorting, not insertion
  order, determines output.
- `totalMessages` is tested with an object that inherits a numeric property
  (`Object.create({ inherited: 100 })`), proving `Object.values` counts only
  own enumerable channels.
- `validateRepeat` rejects whitespace containing newlines and tabs with the
  exact "Text cannot be empty." error, and `buildRepeat` forwards the
  below-minimum repeat error for `0`.
- The file follows the suite's pattern of using unique object literals per test
  and never touching the real clock or filesystem.
- Its tests are intentionally redundant in places with `libFinal.test.js`; the
  redundancy guards high-value constants and boundary mappings against
  regressions in refactors.

---

# Cross-cutting design decisions

- **Pure core, thin shell.** All logic that can be tested without Discord lives
  in `src/lib` or the store modules. Commands and events are adapters over those
  functions, which is why the test suite can cover most behaviour without a
  gateway connection or mocking library.
- **Fail soft on user input, fail fast on configuration.** Parsers return
  `null`/`false`/result objects for bad input, while `config.js` exits the
  process when required environment variables are missing.
- **Ephemeral errors, public results.** Validation and permission errors are
  ephemeral so they do not clutter channels; successful command outputs are
  usually public, except moderation confirmations.
- **Mention suppression.** Every command that echoes user-controlled text
  either sets `allowedMentions: { parse: [] }` or explicitly permits only the
  intended user mention (`/remind`). This is the primary injection defense.
- **Bounded inputs everywhere.** Dice (25 × 1000), repeat (5 × 200), clear
  (100), timeout (28 days), reminders (7 days), poll options (10), and embed
  fields (truncated) are all capped to keep outputs within Discord limits and
  prevent abuse.
- **Two persistence strategies.** Settings are read fresh on every access for
  immediacy; stats are cached in memory and flushed periodically for throughput.
  Both use atomic temp-file writes.
- **No global error boundary beyond the dispatcher.** Event handlers and timers
  catch their own failures; command failures are centralized in
  `interactionCreate`.
- **No hot reload, no graceful shutdown, no clustering.** The architecture
  assumes a single long-running process managed by an external supervisor.
- **Tests replace only `Date.now` and `Math.random`.** There are no fake timers,
  no network mocks, and no discord.js client mocks; the untested layers are
  exactly the thin adapters that require a live Discord connection.

# Known limitations and future work

- Stats can lose up to five minutes of counts on an abrupt shutdown; adding a
  `SIGINT`/`SIGTERM` handler that calls `save()` would narrow the window.
- Reminders are in-memory timers and are lost on restart; persisting them would
  require a store and a startup reload path.
- Cooldowns are per-process and reset on restart; a shared store would be
  needed for multi-instance deployments.
- `/define` and `/weather` have no caching or rate-limit handling; repeated use
  makes duplicate outbound requests.
- Deleted channels remain in the stats file until normalization drops them (and
  normalization only runs on load/save, not when a channel is deleted).
- The settings store has no delete API, so cleared values are stored as `null`;
  a schema version and migration path are absent.
- There is no per-guild command enable/disable, localization, or configurable
  welcome text.
- `COLORS.error` is currently unused; error UI is text-based.
- `statsStore.startAutoSave` does not guard against multiple invocations; the
  current `once: true` ready wiring makes that safe but the API is not
  idempotent.
- Command deployment is a manual step; a CI hook could run `npm run deploy` on
  schema changes to avoid stale-command errors.

