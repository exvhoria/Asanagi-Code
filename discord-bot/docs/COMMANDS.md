# Slash command reference

Complete reference for every slash command registered by **bot-stress** (21
commands). Each command has its own section containing its description, usage
syntax, full options table, three example invocations, edge cases, and the
permission requirements on both the invoking member and the bot.

The bot is built on discord.js v14 (ESM, Node.js 18+). Commands live in
`src/commands/**` and are loaded recursively by `src/loadCommands.js`; they are
pushed to Discord by `npm run deploy` (`src/deploy.js`).

---

## How to read this document

### Syntax notation

| Notation | Meaning |
| --- | --- |
| `/command` | The slash command name as typed in Discord. |
| `<option>` | A **required** option. Omitting it is rejected by Discord. |
| `[option]` | An **optional** option. |
| `<a / b / c>` | Exactly one of the listed values. |
| `<option>...` | The option accepts multiple values or repeated text. |
| `target:<user>` | A Discord option of type *user* (accepts a mention, ID, or picker selection). |
| `text:<string>` | A Discord option of type *string*. |
| `amount:<integer>` | A Discord option of type *integer*. |

These are Discord application-command options, not shell arguments: they are
selected in the Discord UI, not written as a literal command line string.

### Response visibility

- **Public** — visible to everyone who can read the channel.
- **Ephemeral** — visible only to the invoker.
- Commands that reply publicly usually return validation errors ephemerally.
  Commands that call `deferReply()` (without `ephemeral: true`) make *all*
  follow-up edits, including error messages, public.

### Global behavior that applies to every command

These rules come from `src/events/interactionCreate.js`, `src/cooldowns.js`,
`src/deploy.js`, and `src/config.js`.

1. **Cooldowns** — every command has a per-user, per-command cooldown. The
   default is **3 seconds**, configured with `COMMAND_COOLDOWN_SECONDS` in
   `.env` (`0` disables cooldowns). A command module can override the default
   by exporting `cooldown: <seconds>`; none of the current commands do.
   A blocked invocation receives the ephemeral message
   "⏳ `/name` is on cooldown — try again in **Ns**."
   The cooldown timer starts *before* `execute()` runs, so a command that
   fails still consumes its cooldown window. Buckets are in memory only and
   reset when the bot restarts. They are pruned opportunistically after
   5,000 entries.
2. **Error handling** — `execute()` is wrapped in a try/catch. An uncaught
   error is logged to the console and the invoker receives an ephemeral
   `⚠️ Something went wrong while running that command. Please try again later.`
   (sent as a reply, or as a follow-up if the interaction was already deferred
   or replied).
3. **Unknown command** — if Discord invokes a command the bot did not load,
   the invoker gets
   "⚠️ That command isn't registered. Run `npm run deploy` to refresh."
   (ephemeral) and a warning is logged.
4. **Registration and scope** — `npm run deploy` registers every loaded
   command. With `GUILD_ID` set, commands are registered **only in that guild**
   and are unavailable in DMs and other guilds. Without `GUILD_ID`, they are
   registered globally and can take up to about an hour to propagate.
5. **Permission model** — commands that declare
   `setDefaultMemberPermissions(...)` are hidden from members who lack that
   permission **by default**; server admins can override this under Server
   Settings → Integrations. Those commands also re-check the permission at
   runtime. Commands without either mechanism are available to everyone.
6. **Bot permissions** — unless a command says otherwise, the bot needs
   **View Channel**, **Send Messages**, and **Embed Links** (for embed
   replies) in the channel where the command is used. Moderation commands need
   the matching moderator-side permission, and `/poll` needs
   **Add Reactions**.
7. **Guild-only commands** — "Guild only" means the command refuses to run
   outside a guild. Some commands do this explicitly at runtime and reply
   `This command only works in a server.`; others also declare
   `setDMPermission(false)`.
8. **DMs** — whether a non-guild-only command works in DMs also depends on
   registration scope. A globally registered command is usable in DMs if its
   logic does not require a guild; a guild-scoped deployment is not.
9. **Message content limits** — Discord limits a bot message to 2,000
   characters and an embed description/field value to 1,024 characters. All
   current commands stay within those limits by construction (see individual
   edge cases).
10. **Localization and mentions** — every response is English-only and
    user-provided text is echoed without escaping or sanitization where noted.

---

## Command index

| Command | Category | Guild only | Member permission | Main bot permissions | Success reply |
| --- | --- | --- | --- | --- | --- |
| `/help` | Info | No | — | Send Messages, Embed Links | Public |
| `/ping` | Info | No | — | Send Messages | Public |
| `/userinfo` | Info | No | — | Send Messages, Embed Links | Public |
| `/serverinfo` | Info | Yes (runtime) | — | Send Messages, Embed Links | Public |
| `/serverstats` | Info | Yes (runtime) | — | Send Messages, Embed Links | Public |
| `/topchannels` | Info | Yes (runtime) | — | Send Messages | Public |
| `/avatar` | Fun | No | — | Send Messages, Embed Links | Public |
| `/8ball` | Fun | No | — | Send Messages | Public |
| `/coinflip` | Fun | No | — | Send Messages | Public |
| `/dice` | Fun | No | — | Send Messages | Public |
| `/roll` | Fun | No | — | Send Messages | Public |
| `/define` | Utility | No | — | Send Messages, Embed Links | Public |
| `/weather` | Utility | No | — | Send Messages, Embed Links | Public |
| `/poll` | Utility | No | — | Send Messages, Add Reactions | Public |
| `/repeat` | Fun | No | — | Send Messages | Public |
| `/remind` | Utility | No | — | Send Messages | Mixed |
| `/clear` | Moderation | Yes | Manage Messages | Manage Messages, Read Message History | Ephemeral |
| `/kick` | Moderation | Yes | Kick Members | Kick Members | Ephemeral |
| `/ban` | Moderation | Yes | Ban Members | Ban Members, Manage Messages (when deleting) | Ephemeral |
| `/timeout` | Moderation | Yes | Moderate Members | Moderate Members | Ephemeral |
| `/welcome-message` | Configuration | Yes | Manage Server | Manage Server, Send Messages / Embed Links in the target channel | Ephemeral |

---

## /help

### Description

Lists every command the bot currently has loaded, sorted alphabetically by
command name. When the list fits in one embed it is sent directly; when it does
not, the command renders paginated embeds with **◀ Previous** and **Next ▶**
buttons and lets only the invoker page through them.

- Source: `src/commands/help.js`
- Cooldown: default (3 s unless configured otherwise)
- Response: public embed; validation errors and navigation rejections are
  ephemeral

### Usage syntax

```
/help
```

### Options

| Option | Type | Required | Constraints | Default | Description |
| --- | --- | --- | --- | --- | --- |
| — | — | — | — | — | This command takes no options. |

### Behavior

- Reads `interaction.client.commands`, sorts by `data.name` using
  `String.prototype.localeCompare`, and formats each entry as
  `**/name** — description`.
- `PAGE_SIZE` is **25** commands per page.
- One page: sends a single embed titled `📖 Commands` with the brand color and
  no components.
- Multiple pages: sends page 1 with two `ButtonStyle.Primary` buttons
  (`help_prev`, `help_next`) and a footer
  `Page X/Y • N commands`. The collector listens for button interactions on
  that message for **120,000 ms (2 minutes)**.
- The Previous button is disabled on page 1 and Next on the last page.
- Any button press from a user other than the original invoker is rejected
  ephemerally with
  "Only the person who ran `/help` can switch pages."
- Page changes clamp to `[0, pages.length - 1]` and edit the message in place.
- When the collector ends (timeout or teardown), both buttons are disabled on
  the message.

### Examples

```
/help
```

Shows the single-page embed when 25 or fewer commands are loaded (the current
bot has 21, so this is the normal result).

```
/help
```

With more than 25 loaded commands, shows `Page 1/2` and enables only the
**Next ▶** button; pressing it edits the same message to page 2.

