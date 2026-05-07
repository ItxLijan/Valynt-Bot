import {
  SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder,
  MessageFlags, PermissionFlagsBits, TextChannel,
} from 'discord.js';
import { prisma } from '../../database/client';
import { FOOTER_TEXT } from '../../utils/embed';

export const data = new SlashCommandBuilder()
  .setName('teamrankup')
  .setDescription('Verkündet einen Rang-Aufstieg im Team')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addUserOption((o) => o.setName('user').setDescription('Team-Mitglied').setRequired(true))
  .addStringOption((o) => o.setName('aktuell').setDescription('Aktueller Rang').setRequired(true))
  .addStringOption((o) => o.setName('neu').setDescription('Neuer Rang').setRequired(true))
  .addStringOption((o) => o.setName('nachricht').setDescription('Optionale Nachricht / Begründung'));

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: 64 });

  const target = interaction.options.getUser('user', true);
  const currentRank = interaction.options.getString('aktuell', true);
  const newRank = interaction.options.getString('neu', true);
  const extraMsg = interaction.options.getString('nachricht') ?? '';
  const guildId = interaction.guild!.id;

  const config = await prisma.guildConfig.findUnique({ where: { guildId } });

  const embed = new EmbedBuilder()
    .setColor(0xf0a500)
    .setTitle('🎖️ Team Rang-Aufstieg!')
    .setDescription(
      `Herzlichen Glückwunsch <@${target.id}>! 🎉\n\n` +
      `${currentRank} **→** ${newRank}\n\n` +
      (extraMsg ? `*${extraMsg}*` : '')
    )
    .setThumbnail(target.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: '👤 Mitglied', value: `<@${target.id}>`, inline: true },
      { name: '📉 Vorher', value: currentRank, inline: true },
      { name: '📈 Jetzt', value: newRank, inline: true }
    )
    .setFooter({ text: `Befördert von ${interaction.user.tag} • ${FOOTER_TEXT}` })
    .setTimestamp();

  // Send to configured team rank channel
  const channelId = config?.teamRankChannel;
  let sent = false;

  if (channelId) {
    const ch = interaction.guild!.channels.cache.get(channelId) as TextChannel;
    if (ch) {
      await ch.send({ embeds: [embed] });
      sent = true;
    }
  }

  if (!sent) {
    // Fallback: send to current channel
    await (interaction.channel as TextChannel)?.send({ embeds: [embed] }).catch(() => {});
  }

  await interaction.editReply({
    content: `✅ Rang-Aufstieg für <@${target.id}> verkündet! ${currentRank} → **${newRank}**`,
  });
}
