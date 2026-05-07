import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, MessageFlags } from 'discord.js';
import { prisma } from '../../database/client';
import { FOOTER_TEXT } from '../../utils/embed';

export const data = new SlashCommandBuilder()
  .setName('abmelden')
  .setDescription('Melde dich für einen Zeitraum ab')
  .addStringOption((o) => o.setName('von').setDescription('Von wann? (z.B. 21.04.2026)').setRequired(true))
  .addStringOption((o) => o.setName('bis').setDescription('Bis wann? (z.B. 25.04.2026)').setRequired(true))
  .addStringOption((o) => o.setName('grund').setDescription('Grund der Abwesenheit').setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: 64 });
  const von = interaction.options.getString('von', true);
  const bis = interaction.options.getString('bis', true);
  const grund = interaction.options.getString('grund', true);
  const guildId = interaction.guild!.id;
  const config = await prisma.guildConfig.findUnique({ where: { guildId } });
  if (!config?.absenceChannel) {
    await interaction.editReply({ content: '❌ Kein Abmelde-Channel konfiguriert.' });
    return;
  }
  const channel = interaction.guild!.channels.cache.get(config.absenceChannel) as any;
  if (!channel) { await interaction.editReply({ content: '❌ Channel nicht gefunden.' }); return; }
  const embed = new EmbedBuilder()
    .setColor(0xfee75c).setTitle('📋 Abmeldung')
    .setDescription(`<@${interaction.user.id}> hat sich abgemeldet.`)
    .addFields(
      { name: '📅 Von', value: von, inline: true },
      { name: '📅 Bis', value: bis, inline: true },
      { name: '📝 Grund', value: grund }
    )
    .setThumbnail(interaction.user.displayAvatarURL())
    .setFooter({ text: FOOTER_TEXT }).setTimestamp();
  await channel.send({ embeds: [embed] });
  await interaction.editReply({ content: `✅ Abmeldung eingetragen in <#${config.absenceChannel}>!` });
}