```
/help
```

Run by user A, then user B presses **Next ▶** — user B gets the ephemeral
"Only the person who ran `/help` can switch pages." message and the page does
not change.

### Edge cases

- **No commands loaded** (e.g. every command module failed to import):
  ephemeral `No commands loaded.`
- **Alphabetical ordering is locale-dependent.** `localeCompare` may order
  names differently from a plain byte comparison, and the sort is stable.
- **Custom cooldowns do not apply to page buttons** — button presses bypass the
  slash-command cooldown path entirely and are handled by the collector.
- **Only the invoker can navigate.** The collector still receives other users'
  presses and rejects them individually.
- **Collector state is in memory.** If the bot restarts, the previously posted
  help message's buttons no longer work and Discord shows "This interaction
  failed" when pressed.
- **Non-command interactions are ignored** by the global handler, so this
  collector is the only thing handling its own buttons.
- **Page boundaries** are clamped in code, and the corresponding button is
  disabled at each edge, so repeated presses are harmless.
- **Collector errors are swallowed** (`.catch(ignoreError)`) so a failed update
  does not crash the collector.
- **DM usage** is possible only when commands are registered globally; the
  embed and buttons work in DMs.

### Permissions

- **Member:** none. Anyone who can see the command can run it.
- **Discord-side gating:** none (`setDefaultMemberPermissions` is not set).
- **Guild-only:** no (`setDMPermission` is not set).
- **Bot:** View Channel, Send Messages, Embed Links in the channel.

---

## /ping

### Description

Measures the bot's latency and reports both the interaction round trip and the
gateway WebSocket heartbeat. The command first replies with a placeholder and
then edits that same reply with the measured values.

- Source: `src/commands/ping.js`
- Cooldown: default (3 s)
- Response: public

### Usage syntax

```
/ping
```

### Options

| Option | Type | Required | Constraints | Default | Description |
| --- | --- | --- | --- | --- | --- |
| — | — | — | — | — | This command takes no options. |

### Behavior

1. Replies `🏓 Pinging...`.
2. Fetches the reply message.
3. Computes `roundtrip = reply.createdTimestamp - interaction.createdTimestamp`.
4. Reads `interaction.client.ws.ping`. If it is finite and non-negative it is
   rounded and shown as `Nms`; otherwise it is shown as `measuring...`.
5. Edits the reply to
   `🏓 Pong! Roundtrip: **Xms** · WebSocket heartbeat: **Yms**`.

### Examples

```
/ping
```

Normal result, e.g. `🏓 Pong! Roundtrip: **142ms** · WebSocket heartbeat: **38ms**`.

```
/ping
```

Immediately after startup, the heartbeat may still be `measuring...` because
Discord has not sent a heartbeat ACK yet.

```
/ping
```

Run twice within the cooldown window — the second invocation gets the ephemeral
cooldown notice instead of a second measurement.

### Edge cases

- **Gateway ping not ready or negative:** shown as `measuring...` rather than a
  bogus negative value.
- **Roundtrip includes API latency:** it measures reply creation minus
  interaction creation, so a slow or rate-limited REST call inflates it.
- **Two REST calls:** the initial reply and the edit. If the edit fails, the
  placeholder remains.
- **No deferral:** the command must acknowledge within Discord's 3-second
  interaction window. Very slow connections can produce an "Unknown
  interaction" error, which surfaces through the global error handler.
- **No arguments:** any attempts to pass arguments are rejected by Discord.
- **DM usage** works when the command is globally registered.

### Permissions

- **Member:** none.
- **Discord-side gating:** none.
- **Guild-only:** no.
- **Bot:** View Channel, Send Messages.

---

## /userinfo

### Description

Shows information about a user: account identity, bot status, account creation
date and, when the target is a member of the current server, nickname, join date
and highest role.

- Source: `src/commands/userinfo.js`
- Cooldown: default (3 s)
- Response: public embed

### Usage syntax

```
/userinfo [target:<user>]
```

### Options

| Option | Type | Required | Constraints | Default | Description |
| --- | --- | --- | --- | --- | --- |
| `target` | user | No | Any resolvable Discord user | The invoker | The user to inspect |

### Behavior

- Replies with an embed titled `User info — <username>`, using the user's
  avatar as a 256 px thumbnail and the brand color.
- Always includes these inline fields:
  - **Tag** — `user.tag`
  - **ID** — `user.id`
  - **Bot** — `Yes` or `No`
  - **Account created** — Discord relative timestamp `<t:...:R>`
- When the target resolves to a guild member, also includes:
  - **Nickname** — `member.nickname` or `None`
  - **Joined server** — relative timestamp, or `Unknown` if no join timestamp
  - **Highest role** — `member.roles.highest.name` or `None`

### Examples

```
/userinfo
```

Shows the invoker's own information.

```
/userinfo target:@Ada
```

Shows Ada's information. If Ada is in the server, membership fields are
included.

```
/userinfo target:123456789012345678
```

Resolves a user by raw ID, which also works for users who are not members of
the current server.

### Edge cases

- **Target is not a guild member:** `getMember("target")` returns `null`, so the
  Nickname / Joined server / Highest role fields are omitted. The base fields
  still render.
- **Invoked in a DM:** `interaction.member` is `null`, so the membership fields
  are omitted even for the invoker.
- **`user.tag` is deprecated** in newer discord.js versions; the command still
  reads it, which yields `username#discriminator` for legacy users and the
  plain username for migrated users.
- **Highest role** can be `@everyone`; it is displayed by name.
- **Missing join timestamp** shows `Unknown`.
- **Default avatars** are handled by Discord's CDN; the command does not detect
  or special-case them.
- **No mention is produced** for the target in the title or fields (only the raw
  tag), so this command cannot ping the inspected user.
- **User picker vs. ID:** Discord accepts mentions, IDs, and picker selections
  for the *user* option.

### Permissions

- **Member:** none.
- **Discord-side gating:** none.
- **Guild-only:** no.
- **Bot:** View Channel, Send Messages, Embed Links.

---

## /serverinfo

### Description

Shows a summary of the current guild: ID, owner, member count, creation date,
text/voice channel counts, role count and boost count. All counts come from the
bot's local caches rather than fresh API calls.

- Source: `src/commands/serverinfo.js`
- Cooldown: default (3 s)
- Response: public embed

### Usage syntax

```
/serverinfo
```

### Options

| Option | Type | Required | Constraints | Default | Description |
| --- | --- | --- | --- | --- | --- |
| — | — | — | — | — | This command takes no options. |

### Behavior

- Refuses to run without a guild:
  `This command only works in a server.` (ephemeral).
- Builds an embed with:
  - Title: guild name
  - Thumbnail: guild icon at 256 px (omitted when the guild has no icon)
  - Color: brand color
  - Inline fields: **Server ID**, **Owner** (`<@ownerId>` mention),
    **Members**, **Created** (relative timestamp), **Text channels**,
    **Voice channels**, **Roles**, **Boosts**
- Text channels are counted from `guild.channels.cache` entries whose type is
  `GuildText`; voice channels are counted for `GuildVoice`.
- `Boosts` shows `guild.premiumSubscriptionCount ?? 0`.

### Examples

```
/serverinfo
```

Shows the full embed for the current server.

```
/serverinfo
```

Invoked from a DM — refused with the ephemeral
`This command only works in a server.` message.

```
/serverinfo
```

In a large server immediately after startup, counts reflect only the channels
and roles currently in cache until the gateway finishes populating it.

### Edge cases

- **DM invocation:** runtime rejection as above (`setDMPermission(false)` is not
  set, so Discord may still show the command in DMs when globally registered).
- **No guild icon:** `iconURL()` returns `null`; the thumbnail is simply absent.
- **Cache-based counts:** can be incomplete on very large guilds or directly
  after a restart, and can include stale entries until cache updates arrive.
- **Channel type coverage:** category, forum, announcement, stage and thread
  channels are **not** counted in either channel field.
