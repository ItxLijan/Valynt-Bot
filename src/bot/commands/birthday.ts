import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, MessageFlags } from 'discord.js';
import { prisma } from '../../database/client';

export const data = new SlashCommandBuilder()
  .setName('birthday')
  .setDescription('Geburtstags-Befehle')
  .addSubcommand((sub) =>
    sub
      .setName('set')
      .setDescription('Setze deinen Geburtstag')
      .addIntegerOption((o) => o.setName('monat').setDescription('Monat (1-12)').setRequired(true).setMinValue(1).setMaxValue(12))
      .addIntegerOption((o) => o.setName('tag').setDescription('Tag (1-31)').setRequired(true).setMinValue(1).setMaxValue(31))
  )
  .addSubcommand((sub) =>
    sub.setName('list').setDescription('Zeigt alle Geburtstage an')
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: 64 });

  const guildId = interaction.guild!.id;
  const sub = interaction.options.getSubcommand();

  if (sub === 'set') {
    const month = interaction.options.getInteger('monat', true);
    const day = interaction.options.getInteger('tag', true);
    const birthday = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    await prisma.userData.upsert({
      where: { userId_guildId: { userId: interaction.user.id, guildId } },
      update: { birthday },
      create: { userId: interaction.user.id, guildId, birthday },
    });

    await interaction.editReply({
      content: `🎂 Dein Geburtstag wurde auf den **${day}.${month}.** gesetzt!`,
    });
  } else if (sub === 'list') {
    const users = await prisma.userData.findMany({
      where: { guildId, birthday: { not: null } },
      orderBy: { birthday: 'asc' },
    });

    if (!users.length) {
      await interaction.editReply({ content: '📅 Noch keine Geburtstage eingetragen.' });
      return;
    }

    const lines = await Promise.all(
      users.map(async (u) => {
        const member = await interaction.guild!.members.fetch(u.userId).catch(() => null);
        const name = member?.displayName ?? u.userId;
        const [m, d] = u.birthday!.split('-');
        return `🎂 **${name}** — ${d}.${m}.`;
      })
    );

    const embed = new EmbedBuilder()
      .setColor(0xff73fa)
      .setTitle('🎂 Geburtstagskalender')
      .setDescription(lines.join('\n'))
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
}
