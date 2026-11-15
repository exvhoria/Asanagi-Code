import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Client, GatewayIntentBits } from "discord.js";
import { config } from "./config.js";
import { loadCommands } from "./loadCommands.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
  ],
});

client.commands = await loadCommands();

/**
 * Checks whether a directory entry is a JavaScript event module.
 *
 * @param {string} f - Directory entry name.
 * @returns {boolean} True when the entry is an event module.
 * @throws {never} Pure string check.
 * @example
 * isEventModule("ready.js"); // true
 * isEventModule("notes.txt"); // false
 */
function isEventModule(f) {
  return f.endsWith(".js");
}

/**
 * Creates the stable listener passed to `client.on` / `client.once`. Keeping
 * one reference per event allows the underlying function to be forwarded
 * without changing `this` semantics.
 *
 * @param {{ name: string, execute: (...args: unknown[]) => Promise<void> | void }} event - The event module being registered.
 * @returns {(...args: unknown[]) => Promise<void> | void} A handler that forwards all arguments to `event.execute`.
 * @throws {never} Only constructs a function; any error occurs when it is invoked.
 * @example
 * const handler = makeHandler(event);
 * client.once(event.name, handler);
 */
function makeHandler(event) {
  /**
   * Wraps the event's execute function in a stable handler reference so it
   * can be registered with client.once or client.on.
   *
   * @param {...unknown} args - Event payload arguments forwarded to event.execute.
   * @returns {Promise<void> | void} The result of event.execute.
   * @throws {Error} Whatever event.execute throws, propagated to the discord.js client.
   * @example
   * client.on(event.name, handler);
   */
  const handler = (...args) => event.execute(...args);
  return handler;
}

/**
 * Logs an unhandled promise rejection without terminating the process.
 *
 * @param {unknown} error - The unhandled rejection reason.
 * @returns {void}
 * @throws {never} Only writes to stderr.
 * @example
 * process.on("unhandledRejection", logUnhandledRejection);
 */
function logUnhandledRejection(error) {
  console.error("[process] Unhandled rejection:", error);
}

/**
 * Logs a client-level error (for example a WebSocket failure) so an unhandled
 * EventEmitter "error" event cannot terminate the process.
 *
 * @param {Error} error - The error emitted by the client.
 * @returns {void}
 * @throws {never} Only writes to stderr.
 * @example
 * client.on("error", logClientError);
 */
function logClientError(error) {
  console.error("[client] Error:", error);
}

/**
 * Handles a failed client login by logging the error and exiting.
 *
 * @param {Error} error - Login failure (invalid token, network error, etc.).
 * @returns {void}
 * @throws {never} Calls process.exit(1) after logging.
 * @example
 * client.login(config.token).catch(exitOnLoginFailure);
 */
function exitOnLoginFailure(error) {
  console.error("[index] Failed to log in:", error);
  process.exit(1);
}

const eventsDir = path.join(__dirname, "events");
for (const file of fs.readdirSync(eventsDir).filter(isEventModule)) {
  let event;
  try {
    event = (await import(pathToFileURL(path.join(eventsDir, file)).href)).default;
  } catch (error) {
    console.warn(`[events] Skipped ${file} (import failed: ${error?.message ?? error})`);
    continue;
  }

  if (!event?.name || typeof event.execute !== "function") {
    console.warn(`[events] Skipped ${file} (missing "name" or "execute")`);
    continue;
  }

  const handler = makeHandler(event);
  if (event.once) client.once(event.name, handler);
  else client.on(event.name, handler);
  console.log(`[events] Loaded ${event.name}`);
}

process.on("unhandledRejection", logUnhandledRejection);
client.on("error", logClientError);

client.login(config.token).catch(exitOnLoginFailure);