- **Boost count unavailable:** falls back to `0`.
- **Owner not cached:** the owner is rendered as a raw mention (`<@id>`) rather
  than a fetched member.
- **Member count** is the guild's known member count and may lag slightly behind
  very recent joins/leaves.

### Permissions

- **Member:** none, but the command must be used inside a guild.
- **Discord-side gating:** none.
- **Guild-only:** yes, enforced at runtime.
- **Bot:** View Channel, Send Messages, Embed Links.

---

## /serverstats

### Description

Reports how many messages the bot has tracked per channel for the current guild.
It shows the top 25 channels, the total number of tracked messages, the number
of channels with data, and the number of text channels in the guild.

- Source: `src/commands/serverstats.js` (data from `src/statsStore.js`)
- Cooldown: default (3 s)
- Response: public embed; empty state is ephemeral

### Usage syntax

```
/serverstats
```

### Options

| Option | Type | Required | Constraints | Default | Description |
| --- | --- | --- | --- | --- | --- |
| — | — | — | — | — | This command takes no options. |

### Behavior

- Refuses to run outside a guild:
  `This command only works in a server.` (ephemeral).
- If `totalMessages(guildId)` is `0`, replies ephemerally:
  `No messages tracked yet — say something in a channel and check back later.`
- Otherwise builds an embed:
  - Title: `📊 Message stats — <guild name>`
  - Description: up to 25 lines of `N. <#channelId> — **count** message(s)`
  - Inline fields: **Total messages**, **Tracked in** (channels with data),
    **Text channels**
  - Embed timestamp: current time
- Message counting is done by the `messageCreate` event in
  `src/events/messageCreate.js`; DMs and bot-authored messages are ignored.
- Counts are persisted to `data/stats.json` every **5 minutes** by
  `startAutoSave` from the ready event.

### Examples

```
/serverstats
```

Shows the leaderboard embed once at least one non-bot guild message has been
tracked.

```
/serverstats
```

In a brand-new guild before anyone chats: ephemeral
`No messages tracked yet — say something in a channel and check back later.`

```
/serverstats
```

After restarting with an empty or deleted `data/stats.json`: counts start from
zero and the empty state is shown again.

### Edge cases

- **Only guild messages count.** DMs are skipped by `message.inGuild()`.
- **Bots are ignored.** Messages whose author is a bot (including this bot) do
  not increment counts.
- **Edits and deletions do not decrement counts.** Only message creation is
  recorded.
- **Persistence loss window:** up to 5 minutes of counts can be lost if the
  process crashes before an auto-save tick.
- **Deleting `data/stats.json` while the bot runs does not reset live counts.**
  The in-memory map is written back on the next save tick. Stop the bot first
  for a true reset.
- **Deleted channels remain in the leaderboard** as `<#id>` mentions that
  Discord may no longer resolve.
- **Top 25 only in the description**, but the "Total messages" and "Tracked in"
  fields include all tracked channels.
- **The text channel count uses the live cache**, so it can differ from
  "Tracked in".
- **Malformed persisted data** is normalized on load/save: non-object guild
  entries, non-integer counts and counts below 1 are dropped.

### Permissions

- **Member:** none, but the command must be used inside a guild.
- **Discord-side gating:** none.
- **Guild-only:** yes, enforced at runtime.
- **Bot:** View Channel, Send Messages, Embed Links.

---

## /topchannels

### Description

Shows a leaderboard of the ten most active channels in the current guild, with
medals for the top three and numbered entries after that.

- Source: `src/commands/topchannels.js` (data from `src/statsStore.js`)
- Cooldown: default (3 s)
- Response: public plain text; empty state is ephemeral

### Usage syntax

```
/topchannels
```

### Options

| Option | Type | Required | Constraints | Default | Description |
| --- | --- | --- | --- | --- | --- |
| — | — | — | — | — | This command takes no options. |

### Behavior

- Refuses to run outside a guild:
  `This command only works in a server.` (ephemeral).
- Reads the top 10 channels via `topChannels(guild.id, 10)`.
- If there is no data, replies ephemerally:
  `No messages tracked yet — say something in a channel and check back later.`
- Otherwise replies with plain text:
  - Header: `🏆 **Most active channels**`
  - Ranks 1–3: 🥇, 🥈, 🥉
  - Ranks 4–10: `**#N**`
  - Each line: `<medal-or-rank> <#channelId> — **count** message(s)`

### Examples

```
/topchannels
```

Shows medals for the top three channels and `**#4**` … `**#10**` for the rest.

```
/topchannels
```

With only two tracked channels, only 🥇 and 🥈 lines appear.

```
/topchannels
```

With tied counts, the lower channel ID appears first (deterministic tie-break).

### Edge cases

- **Tie-break:** sorted by count descending, then channel ID ascending
  (`compareEntries` in `src/lib/stats.js`).
- **Deleted channels** still appear as raw `<#id>` mentions.
- **Shares all state and caveats with `/serverstats`:** ignore bots/DMs,
  5-minute persistence interval, edits do not count.
- **No embed:** the success output is plain text, so Embed Links is not
  required for it, but Send Messages is.
- **Empty state is ephemeral**, not public.
- **Top 10 is a hard limit;** `topChannels` slices after sorting.

### Permissions

- **Member:** none, but the command must be used inside a guild.
- **Discord-side gating:** none.
- **Guild-only:** yes, enforced at runtime.
- **Bot:** View Channel, Send Messages.

---

## /avatar

### Description

Shows a user's avatar as an embed image, with direct links to full-size PNG and
WebP versions.

- Source: `src/commands/avatar.js`
- Cooldown: default (3 s)
- Response: public embed

### Usage syntax

```
/avatar [target:<user>]
```

### Options

| Option | Type | Required | Constraints | Default | Description |
| --- | --- | --- | --- | --- | --- |
| `target` | user | No | Any resolvable Discord user | The invoker | Whose avatar to show |

### Behavior

- Resolves the target or falls back to the invoker.
- Builds an embed:
  - Title: `<username>'s avatar`
  - Image: `displayAvatarURL({ size: 1024 })`
  - Description: `[PNG](<png url>) • [WebP](<webp url>)`
  - Color: brand
- Both direct links request 1024 px variants.

### Examples

```
/avatar
```

Shows your own avatar at 1024 px with PNG/WebP links.

```
/avatar target:@Friend
```

Shows the mentioned user's avatar.

```
/avatar target:987654321098765432
```

Resolves the avatar by user ID, even if the user is not in the current server.

### Edge cases

- **Default avatars:** users without a custom avatar get Discord's default
  avatar URL; the command does not label it specially.
- **Non-members:** only the user object is needed, so users outside the guild
  work.
- **Animated avatars:** the embed image is Discord's default rendering (which
  may be animated for Nitro users); the explicit PNG/WebP links are static
  images.
- **No filename or download:** links open the CDN URL directly.
- **DM usage** works when the command is globally registered.
- **No avatar size validation errors:** large sizes are handled by Discord's
  CDN.

### Permissions

- **Member:** none.
- **Discord-side gating:** none.
- **Guild-only:** no.
- **Bot:** View Channel, Send Messages, Embed Links.

---

## /8ball

### Description

Pretends to answer a yes/no question with a random Magic 8-Ball response from a
fixed pool of 20 answers.

- Source: `src/commands/8ball.js` (answers in `src/lib/randomness.js`)
- Cooldown: default (3 s)
- Response: public

### Usage syntax

```
/8ball question:<text>
```

### Options

| Option | Type | Required | Constraints | Default | Description |
| --- | --- | --- | --- | --- | --- |
| `question` | string | Yes | Max 1,000 characters | — | Your question for the 8-ball |

### Behavior

- Picks one answer uniformly at random from `EIGHT_BALL_RESPONSES` (20 entries:
  10 affirmative and 10 non-committal/negative).
- Replies publicly with:
  `🎱 **Question:** <question>` on one line and
  `**Answer:** <answer>` on the next.

