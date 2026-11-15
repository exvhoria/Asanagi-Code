# bot-stress

A multipurpose Discord bot built with **discord.js v14** (Node.js 18+, ESM).

## Commands

`/help` `/ping` `/userinfo` `/serverinfo` `/serverstats` `/topchannels` `/avatar` `/8ball` `/coinflip` `/dice` `/roll` `/define` `/weather` `/poll` `/repeat` `/remind` `/clear` `/kick` `/ban` `/timeout` `/welcome-message`

- `/help` lists every command sorted alphabetically; with more than 25 commands it switches to paginated embeds with Previous/Next buttons.
- `/coinflip` flips a coin.
- `/dice` rolls dice in NdN notation (e.g. `2d6`, `4d20`, up to 25d1000).
- `/define` looks up a word on [dictionaryapi.dev](https://dictionaryapi.dev) (free, no key).
- `/weather` shows current weather via [open-meteo.com](https://open-meteo.com) — it geocodes the city name first, no API key required.
- `/roll` rolls N dice with a chosen side count (e.g. 6, 20).
- `/serverstats` shows how many messages the bot has tracked per channel since it started collecting stats.
- `/topchannels` shows the leaderboard of the 10 most active channels.
- `/repeat` repeats a text N times (max 5, each repetition max 200 characters).

Welcome messages are posted to a configured channel when a member joins.

### Message stats

Every (non-bot) message posted in a server is counted per channel via the `messageCreate` event. Counts are kept in memory and persisted to `data/stats.json` every **5 minutes**; `/serverstats` shows per-channel totals, `/topchannels` shows the top 10 leaderboard. Deleting `data/stats.json` resets all stats (the file is recreated on the next save).

### Cooldowns

Every command has a simple in-memory cooldown per user per command, defaulting to **3 seconds**. When a user runs a command too soon, the bot replies with an ephemeral message showing the remaining time. Configure the default with `COMMAND_COOLDOWN_SECONDS` in `.env` (set to `0` to disable), and override it per command by adding `cooldown: <seconds>` to a command module.

## Setup

1. **Create the application**
   - Go to the [Discord Developer Portal](https://discord.com/developers/applications) and click **New Application**.
   - Under **General Information**, copy the **Application ID** — this is `CLIENT_ID`.
   - Under **Bot**, click **Reset Token** and copy the token — this is `DISCORD_TOKEN`.
   - Under **Bot → Privileged Gateway Intents**, enable **Server Members Intent** (required for the welcome message event).

2. **Invite the bot to your server**

   Replace `YOUR_CLIENT_ID` with your Application ID:

   ```
   https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&scope=bot%20applications.commands&permissions=1099511721006
   ```

   The permission number grants: View Channels, Kick Members, Ban Members, Manage Server, Manage Messages, Send Messages, Embed Links, Read Message History, Timeout Members. For quick testing you can use `permissions=8` (Administrator) instead.

3. **Install and configure**

   ```bash
   npm install
   cp .env.example .env
   ```

   Edit `.env` and fill in `DISCORD_TOKEN` and `CLIENT_ID`. Optionally set `GUILD_ID` to your test server ID so commands register instantly there (global registration without it can take up to an hour to propagate).

4. **Register the slash commands** (one-time, and again after adding/changing commands)

   ```bash
   npm run deploy
   ```

5. **Start the bot**

   ```bash
   npm start
   ```

## Testing

The pure-logic parts of the bot (dice parsing/rolling, reminder duration parsing, cooldown logic, the randomness behind `/8ball`, `/coinflip`, `/roll`, and message-stats/repeat logic) are covered by a test suite built on `node:test` + `node:assert` — no external dependencies, no Discord connection needed.

```bash
node --test tests/   # or: npm test
```

The pure functions live in `src/lib/` (`dice.js`, `duration.js`, `randomness.js`, `stats.js`) so they can be tested without importing `discord.js`; the slash-command modules in `src/commands/` import from there.

## Project structure

```
bot-stress/
├── src/
│   ├── index.js           # entry point: client, event loading, login
│   ├── deploy.js          # registers slash commands with Discord
│   ├── config.js          # reads .env
│   ├── loadCommands.js    # command handler (recursively loads src/commands/**)
│   ├── colors.js          # shared embed color palette
│   ├── cooldowns.js       # in-memory per-user per-command cooldowns
│   ├── store.js           # tiny JSON store (welcome channel config in data/)
│   ├── statsStore.js      # in-memory message counters, persisted to data/stats.json
│   ├── lib/               # pure logic extracted from commands (dice, durations, randomness, stats)
│   ├── commands/          # one file per slash command
│   └── events/            # ready, interactionCreate, guildMemberAdd, messageCreate
├── tests/                 # node:test suite for the pure-logic modules
├── .env.example
└── package.json
```

## Notes

- Every command execution is wrapped in error handling; failures reply with a friendly ephemeral message instead of crashing.
- Moderation commands (`/clear`, `/kick`, `/ban`, `/timeout`) and `/welcome-message` are hidden from members without the matching permission, and re-checked at runtime.
- `/remind` uses an in-memory `setTimeout`, so reminders are lost if the bot restarts.
- Message stats survive restarts via `data/stats.json`, but messages posted in the last save interval (up to 5 minutes) may be lost.
