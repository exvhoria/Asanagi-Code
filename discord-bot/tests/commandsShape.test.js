import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SlashCommandBuilder } from "discord.js";

const commandsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "commands");

function collectCommandFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectCommandFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".js")) files.push(full);
  }
  return files.sort();
}

const commandFiles = collectCommandFiles(commandsDir);

test("the commands directory contains at least one command file", () => {
  assert.ok(commandFiles.length > 0, "expected command files under src/commands");
});

for (const file of commandFiles) {
  const relative = path.relative(commandsDir, file).split(path.sep).join("/");
  const expectedName = path.basename(file, ".js");

  test(`command ${relative} exports a valid slash command shape`, async () => {
    const module = await import(pathToFileURL(file).href);
    const command = module.default;

    assert.equal(typeof command, "object", "default export must be an object");
    assert.ok(command !== null, "default export must not be null");

    assert.ok(
      command.data instanceof SlashCommandBuilder,
      "data must be a SlashCommandBuilder instance"
    );
    assert.equal(typeof command.data.name, "string", "data.name must be a string");
    assert.ok(command.data.name.trim().length > 0, "data.name must not be empty");
    assert.equal(typeof command.data.description, "string", "data.description must be a string");
    assert.ok(command.data.description.trim().length > 0, "data.description must not be empty");

    assert.equal(typeof command.execute, "function", "execute must be a function");

    const json = command.data.toJSON();
    assert.equal(json.name, command.data.name);
    assert.equal(json.description, command.data.description);
    assert.match(json.name, /^[-_a-z0-9]{1,32}$/, "name must be a valid Discord command name");
    assert.ok(json.description.length <= 100, "description must fit Discord's 100 character limit");
    assert.equal(json.name, expectedName, "command name must match its file name");
  });
}