### Examples

```
/8ball question:Will it rain tomorrow?
```

Replies with the question and a random answer such as `Outlook good.`

```
/8ball question:Should I deploy on Friday?
```

A classic risky deployment question — the answer is still random.

```
/8ball question:Am I the coolest person here?
```

The bot makes no judgment; any of the 20 canned answers is possible.

### Edge cases

- **Purely random:** no semantic analysis, sentiment detection, or history.
- **Same answer pool every time:** no server-specific customization.
- **User text is echoed verbatim** inside the reply, so Markdown, mentions and
  any Discord formatting the user supplies are rendered as typed. Pings are
  suppressed with `allowedMentions: { parse: [] }`.
- **Length limit:** Discord enforces the 1,000-character option maximum before
  the handler runs.
- **Hazy answers** ("Reply hazy, try again.") are ordinary outcomes, not an
  invitation to retry; the command does not consume a "turn".
- **No seeding or guarantee of distribution:** independent calls can repeat the
  same answer.

### Permissions

- **Member:** none.
- **Discord-side gating:** none.
- **Guild-only:** no.
- **Bot:** View Channel, Send Messages.

---

## /coinflip

### Description

Flips a fair coin and reports Heads or Tails.

- Source: `src/commands/coinflip.js` (logic in `src/lib/randomness.js`)
- Cooldown: default (3 s)
- Response: public

### Usage syntax

```
/coinflip
```

### Options

| Option | Type | Required | Constraints | Default | Description |
| --- | --- | --- | --- | --- | --- |
| — | — | — | — | — | This command takes no options. |

### Behavior

- Calls `flipCoin()`, which returns `Heads` when `Math.random() < 0.5`, else
  `Tails`.
- Replies with `🪙 The coin landed on **Heads**!` or
  `🪙 The coin landed on **Tails**!`.

### Examples

```
/coinflip
```

One fair 50/50 flip.

```
/coinflip
```

Settle a two-person decision with a single invocation.

```
/coinflip
```

Multiple users can each flip their own coin; the per-user cooldown applies
independently.

### Edge cases

- **Not cryptographically secure:** `Math.random()` is unsuitable for security
  or gambling use.
- **No edge outcome:** the result is always Heads or Tails.
- **Independent flips:** results are not remembered and can repeat.
- **No arguments:** any extra input is rejected by Discord.
- **DM usage** works when globally registered.

### Permissions

- **Member:** none.
- **Discord-side gating:** none.
- **Guild-only:** no.
- **Bot:** View Channel, Send Messages.

---

## /dice

### Description

Rolls dice expressed in `NdN` notation, e.g. `2d6` for two six-sided dice or
`4d20` for four twenty-sided dice. Supports up to 25 dice with up to 1,000
sides each.

- Source: `src/commands/dice.js` (parsing/rolling in `src/lib/dice.js`)
- Cooldown: default (3 s)
- Response: public; validation errors are ephemeral

### Usage syntax

```
/dice notation:<NdN>
```

### Options

| Option | Type | Required | Constraints | Default | Description |
| --- | --- | --- | --- | --- | --- |
| `notation` | string | Yes | Max 20 characters; must match `^(\d+)d(\d+)$` after trimming; 1–25 dice; 2–1,000 sides | — | NdN notation, e.g. `2d6` |

### Behavior

1. Reads the notation and parses it case-insensitively after trimming
   whitespace.
2. Invalid format → ephemeral
   "⚠️ Invalid notation. Use the form **NdN**, e.g. `2d6` or `4d20`."
3. Parsed but out of range → ephemeral
   `⚠️ Out of range: use between **1 and 25** dice with **2 to 1000** sides.`
4. Rolls each die uniformly in `[1, sides]` and replies publicly:
   `🎲 Rolled **NdN**: r1, r2, ... — total **T**`.
   The `— total **T**` segment is omitted when only one die is rolled.

### Examples

```
/dice notation:2d6
```

Rolls two six-sided dice, e.g. `🎲 Rolled **2d6**: 3, 5 — total **8**`.

```
/dice notation:4d20
```

Rolls four twenty-sided dice and shows all four results plus the total.

```
/dice notation:1d100
```

Rolls one percentile die; because only one die is rolled, only the face value
is shown.

### Edge cases

- **Accepted syntax:** `2d6`, `02d06` (leading zeros are parsed as numbers),
  `2D6` (case-insensitive), and surrounding whitespace such as ` 2d6 `.
- **Rejected syntax:** `d20` (no die count), `2d6+1`, `2d6 1`, `2d`, `dd6`,
  negative numbers, decimals and combined units. Invalid input gets the
  "Invalid notation" reply.
- **Range check:** `0d6`, `1d1`, `26d6` and `1d1001` parse but are rejected as
  out of range. `25d1000` is the maximum valid roll.
- **`0d6` is rejected** even though it parses; zero dice are not allowed.
- **Notation length:** Discord enforces the 20-character maximum before the
  handler runs.
- **Randomness:** uniform per die via `Math.random()`, not cryptographic.
- **Output size:** 25 results each up to four digits fit comfortably within
  Discord's 2,000-character message limit.
- **No modifiers, keep/drop, or exploding dice.**
- **Case and whitespace are normalized**, but internal whitespace (`2 d 6`) is
  not accepted.

### Permissions

- **Member:** none.
- **Discord-side gating:** none.
- **Guild-only:** no.
- **Bot:** View Channel, Send Messages.

---

## /roll

### Description

Rolls a configurable number of dice with a configurable number of sides, using
separate options instead of notation. Defaults to a single six-sided die.

- Source: `src/commands/roll.js` (logic in `src/lib/dice.js`)
- Cooldown: default (3 s)
- Response: public

### Usage syntax

```
/roll [sides:<integer>] [dice:<integer>]
```

### Options

| Option | Type | Required | Constraints | Default | Description |
| --- | --- | --- | --- | --- | --- |
| `sides` | integer | No | 2–1,000 | 6 | Number of sides per die |
| `dice` | integer | No | 1–25 | 1 | How many dice to roll |

### Behavior

- Reads the options with defaults (`sides = 6`, `dice = 1`).
- Rolls and formats the result exactly like `/dice`:
  `🎲 Rolled **NdN**: r1, r2, ... — total **T**`, with the total omitted for a
  single die.
- Range limits are declared on the option builders, so Discord rejects values
  outside 2–1,000 (sides) and 1–25 (dice) before the handler runs.

### Examples

```
/roll
```

Rolls `1d6`, the default.

```
/roll sides:20 dice:5
```

Rolls five twenty-sided dice and shows each result plus the total.

```
/roll sides:1000
```

Rolls a single 1,000-sided die — the maximum side count.

### Edge cases

- **No runtime range errors:** option min/max constraints cannot be bypassed
  through normal slash-command usage.
- **`sides` without `dice`** yields one die; `dice` without `sides` yields
  d6 dice.
- **Defaults are applied independently** for each omitted option.
- **Limits match `/dice`:** 25 dice and 1,000 sides, so the two commands can
  express the same rolls.
- **Output size:** `dice:25 sides:1000` produces 25 comma-separated values,
  still well under the message limit.
- **Randomness:** same uniform `Math.random()` implementation as `/dice`.
- **No notation parsing:** `sides:6 dice:2` is the only supported form; strings
  like `2d6` belong to `/dice`.

### Permissions

- **Member:** none.
- **Discord-side gating:** none.
- **Guild-only:** no.
- **Bot:** View Channel, Send Messages.

---

## /define

### Description

