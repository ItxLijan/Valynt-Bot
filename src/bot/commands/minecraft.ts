import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { prisma } from '../../database/client';

export const data = new SlashCommandBuilder()
  .setName('minecraft')
  .setDescription('Minecraft-Befehle')
  .addSubcommand((sub) =>
    sub
      .setName('set')
      .setDescription('Trage deinen Minecraft-Account ein')
      .addStringOption((o) => o.setName('username').setDescription('Dein Minecraft-Username').setRequired(true))
      .addStringOption((o) =>
        o.setName('version')
          .setDescription('Java oder Bedrock?')
          .setRequired(true)
          .addChoices({ name: 'Java', value: 'java' }, { name: 'Bedrock', value: 'bedrock' })
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('info')
      .setDescription('Zeige Minecraft-Infos eines Users')
      .addUserOption((o) => o.setName('user').setDescription('User (Admin only)').setRequired(false))
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: 64 });

  const guildId = interaction.guild!.id;
  const sub = interaction.options.getSubcommand();

  if (sub === 'set') {
    const username = interaction.options.getString('username', true);
    const version = interaction.options.getString('version', true);

    await prisma.userData.upsert({
      where: { userId_guildId: { userId: interaction.user.id, guildId } },
      update: { mcUsername: username, mcVersion: version },
      create: { userId: interaction.user.id, guildId, mcUsername: username, mcVersion: version },
    });

    await interaction.editReply({
      content: `✅ Gespeichert! Username: **${username}** | Version: **${version === 'java' ? '☕ Java' : '🪨 Bedrock'}**`,
    });
  } else if (sub === 'info') {
    const target = interaction.options.getUser('user');

    // If looking up someone else, require admin
    if (target && target.id !== interaction.user.id) {
      const member = await interaction.guild!.members.fetch(interaction.user.id);
      if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
        await interaction.editReply({ content: '❌ Nur Admins können andere User nachschlagen.' });
        return;
      }
    }

    const lookupId = target?.id ?? interaction.user.id;
    const userData = await prisma.userData.findUnique({
      where: { userId_guildId: { userId: lookupId, guildId } },
    });

    if (!userData?.mcUsername) {
      await interaction.editReply({
        content: `❌ <@${lookupId}> hat keinen Minecraft-Account eingetragen.`,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x5d9e4f)
      .setTitle('⛏️ Minecraft Account')
      .addFields(
        { name: '👤 Discord', value: `<@${lookupId}>`, inline: true },
        { name: '🎮 Ingame Name', value: `**${userData.mcUsername}**`, inline: true },
        { name: '📦 Version', value: userData.mcVersion === 'java' ? '☕ Java' : '🪨 Bedrock', inline: true }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
}
