import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, MessageFlags } from 'discord.js';
import { prisma } from '../../database/client';
import { calculateLevel, xpForLevel } from '../../utils/xpEconomy';

export const data = new SlashCommandBuilder()
  .setName('rank')
  .setDescription('Zeigt deinen aktuellen Level und XP an (nur für dich sichtbar)');

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: 64 });

  const user = await prisma.userData.findUnique({
    where: { userId_guildId: { userId: interaction.user.id, guildId: interaction.guild!.id } },
  });

  const xp = user?.xp ?? 0;
  const level = user?.level ?? 0;
  const nextLevelXp = xpForLevel(level + 1);
  const progress = Math.min(Math.floor((xp / nextLevelXp) * 100), 100);
  const bar = '█'.repeat(Math.floor(progress / 10)) + '░'.repeat(10 - Math.floor(progress / 10));

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`📊 Dein Rang`)
    .setDescription(`<@${interaction.user.id}>`)
    .addFields(
      { name: '⭐ Level', value: `**${level}**`, inline: true },
      { name: '✨ XP', value: `**${xp}** / ${nextLevelXp}`, inline: true },
      { name: '📈 Fortschritt', value: `\`[${bar}] ${progress}%\`` }
    )
    .setThumbnail(interaction.user.displayAvatarURL())
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