Looks up an English word on [dictionaryapi.dev](https://dictionaryapi.dev)
(no API key) and returns phonetic information plus up to three parts of speech,
each with up to two numbered definitions.

- Source: `src/commands/define.js`
- Cooldown: default (3 s)
- Response: public (the command defers publicly; errors are edited into the
  public reply, not sent ephemerally)

### Usage syntax

```
/define word:<text>
```

### Options

| Option | Type | Required | Constraints | Default | Description |
| --- | --- | --- | --- | --- | --- |
| `word` | string | Yes | Max 100 characters; trimmed | — | The word to define |

### Behavior

1. Trims the word and defers the reply publicly.
2. Requests
   `https://api.dictionaryapi.dev/api/v2/entries/en/<url-encoded word>` with a
   **10,000 ms** timeout.
3. HTTP 404 → `📖 No dictionary entry found for **<word>**.`
4. Other non-OK status, network error or timeout → logs the error and replies
   `⚠️ Couldn't reach the dictionary service. Please try again later.`
5. Empty or non-array response → the same "No dictionary entry found" message.
6. Entry found but no meanings → `📖 No definitions available for **<word>**.`
7. Builds an embed:
   - Title: `📖 <word>`
   - Description: `entry.phonetic`, or the first non-empty `phonetics[].text`,
     when available
   - One field per part of speech (maximum 3), each containing up to 2 numbered
     definitions (`1. ...`, `2. ...`)
   - Color: brand

### Examples

```
/define word:serendipity
```

Returns the phonetic spelling and up to three parts of speech for
"serendipity".

```
/define word:run
```

A word with many senses — only the first three parts of speech and the first two
definitions of each are shown.

```
/define word:qwertyuiopp
```

A non-word; expect the public
`📖 No dictionary entry found for **qwertyuiopp**.` reply.

### Edge cases

- **English only:** the endpoint path is `/entries/en`; words in other languages
  generally return 404.
- **URL encoding:** the trimmed input is encoded, so spaces and special
  characters are sent safely.
- **Phonetic missing:** the description is omitted; the embed still renders.
- **Meaning without definitions:** that field is skipped, and if no meanings
  have definitions the "No definitions available" message is used.
- **API rate limits and outages** surface as the generic
  "Couldn't reach the dictionary service" message.
- **Timeout:** each request is aborted after 10 seconds.
- **No caching:** repeat lookups always hit the API.
- **No part-of-speech filter or selection:** the first three meanings are shown
  in API order.
- **Truncation:** the command clamps output to Discord limits by appending an
  ellipsis (`…`). The embed title (including `📖`) is capped at 256 characters,
  the phonetic description at 4,096, each part-of-speech field name at 256, and
  each field's joined definitions at 1,024. Only two definitions per meaning are
  included, and only the first three meanings are shown.
- **Canonical title:** the title uses the API's `entry.word`, which can differ in
  capitalization from the text the user typed.
- **Public failure messages:** because the reply was deferred without
  `ephemeral: true`, not-found and service-error messages are visible to the
  channel.

### Permissions

- **Member:** none.
- **Discord-side gating:** none.
- **Guild-only:** no.
- **Bot:** View Channel, Send Messages, Embed Links.

---

## /weather

### Description

Shows the current weather for a city using
[open-meteo.com](https://open-meteo.com), which requires no API key. The city is
geocoded first, then current conditions are fetched for the top match.

- Source: `src/commands/weather.js`
- Cooldown: default (3 s)
- Response: public (deferred publicly; errors are public)

### Usage syntax

```
/weather city:<text>
```

### Options

| Option | Type | Required | Constraints | Default | Description |
| --- | --- | --- | --- | --- | --- |
| `city` | string | Yes | Max 100 characters; trimmed | — | City name, e.g. `Berlin` or `New York` |

### Behavior

1. Trims the city name and defers the reply publicly.
2. Geocoding request:
   `https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=<city>`
   with a 10-second timeout. Only the **top result** is used.
3. Geocoding failure (non-OK, network, timeout) → logs and replies
   `⚠️ Couldn't reach the geocoding service. Try again later.`
4. No usable result (missing `results[0]` or non-numeric latitude/longitude) →
   `🔎 I couldn't find a city called **<city>**.`
5. Forecast request:
   `https://api.open-meteo.com/v1/forecast?latitude=...&longitude=...&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code`
   with a 10-second timeout.
6. Forecast failure → logs and replies
   `⚠️ Couldn't reach the weather service. Try again later.`
7. Missing `current` object → `⚠️ The weather service didn't return any data for
   that city.`
8. Builds an embed:
   - Title: `🌤️ <name, admin1, country>` (missing parts dropped; falls back to
     `Unknown location`)
   - Inline fields: **Temperature** (`X°C (feels like Y°C)`), **Humidity**
     (`Z%`), **Wind** (`W km/h`)
   - Description: the WMO weather-code label when the code is known
   - Color: brand; embed timestamp: current time

### Examples

```
/weather city:Berlin
```

Geocodes Berlin and shows current temperature, feels-like temperature, humidity,
wind and conditions.

```
/weather city:New York
```

Multi-word city names are accepted; the geocoder returns the top match.

```
/weather city:Nowhereville
```

An unknown city produces the public
`🔎 I couldn't find a city called **Nowhereville**.` message.

### Edge cases

- **Ambiguous names:** only the first geocoding result is used; the command does
  not let the user choose between matches.
- **Tiny villages or misspellings** often return no result.
- **Missing location components:** `admin1` (state/region) and `country` are
  optional; the title joins whatever is present.
- **Unknown weather codes:** the description is omitted instead of showing a
  placeholder.
- **Units are fixed:** Celsius and km/h (open-meteo defaults).
- **No caching:** each invocation makes two network requests.
- **Timeout:** both requests abort after 10 seconds.
- **No API key required**, but public API outages/rate limits produce the
  generic service-error messages.
- **Coordinates are taken from geocoding**, so the displayed place may be a
  nearby match for ambiguous input.
- **Public failure messages:** errors are edited into the public deferred reply.

### Permissions

- **Member:** none.
- **Discord-side gating:** none.
- **Guild-only:** no.
- **Bot:** View Channel, Send Messages, Embed Links.

---

## /poll

### Description

Creates a reaction poll. With no options it posts a simple 👍/👎 vote; with two
to ten comma-separated options it posts a numbered list and adds one number
emoji reaction per option.

- Source: `src/commands/poll.js`
- Cooldown: default (3 s)
- Response: public; validation errors are ephemeral

### Usage syntax

```
/poll question:<text> [options:<comma-separated list>]
```

### Options

| Option | Type | Required | Constraints | Default | Description |
| --- | --- | --- | --- | --- | --- |
| `question` | string | Yes | Max 500 characters | — | The poll question |
| `options` | string | No | Max 500 characters; 2–10 comma-separated entries after trimming/filtering | 👍/👎 vote | Comma-separated poll options |

### Behavior

1. Reads the question.
2. If `options` is present, splits on commas, trims every entry, and drops empty
   entries (so stray commas are tolerated).
3. Exactly **1** remaining option → ephemeral
   `Please provide at least **two** options (separated by commas), or none at
   all for a 👍/👎 poll.`
4. More than **10** options → ephemeral `Maximum **10** options allowed.`
5. **No options** → posts `📊 **<question>**`, then reacts with 👍 and 👎 in that
   order.
6. **Two to ten options** → posts `📊 **<question>**` followed by a blank line
   and one line per option using 1️⃣ … 🔟, then reacts with those emojis in
   order.

### Examples

```
/poll question:Pizza tonight?
```

Posts the question and adds 👍 and 👎 reactions.

```
/poll question:Best day to meet? options:Monday, Wednesday, Friday
```

Posts a three-option poll and reacts with 1️⃣, 2️⃣ and 3️⃣.

```
/poll question:Ship it? options:Yes, No, Maybe, Absolutely not
```

Posts a four-option poll and reacts with 1️⃣ through 4️⃣.

### Edge cases

- **Exactly one option is an error**, not a one-option poll. Use no options for
  a yes/no vote, or provide at least two.
- **Empty entries are discarded:** `options:a,, b ,` becomes `a` and `b`. If
  that leaves one option, the "at least two" error is shown.
- **Commas cannot appear inside an option**, because every comma is a
  separator.
- **More than ten options** is rejected after filtering empties.
- **Duplicate option texts are allowed** and get distinct number reactions.
- **Whitespace-only options** are dropped by the Boolean filter after trimming.
- **Question and options are echoed verbatim**, including Markdown and mentions.
  Pings are suppressed with `allowedMentions: { parse: [] }`.
- **Reactions are added sequentially** after the reply. If one fails (for
  example, the bot lacks **Add Reactions**), earlier reactions remain and the
  failure is reported through the global handler as a follow-up error.
- **The bot must be able to add reactions in that channel;** otherwise the poll
  text posts but reactions are missing/partial.
- **No automatic closing or tallying** — the poll stays open indefinitely.
- **The 500-character limits** are enforced by Discord for both options.

### Permissions

- **Member:** none.
- **Discord-side gating:** none.
- **Guild-only:** no.
- **Bot:** View Channel, Send Messages, Add Reactions (for the vote emojis).

---

## /repeat

### Description

Repeats a piece of text a requested number of times, one copy per line (up to
five copies of up to 200 characters).

- Source: `src/commands/repeat.js` (logic in `src/lib/stats.js`)
- Cooldown: default (3 s)
- Response: public; validation errors are ephemeral

### Usage syntax

```
/repeat text:<string> [times:<integer>]
```

### Options

| Option | Type | Required | Constraints | Default | Description |
| --- | --- | --- | --- | --- | --- |
| `text` | string | Yes | Max 200 characters; must not be whitespace-only | — | Text to repeat |
| `times` | integer | No | 1–5 | 1 | How many times to repeat it |

### Behavior

1. Reads `text` and `times` (default 1).
2. Validates via `buildRepeat`/`validateRepeat`:
   - blank/whitespace-only text → `⚠️ Text cannot be empty.`
   - text longer than 200 characters → `⚠️ Text is too long (max 200
     characters).`
   - non-integer or `< 1` times → `⚠️ Times must be a whole number of at least
     1.`
   - times `> 5` → `⚠️ Times must be at most 5.`
3. On success, replies with the copies joined by `\n`.

### Examples

```
/repeat text:spam
```

Posts a single copy (`times` defaults to 1).

```
/repeat text:hi times:3
```

Posts:

```
hi
hi
hi
```

```
/repeat text:abcdefghijklmnopqrstuvwxyz times:5
```

Posts five lines of the alphabet, demonstrating the maximum repetition count.

### Edge cases

- **Whitespace-only text** is rejected even though Discord's length check
  accepts it.
- **Discord enforces the option limits** (200 characters, 1–5 times) before the
  handler runs; the library checks remain as defense in depth but are normally
  unreachable through the slash UI.
- **Output is plain text**, not an embed. Copies are separated by a single
  newline.
- **Maximum output size:** 5 × 200 characters plus 4 newlines = 1,004
  characters, safely under the 2,000-character message limit.
- **User text is not escaped**, so Markdown and mentions render as typed;
  pings are suppressed with `allowedMentions: { parse: [] }`.
- **No trailing newline** after the final copy.
- **Only exact repetition:** no numbering, separators, or randomization.

### Permissions

- **Member:** none.
- **Discord-side gating:** none.
- **Guild-only:** no.
- **Bot:** View Channel, Send Messages.

---

## /remind

### Description

Sets a personal reminder. After the requested delay the bot posts a mention of
the invoker with the reminder text in the channel where the command was used.
The reminder lives only in memory and is lost if the bot restarts.

- Source: `src/commands/remind.js` (parsing in `src/lib/duration.js`)
- Cooldown: default (3 s)
- Response: ephemeral confirmation, then a public reminder message in the
  channel

### Usage syntax

```
/remind duration:<duration> text:<text>
```

### Options

| Option | Type | Required | Constraints | Default | Description |
| --- | --- | --- | --- | --- | --- |
| `duration` | string | Yes | `^(\d+)\s*([smhdw]?)$` (case-insensitive); units `s`, `m`, `h`, `d`, `w`; bare number = minutes; maximum 7 days | — | When to remind you |
| `text` | string | Yes | Max 1,000 characters | — | What to remind you about |

### Behavior

1. Parses the duration:
   - `s` = seconds, `m` = minutes, `h` = hours, `d` = days, `w` = weeks
   - no unit = minutes
   - whitespace between the number and unit is allowed
2. Invalid format or a zero duration → ephemeral
   "⚠️ Invalid duration. Use a number with an optional unit: `30s`, `10m`,
   `2h`, `1d`, `1w`."
3. Duration greater than 7 days → ephemeral
   `⚠️ Reminders can be at most **7 days** in the future.`
4. On success, replies ephemerally:
   `⏰ Got it — I'll remind you **<formatted duration>** from now
   (<t:<dueAt>:R>).`
   `formatMs` renders whole days, otherwise whole hours, otherwise minutes
   (e.g. `90 minute(s)`, not `1 hour(s) 30 minute(s)`).
5. Schedules a `setTimeout` for the exact delay. The timer is unref'd so it
   never keeps the process alive on its own.
6. At the due time, sends
   `<@invokerId> ⏰ Reminder: <text>` to the channel where the command ran.
   Send failures are caught and logged.

### Examples

```
/remind duration:10m text:stretch
```

Confirms the reminder and posts the mention ten minutes later in the same
channel.

```
/remind duration:90 text:check the oven
```

A bare number means minutes, so this is a 90-minute reminder.

```
/remind duration:1d text:standup notes
```

Reminds you one day later; the confirmation shows the relative due time.

### Edge cases

- **Rejected durations:** `2h30m` (combined units), decimals (`1.5h`),
  negatives (`-5m`), empty strings, and `0` (parsed as 0, then rejected as
  falsy).
- **Accepted durations:** `30s`, `10m`, `2h`, `1d`, `1w`, `7d`, `10080m`
  (exactly seven days), ` 10 m ` (internal whitespace). Units are
  case-insensitive (`10M` works).
- **Seven-day cap:** `8d`, `2w` and `10081m` are rejected. The check is
  `ms > MAX_DURATION_MS`, so exactly seven days is allowed.
- **In-memory only:** restarting the bot cancels every pending reminder.
- **Delivery channel:** the reminder is sent to `interaction.channel`; if that
  channel was deleted or the bot lost access, delivery fails and is logged.
  It is not re-sent to the user by DM.
- **Bot offline at the due time:** the in-process timer cannot fire, so the
  reminder is lost.
- **Not persistent and not resumable:** there is no list or cancel command.
- **Timer does not keep the process alive** (`unref`), which is why pending
  reminders disappear when the process exits.
- **`formatMs` never combines units**, so long durations read as e.g.
  `2 day(s)`.
- **Reminders can be set in DMs** when the command is globally registered; the
  reminder is sent back in the same DM channel.
- **Mention parsing:** the delivered message parses only user mentions
  (`allowedMentions: { parse: ["users"] }`), so an `@everyone`/`@here` or role
  mention inside the reminder text is rendered but does not notify.

### Permissions

- **Member:** none.
- **Discord-side gating:** none.
- **Guild-only:** no (works in DMs when globally registered).
- **Bot:** View Channel, Send Messages in the channel where the command was
  invoked.

---

## /clear

### Description

Bulk-deletes recent messages in the current channel, optionally restricted to a
single author. The bot reports how many messages were deleted and how many were
skipped.

- Source: `src/commands/clear.js`
- Cooldown: default (3 s)
- Response: ephemeral (deferred ephemeral reply)

### Usage syntax

```
/clear amount:<integer> [user:<user>]
```

### Options

| Option | Type | Required | Constraints | Default | Description |
| --- | --- | --- | --- | --- | --- |
| `amount` | integer | Yes | 1–100 | — | How many messages to delete |
| `user` | user | No | Any resolvable user | All authors | Only delete messages from this user |

### Behavior

1. Re-checks the invoker's **Manage Messages** permission. Missing → ephemeral
   `❌ You need the **Manage Messages** permission to use this.`
2. Checks that the channel is text-based. Otherwise → ephemeral
   `I can't delete messages in this channel.`
3. Defers the reply ephemerally.
4. Fetches the most recent **100** messages in the channel.
5. If `user` is provided, filters to that author and takes the first `amount`;
   otherwise takes the first `amount` messages.
6. Calls `bulkDelete(targets, true)` (skip-errors enabled).
7. Edits the deferred reply:
   `🧹 Deleted **N** message(s)` plus ` from **user.tag**` when filtered, then
   optionally ` K were skipped (older than 14 days or outside the recent 100).`

### Examples

```
/clear amount:10
```

Deletes the ten most recent messages in the channel (as permitted by Discord's
bulk-delete rules).

```
/clear amount:50 user:@Spammer
```

Deletes up to 50 recent messages authored by `@Spammer`.

```
/clear amount:100
```

Requests the maximum; the pool is still only the latest 100 fetched messages.

### Edge cases

- **14-day limit:** Discord cannot bulk-delete messages older than two weeks;
  those are skipped and counted in the summary.
- **Fetch pool is always the latest 100 messages**, regardless of the requested
  amount. A higher amount cannot reach older messages.
- **User filter reduces the pool:** fewer than `amount` matching messages may
  exist, and only those are deleted.
- **Deleted count can be lower than requested** because of the age limit or
  messages Discord refuses to delete.
- **No matching messages:** the deferred ephemeral reply becomes
  `No recent messages from **user.tag** were found to delete.` when a `user`
  filter is set, or `No messages found to delete.` without one; no bulk-delete
  call is made.
- **The bot's own messages and the invoker's messages can be deleted**, subject
  to the same rules.
- **Non-text channels** (e.g. voice) are rejected before deferring.
- **The bot needs Manage Messages** in the channel; without it the bulk-delete
  API call fails and the global error handler reports the failure.
- **Read Message History** is also required to fetch messages; without it the
  fetch fails.
- **Ephemeral deferral:** the final summary is visible only to the invoker.
- **DMs:** unavailable because the command is guild-only.
- **No confirmation prompt:** the deletion happens immediately.

### Permissions

- **Member:** **Manage Messages**. Declared via
  `setDefaultMemberPermissions(ManageMessages)` and re-checked at runtime.
  Missing → `❌ You need the **Manage Messages** permission to use this.`
- **Discord-side gating:** hidden from members without Manage Messages by
  default (admins can override).
- **Guild-only:** yes (`setDMPermission(false)`).
- **Bot:** View Channel, Manage Messages, Read Message History, Send Messages.

---

## /kick

### Description

Kicks a member from the server with an optional reason. The reason is passed to
Discord and appears in the audit log.

- Source: `src/commands/kick.js`
- Cooldown: default (3 s)
- Response: ephemeral

### Usage syntax

```
/kick target:<user> [reason:<text>]
```

### Options

| Option | Type | Required | Constraints | Default | Description |
| --- | --- | --- | --- | --- | --- |
| `target` | user | Yes | Must resolve to a guild member | — | The member to kick |
| `reason` | string | No | No explicit max length in the command | `No reason provided` | Reason for the kick |

### Behavior

1. Re-checks **Kick Members**. Missing → ephemeral
   `❌ You need the **Kick Members** permission to use this.`
2. Resolves the user and member. If the user is not a guild member →
   ephemeral `That user isn't a member of this server.`
3. Refuses to kick the invoker:
   `You can't kick yourself.` (ephemeral).
4. Checks `member.kickable`. If false → ephemeral
   `I can't kick that member — their role is above mine or I lack permissions.`
5. Calls `member.kick(reason)`.
6. Replies ephemerally
   `👢 Kicked **user.tag** — reason: <reason>` (uses the tag, not a mention).

### Examples

```
/kick target:@RuleBreaker
```

Kicks the member with the default reason `No reason provided`.

```
/kick target:@RuleBreaker reason:spamming in #general
```

Kicks with an audit-log reason.

```
/kick target:@RuleBreaker reason:raid
```

Another example; the reason is recorded in the audit log.

### Edge cases

- **Target not in the guild:** the user option can resolve users who are not
  members, which produces the "isn't a member" reply.
- **Self-kick:** blocked by an explicit check.
- **Kickable check:** a target with a role above the bot's highest role, or a
  bot lacking **Kick Members**, is rejected by `member.kickable`.
- **Server owner:** cannot be kicked; `kickable` is false.
- **No invoker hierarchy check:** the command does not compare the invoker's
  role with the target's; it only relies on `member.kickable` (bot-side
  hierarchy) and the invoker's Kick Members permission.
- **Reason length:** there is no command-level `maxLength`; Discord's audit-log
  reason limit (512 characters) may cause the API call to fail for very long
  input, which surfaces through the global error handler.
- **Reason is optional** and defaults to `No reason provided`.
- **DM:** guild-only, so no DM handling is needed.
- **Bot cannot kick itself** because it is the bot executing the action and the
  target is a user; targeting the bot would hit the `kickable` check.

### Permissions

- **Member:** **Kick Members**. Declared via
  `setDefaultMemberPermissions(KickMembers)` and re-checked at runtime.
  Missing → `❌ You need the **Kick Members** permission to use this.`
- **Discord-side gating:** hidden from members without Kick Members by default.
- **Guild-only:** yes (`setDMPermission(false)`).
- **Bot:** View Channel, Kick Members, and a role higher than the target's.

---

## /ban

### Description

Bans a user from the server, optionally deleting up to seven days of their
recent messages. Works for users who are not currently members (pre-emptive
bans).

- Source: `src/commands/ban.js`
- Cooldown: default (3 s)
- Response: ephemeral

### Usage syntax

```
/ban target:<user> [reason:<text>] [delete_messages:<integer>]
```

### Options

| Option | Type | Required | Constraints | Default | Description |
| --- | --- | --- | --- | --- | --- |
| `target` | user | Yes | Any resolvable user (member or not) | — | The user to ban |
| `reason` | string | No | No explicit max length in the command | `No reason provided` | Reason for the ban |
| `delete_messages` | integer | No | 0–7 | 0 | Also delete their recent messages, in days |

### Behavior

1. Re-checks **Ban Members**. Missing → ephemeral
   `❌ You need the **Ban Members** permission to use this.`
2. Refuses to ban the invoker:
   `You can't ban yourself.` (ephemeral).
3. If the target is a guild member and `member.bannable` is false → ephemeral
   `I can't ban that member — their role is above mine or I lack permissions.`
   If the target is not a member, this check is skipped.
4. Calls
   `guild.members.ban(user, { reason, deleteMessageSeconds: deleteDays * 86400 })`.
5. Replies ephemerally:
   `🔨 Banned **user.tag**[ and deleted N day(s) of messages] — reason: <reason>`
   (uses the tag, not a mention).

### Examples

```
/ban target:@Troll
```

Bans the user with the default reason and deletes no messages.

```
/ban target:@Troll reason:repeated harassment delete_messages:1
```

Bans and deletes one day of the user's recent messages.

```
/ban target:123456789012345678 reason:ban evasion
```

Bans by user ID, which also works for users who are not currently in the
server.

### Edge cases

- **Non-member targets are allowed:** useful for pre-emptive bans; the
  `bannable` check is only applied when a member object exists.
- **Self-ban** is blocked by an explicit user-ID check, whether or not a member
  object exists.
- **Role hierarchy:** for members, `member.bannable` requires the bot's highest
  role to be above the target's; the server owner is never bannable.
- **No invoker hierarchy check:** the command does not compare the invoker's
  role with the target's.
- **`delete_messages:0`** deletes nothing and omits the deletion clause from
  the confirmation.
- **Deleting messages requires additional bot permissions** in practice
  (Manage Messages / the ability to delete those messages); failures surface
  through the global error handler.
- **Already-banned users** may cause the ban call to fail, which is reported by
  the global error handler.
- **Reason length:** no command-level max; Discord's audit-log reason limit may
  reject very long values.
- **DMs:** guild-only (`setDMPermission(false)`).
- **Bans are persistent** and are not lifted by this bot; use Discord's UI to
  unban.

### Permissions

- **Member:** **Ban Members**. Declared via
  `setDefaultMemberPermissions(BanMembers)` and re-checked at runtime.
  Missing → `❌ You need the **Ban Members** permission to use this.`
- **Discord-side gating:** hidden from members without Ban Members by default.
- **Guild-only:** yes (`setDMPermission(false)`).
- **Bot:** View Channel, Ban Members; for `delete_messages > 0`, also the
  ability to delete those messages (typically Manage Messages).

---

## /timeout

### Description

Puts a guild member in Discord's timeout (communication disabled) state for a
number of minutes, with a maximum of 28 days.

- Source: `src/commands/timeout.js`
- Cooldown: default (3 s)
- Response: ephemeral

### Usage syntax

```
/timeout target:<user> minutes:<integer> [reason:<text>]
```

### Options

| Option | Type | Required | Constraints | Default | Description |
| --- | --- | --- | --- | --- | --- |
| `target` | user | Yes | Must resolve to a guild member | — | The member to timeout |
| `minutes` | integer | Yes | 1–40,320 (28 days) | — | Duration in minutes |
| `reason` | string | No | No explicit max length in the command | `No reason provided` | Reason for the timeout |

### Behavior

1. Re-checks **Moderate Members**. Missing → ephemeral
   `❌ You need the **Moderate Members** permission to use this.`
2. Resolves the member. Not a member → ephemeral
   `That user isn't a member of this server.`
3. Refuses to time out the invoker:
   `You can't time yourself out.` (ephemeral).
4. Checks `member.moderatable`. If false → ephemeral
   `I can't timeout that member — their role is above mine or I lack
   permissions.`
5. Calls `member.timeout(minutes * 60_000, reason)`.
6. Replies ephemerally
   `🔇 Timed out **member.user.tag** for **N** minute(s) — reason: <reason>`
   (uses the tag, not a mention).

### Examples

```
/timeout target:@Loud minutes:10
```

Times the member out for ten minutes with the default reason.

```
/timeout target:@Loud minutes:60 reason:arguing in voice chat
```

Times the member out for one hour with an audit-log reason.

```
/timeout target:@Loud minutes:40320
```

Uses the maximum: 28 days (40,320 minutes).

### Edge cases

- **Target not in the guild:** produces the "isn't a member" reply.
- **Self-timeout:** blocked by an explicit check.
- **Not moderatable:** the server owner, the bot itself, a member with the
  **Administrator** permission, or a member with a role above the bot's is
  rejected.
- **Discord's hard cap:** 28 days (40,320 minutes). The option maximum matches
  it, so larger values cannot be submitted.
- **No invoker hierarchy check;** only the bot-side `moderatable` property and
  the invoker's permission matter.
- **No timeout removal command:** timeouts expire automatically when the
  duration elapses. Use Discord's UI to remove one early.
- **Reason length:** no command-level max; Discord's audit-log reason limit may
  reject very long values.
- **The server owner and the bot itself** cannot be timed out (not
  moderatable); members with Administrator are also protected by discord.js's
  `moderatable` check.
- **DMs:** guild-only (`setDMPermission(false)`).

### Permissions

- **Member:** **Moderate Members**. Declared via
  `setDefaultMemberPermissions(ModerateMembers)` and re-checked at runtime.
  Missing → `❌ You need the **Moderate Members** permission to use this.`
- **Discord-side gating:** hidden from members without Moderate Members by
  default.
- **Guild-only:** yes (`setDMPermission(false)`).
- **Bot:** View Channel, Moderate Members, and a role higher than the target's.

---

## /welcome-message

### Description

Configures the channel where welcome messages are posted when a new member
joins the server, or shows/clears the current configuration. The setting is
stored per guild in `data/settings.json` and survives restarts.

- Source: `src/commands/welcome-message.js` (storage in `src/store.js`, delivery
  in `src/events/guildMemberAdd.js`)
- Cooldown: default (3 s)
- Response: ephemeral

### Usage syntax

```
/welcome-message set channel:<channel>
/welcome-message clear
/welcome-message show
```

### Options

| Subcommand | Option | Type | Required | Constraints | Default | Description |
| --- | --- | --- | --- | --- | --- | --- |
| `set` | `channel` | channel | Yes | `GuildText` or `GuildAnnouncement` only | — | Channel to post welcome embeds in |
| `clear` | — | — | — | — | — | Disables welcome messages |
| `show` | — | — | — | — | — | Shows the current welcome channel |

### Behavior

1. Re-checks **Manage Server** for every subcommand. Missing → ephemeral
   `❌ You need the **Manage Server** permission to use this.`
2. Dispatches on the subcommand:
   - **`set`** — stores `welcomeChannel = channel.id` for the guild and replies
     ephemerally `✅ Welcome messages will be posted in <#channel>.`
   - **`clear`** — stores `welcomeChannel = null` and replies ephemerally
     `✅ Welcome messages disabled.`
   - **`show`** — replies ephemerally with
     `Current welcome channel: <#id>` or
     "No welcome channel configured. Use `/welcome-message set`."
3. When a member joins and a channel is configured, the `guildMemberAdd` event
   looks up the channel (cache, then fetch) and posts an embed:
   - Title: `👋 Welcome!`
   - Description:
     `Hey <@user>, welcome to **<guild name>**! You are member #<memberCount>.`
   - Thumbnail: the member's avatar at 256 px
   - Color: `COLORS.success` (green)
   - Timestamp: current time

### Examples

```
/welcome-message set channel:#general
```

Configures `#general` as the welcome channel.

```
/welcome-message show
```

Shows the configured channel, or the "No welcome channel configured" message.

```
/welcome-message clear
```

Disables welcome messages; members who join afterwards get no welcome embed.

### Edge cases

- **Channel type restriction:** only guild text and guild announcement channels
  can be selected. Voice, category, forum, stage and thread channels are not
  offered by the option.
- **Per-guild configuration:** each guild has its own setting; configuring one
  guild does not affect another.
- **Persistence:** values are written to `data/settings.json` through
  `store.set`, which reads and writes the file on every access. Values survive
  restarts.
- **Deleted configured channel:** the join event's cache lookup and fetch both
  fail, so no welcome embed is sent (the failure is swallowed/logged). Run
  `/welcome-message set` again to choose a new channel.
- **Bot lacks Send Messages / Embed Links in the target channel:** the welcome
  send fails and is logged; the configuration remains unchanged.
- **The bot does not verify channel permissions when `set` is used** — it only
  stores the ID.
- **Announcement channels:** allowed by the option; sending works only if the
  bot has the necessary permissions in that channel.
- **All subcommands share the same permission guard**, which runs before the
  subcommand dispatch.
- **File-system failure** while reading/writing the store propagates to the
  global error handler and the invoker gets the generic error message.
- **DMs:** guild-only (`setDMPermission(false)`), which is required because the
  setting is guild-scoped.
- **`clear` is idempotent:** clearing when nothing is configured still replies
  with success.

### Permissions

- **Member:** **Manage Server** (Manage Guild). Declared via
  `setDefaultMemberPermissions(ManageGuild)` and re-checked at runtime.
  Missing → `❌ You need the **Manage Server** permission to use this.`
- **Discord-side gating:** hidden from members without Manage Server by default.
- **Guild-only:** yes (`setDMPermission(false)`).
- **Bot:** View Channel and Send Messages / Embed Links in the configured
  welcome channel (checked by Discord at delivery time, not by the command).

---

## See also

- [README.md](../README.md) — setup, deployment, and testing instructions.
- [ARCHITECTURE.md](./ARCHITECTURE.md) — module-by-module implementation notes.
- [REVIEW.md](./REVIEW.md) — code-review findings and follow-ups.
