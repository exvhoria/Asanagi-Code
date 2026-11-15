import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Absolute path of the src/commands directory scanned for command modules. */
const commandsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "commands");

/**
 * Recursively collects the paths of all .js files under a directory.
 *
 * @param {string} dir - Directory to scan.
 * @returns {string[]} Absolute paths of all .js files, depth-first.
 * @throws {Error} When the directory cannot be read.
 * @example
 * collectCommandFiles("./src/commands"); // e.g. ["/abs/src/commands/ping.js", ...]
 */
function collectCommandFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectCommandFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".js")) files.push(full);
  }
  return files;
}

/**
 * Loads every command module under src/commands and validates its shape.
 * Commands missing "data.name" or "execute", failing to import, or duplicating
 * an already-loaded command name, are skipped with a warning.
 *
 * @returns {Promise<Map<string, { data: { name: string }, execute: (interaction: import("discord.js").Interaction) => Promise<void> }>>} Map of command name to loaded command module.
 * @throws {Error} When the commands directory cannot be read.
 * @example
 * client.commands = await loadCommands();
 */
export async function loadCommands() {
  const commands = new Map();

  for (const file of collectCommandFiles(commandsDir)) {
    const relative = path.relative(commandsDir, file);
    let module;
    try {
      module = await import(pathToFileURL(file).href);
    } catch (error) {
      console.warn(`[commands] Skipped ${relative} (import failed: ${error?.message ?? error})`);
      continue;
    }
    const command = module.default;

    if (!command?.data?.name || typeof command.execute !== "function") {
      console.warn(`[commands] Skipped ${relative} (missing "data" or "execute")`);
      continue;
    }
    if (commands.has(command.data.name)) {
      console.warn(`[commands] Skipped ${relative} (duplicate command name "${command.data.name}")`);
      continue;
    }
    commands.set(command.data.name, command);
  }

  console.log(`[commands] Loaded ${commands.size} command(s).`);
  return commands;
}
