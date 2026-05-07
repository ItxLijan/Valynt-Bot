import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, MessageFlags } from 'discord.js';
import { prisma } from '../../database/client';

export const data = new SlashCommandBuilder()
  .setName('coins')
  .setDescription('Zeigt deine Coins und deinen Platz an (nur für dich sichtbar)');

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: 64 });

  const guildId = interaction.guild!.id;
  const userId = interaction.user.id;

  const user = await prisma.userData.findUnique({
    where: { userId_guildId: { userId, guildId } },
  });

  const coins = user?.coins ?? 0;

  // Calculate rank
  const rank = await prisma.userData.count({
    where: { guildId, coins: { gt: coins } },
  });

  const embed = new EmbedBuilder()
    .setColor(0xf0a500)
    .setTitle('💰 Dein Kontostand')
    .setDescription(`<@${userId}>`)
    .addFields(
      { name: '🪙 Coins', value: `**${coins}**`, inline: true },
      { name: '🏆 Platz', value: `**#${rank + 1}**`, inline: true }
    )
    .setThumbnail(interaction.user.displayAvatarURL())
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
