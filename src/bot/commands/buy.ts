import {
  SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder,
  MessageFlags, AutocompleteInteraction
} from 'discord.js';
import { prisma } from '../../database/client';
import { FOOTER_TEXT } from '../../utils/embed';
import { logPurchase } from '../events/logEvents';

export const data = new SlashCommandBuilder()
  .setName('buy')
  .setDescription('Kaufe ein Item aus dem Shop')
  .addStringOption((opt) =>
    opt.setName('item').setDescription('Name des Items').setRequired(true).setAutocomplete(true)
  );

export async function autocomplete(interaction: AutocompleteInteraction) {
  try {
    const guildId = interaction.guild?.id;
    if (!guildId) { await interaction.respond([]); return; }
    const focused = interaction.options.getFocused()?.toLowerCase() ?? '';
    const items = await prisma.shopItem.findMany({ where: { guildId, active: true }, take: 25 });
    const filtered = items
      .filter((i) => focused === '' || i.name.toLowerCase().includes(focused))
      .map((i) => ({ name: `${i.emoji ?? '📦'} ${i.name} — ${i.price} 🪙`.slice(0, 100), value: i.id }));
    await interaction.respond(filtered.length ? filtered : [{ name: 'Keine Items verfügbar', value: 'none' }]);
  } catch { await interaction.respond([]).catch(() => {}); }
}

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: 64 });
  const guildId = interaction.guild!.id;
  const userId = interaction.user.id;
  const itemValue = interaction.options.getString('item', true);

  if (itemValue === 'none') { await interaction.editReply({ content: '❌ Keine Items verfügbar.' }); return; }

  const item = await prisma.shopItem.findFirst({
    where: { guildId, active: true, OR: [{ id: itemValue }, { name: { contains: itemValue } }] },
  });
  if (!item) { await interaction.editReply({ content: '❌ Item nicht gefunden.' }); return; }

  const user = await prisma.userData.findUnique({ where: { userId_guildId: { userId, guildId } } });
  if (!user || user.coins < item.price) {
    await interaction.editReply({ content: `❌ Nicht genug Coins! Preis: **${item.price} 🪙**, Du hast: **${user?.coins ?? 0} 🪙**` });
    return;
  }

  await prisma.userData.update({ where: { userId_guildId: { userId, guildId } }, data: { coins: { decrement: item.price } } });
  await prisma.shopPurchase.create({ data: { guildId, userId, itemId: item.id, itemName: item.name } });

  // Log purchase
  await logPurchase(guildId, interaction.guild!, userId, item.name, item.price).catch(() => {});

  const embed = new EmbedBuilder()
    .setColor(0x57f287).setTitle('✅ Kauf erfolgreich!')
    .setDescription(`Du hast **${item.emoji ?? ''} ${item.name}** für **${item.price} 🪙** gekauft!\n\nEin Team-Mitglied wird dir das Item ingame übergeben. 📬`)
    .setFooter({ text: FOOTER_TEXT }).setTimestamp();
  await interaction.editReply({ embeds: [embed] });
}
