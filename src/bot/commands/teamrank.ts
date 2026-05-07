import {
  SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder,
  PermissionFlagsBits, MessageFlags, AutocompleteInteraction, Role,
} from 'discord.js';
import { prisma } from '../../database/client';
import { FOOTER_TEXT } from '../../utils/embed';

export const data = new SlashCommandBuilder()
  .setName('teamrank')
  .setDescription('Befördere ein Teammitglied')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addUserOption((o) => o.setName('user').setDescription('Das Teammitglied').setRequired(true))
  .addStringOption((o) =>
    o.setName('von-rolle')
      .setDescription('Aktuelle Rolle')
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addStringOption((o) =>
    o.setName('zu-rolle')
      .setDescription('Neue Rolle')
      .setRequired(true)
      .setAutocomplete(true)
  );

export async function autocomplete(interaction: AutocompleteInteraction) {
  try {
    const focused = interaction.options.getFocused().toLowerCase();
    const roles = interaction.guild!.roles.cache
      .filter((r: Role) => !r.managed && r.id !== interaction.guild!.id)
      .sort((a: Role, b: Role) => b.position - a.position);

    const filtered = roles
      .filter((r: Role) => r.name.toLowerCase().includes(focused))
      .first(25)
      .map((r: Role) => ({
        name: `${r.name}`.slice(0, 100),
        value: r.id,
      }));

    await interaction.respond(filtered);
  } catch {
    await interaction.respond([]).catch(() => {});
  }
}

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: 64 });

  const target = interaction.options.getUser('user', true);
  const vonRolleId = interaction.options.getString('von-rolle', true);
  const zuRolleId = interaction.options.getString('zu-rolle', true);
  const guildId = interaction.guild!.id;

  const vonRolle = interaction.guild!.roles.cache.get(vonRolleId);
  const zuRolle = interaction.guild!.roles.cache.get(zuRolleId);

  const config = await prisma.guildConfig.findUnique({ where: { guildId } });
  if (!config?.teamRankChannel) {
    await interaction.editReply({ content: '❌ Kein Team-Rank-Channel konfiguriert. Bitte im Dashboard einstellen.' });
    return;
  }

  const channel = interaction.guild!.channels.cache.get(config.teamRankChannel) as any;
  if (!channel) { await interaction.editReply({ content: '❌ Channel nicht gefunden.' }); return; }

  const member = await interaction.guild!.members.fetch(target.id).catch(() => null);

  // Assign new role and remove old role if member is in server
  if (member) {
    if (vonRolle) await member.roles.remove(vonRolle).catch(() => {});
    if (zuRolle) await member.roles.add(zuRolle).catch(() => {});
  }

  const embed = new EmbedBuilder()
    .setColor(0xf0a500)
    .setTitle('🎖️ Team Beförderung!')
    .setDescription(`**${member?.displayName ?? target.username}** wurde befördert!`)
    .addFields(
      { name: '👤 Mitglied', value: `<@${target.id}>`, inline: true },
      { name: '📉 Von Rolle', value: vonRolle ? `<@&${vonRolle.id}> (${vonRolle.name})` : `ID: ${vonRolleId}`, inline: true },
      { name: '📈 Zu Rolle', value: zuRolle ? `<@&${zuRolle.id}> (${zuRolle.name})` : `ID: ${zuRolleId}`, inline: true },
      { name: '👮 Befördert von', value: `<@${interaction.user.id}>`, inline: true },
    )
    .setThumbnail(target.displayAvatarURL())
    .setFooter({ text: FOOTER_TEXT })
    .setTimestamp();

  await channel.send({ embeds: [embed] });
  await interaction.editReply({ content: `✅ Beförderung gepostet in <#${config.teamRankChannel}>! Rollen wurden automatisch aktualisiert.` });
}
