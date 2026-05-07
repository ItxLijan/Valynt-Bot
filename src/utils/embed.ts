import { EmbedBuilder, ColorResolvable } from 'discord.js';

export const FOOTER_TEXT = 'Developed by ItxVance_';

export function botEmbed(color: ColorResolvable = 0x5865f2): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(color)
    .setFooter({ text: FOOTER_TEXT });
}
