import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import { COLORS } from "../colors.js";

/** Maximum number of commands listed per help page. */
const PAGE_SIZE = 25;
/** How long the help pagination button collector stays active, in milliseconds. */
const COLLECTOR_MS = 120_000;

/**
 * Swallows an error from an optional reply or component update so the help
 * collector keeps running.
 *
 * @returns {void}
 * @throws {never} Never throws.
 * @example
 * button.reply(payload).catch(ignoreError);
 */
function ignoreError() {}

export default {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("List every command this bot offers"),
  /**
   * Handle the `/help` slash command: lists every loaded command in paged embeds.
   * With a single page it replies directly; otherwise it attaches Previous/Next
   * buttons and a button collector that lets only the original invoker flip pages
   * until the collector times out.
   *
   * @param {import("discord.js").ChatInputCommandInteraction} interaction - The slash-command interaction.
   * @returns {Promise<void>} Resolves once the initial reply is sent; page updates continue via the collector.
   * @throws {import("discord.js").DiscordAPIError} If the initial reply or fetch fails.
   * @example
   * // Triggered when a user runs /help in Discord.
   */
  async execute(interaction) {
    const commands = [...interaction.client.commands.values()].sort(
      /**
       * Sorts commands alphabetically by name.
       *
       * @param {{ data: { name: string, description: string } }} a - The first command being compared.
       * @param {{ data: { name: string, description: string } }} b - The second command being compared.
       * @returns {number} Negative, zero, or positive depending on the name comparison order.
       * @throws {never} Pure string comparison.
       * @example
       * // Used as the comparator passed to Array#sort below.
       */
      (a, b) => a.data.name.localeCompare(b.data.name)
    );

    if (commands.length === 0) {
      return interaction.reply({ content: "No commands loaded.", ephemeral: true });
    }

    const pages = [];
    for (let i = 0; i < commands.length; i += PAGE_SIZE) {
      pages.push(
        commands
          .slice(i, i + PAGE_SIZE)
          .map(
            /**
             * Formats one command as a markdown list line.
             *
             * @param {{ data: { name: string, description: string } }} c - The command being formatted.
             * @returns {string} A markdown line describing the command.
             * @throws {never} String interpolation only.
             * @example
             * // Applied to each command on the current page.
             */
            (c) => `**/${c.data.name}** — ${c.data.description}`
          )
          .join("\n")
      );
    }

    /**
     * Build the base embed used for every help page (title and brand color only).
     *
     * @returns {import("discord.js").EmbedBuilder} A fresh, unpaged base embed.
     * @throws {never} Only constructs an embed builder.
     * @example
     * // Reused as the starting point for each page:
     * const embed = base().setDescription(pages[page]);
     */
    const base = () =>
      new EmbedBuilder().setTitle("📖 Commands").setColor(COLORS.brand);
    /**
     * Build the embed for a specific help page, including its footer.
     *
     * @param {number} page - Zero-based index of the page to render.
     * @returns {import("discord.js").EmbedBuilder} The fully configured embed for that page.
     * @throws {TypeError} If `page` is outside the `pages` array (setDescription receives undefined).
     * @example
     * // Shows page 2 (index 1):
     * interaction.editReply({ embeds: [embedFor(1)] });
     */
    const embedFor = (page) =>
      base()
        .setDescription(pages[page])
        .setFooter({ text: `Page ${page + 1}/${pages.length} • ${commands.length} commands` });

    if (pages.length === 1) {
      return interaction.reply({ embeds: [embedFor(0)] });
    }

    /**
     * Build the action row with Previous/Next buttons for the given page,
     * disabling each button when its edge (first/last page) is reached, or
     * both when forceDisabled is true (used when the collector ends).
     *
     * @param {number} page - Zero-based index of the currently displayed page.
     * @param {boolean} [forceDisabled=false] - When true, both buttons are disabled.
     * @returns {import("discord.js").ActionRowBuilder} The action row containing the two navigation buttons.
     * @throws {never} Only constructs discord.js builders.
     * @example
     * // Rebuilds the row after a page change:
     * await button.update({ components: [row(page)] });
     */
    const row = (page, forceDisabled = false) =>
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("help_prev")
          .setLabel("◀ Previous")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(forceDisabled || page === 0),
        new ButtonBuilder()
          .setCustomId("help_next")
          .setLabel("Next ▶")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(forceDisabled || page === pages.length - 1)
      );

    let page = 0;
    await interaction.reply({ embeds: [embedFor(page)], components: [row(page)] });
    const message = await interaction.fetchReply();

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: COLLECTOR_MS,
    });

    collector.on(
      "collect",
      /**
       * Handles a navigation button press: rejects presses from other users,
       * moves the page within bounds, and updates the message.
       *
       * @param {import("discord.js").ButtonInteraction} button - The button press interaction.
       * @returns {Promise<void>} Resolves once the page is updated or the rejection reply is sent.
       * @throws {never} Update/reply failures are caught and suppressed by the `.catch` handlers.
       * @example
       * // Runs whenever a user presses Previous or Next on the help embed.
       */
      async (button) => {
        if (button.user.id !== interaction.user.id) {
          return button
            .reply({ content: "Only the person who ran `/help` can switch pages.", ephemeral: true })
            .catch(ignoreError);
        }
        page =
          button.customId === "help_next"
            ? Math.min(page + 1, pages.length - 1)
            : Math.max(page - 1, 0);
        await button.update({ embeds: [embedFor(page)], components: [row(page)] }).catch(ignoreError);
      }
    );

    collector.on(
      "end",
      /**
       * Disables both navigation buttons when the collector expires.
       *
       * @returns {void}
       * @throws {never} Edit failures are suppressed by the `.catch` handler.
       * @example
       * // Runs automatically after COLLECTOR_MS or when the collector ends.
       */
      () => {
        interaction.editReply({ components: [row(page, true)] }).catch(ignoreError);
      }
    );
  },
};
