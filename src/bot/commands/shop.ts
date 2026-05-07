import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { prisma } from '../../database/client';

export const data = new SlashCommandBuilder()
  .setName('shop')
  .setDescription('Zeigt den Shop an');

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const guildId = interaction.guild!.id;
  const items = await prisma.shopItem.findMany({ where: { guildId, active: true } });

  if (!items.length) {
    await interaction.editReply({ content: '🛒 Der Shop ist aktuell leer.' });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0xf0a500)
    .setTitle('🛒 Shop')
    .setDescription('Kaufe Items mit deinen Coins!\nNutze `/buy <item-name>` um ein Item zu kaufen.')
    .addFields(
      items.map((item) => ({
        name: `${item.emoji ?? '📦'} ${item.name} — ${item.price} 🪙`,
        value: item.description,
        inline: false,
      }))
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
