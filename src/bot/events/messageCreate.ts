import { Message, EmbedBuilder, TextChannel, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { prisma } from '../../database/client';
import { addXPAndCoins } from '../../utils/xpEconomy';
import { FOOTER_TEXT } from '../../utils/embed';

const xpCooldown = new Map<string, number>();

export const name = 'messageCreate';
export const once = false;

export async function execute(message: Message) {
  if (message.author.bot || !message.guild) return;

  const guildId = message.guild.id;
  const userId  = message.author.id;
  const config  = await prisma.guildConfig.findUnique({ where: { guildId } });
  if (!config) return;

  // --- Image-only channel ---
  const imageOnly: string[] = JSON.parse(config.imageOnlyChannels || '[]');
  if (imageOnly.includes(message.channel.id)) {
    const hasMedia = message.attachments.size > 0 || /\.(png|jpg|jpeg|gif|webp)/i.test(message.content);
    if (!hasMedia) {
      await message.delete().catch(() => {});
      return; // Silent delete — no bot message
    }
  }

  // --- XP & Coins (5s cooldown) ---
  const key = `${userId}-${guildId}`;
  const now = Date.now();
  if (now - (xpCooldown.get(key) ?? 0) > 5000) {
    xpCooldown.set(key, now);
    await addXPAndCoins(userId, guildId, config.xpPerMessage, config.coinsPerMessage, message.guild).catch(() => {});
  }

  // --- Counting ---
  if (config.countingChannel && message.channel.id === config.countingChannel) {
    await handleCounting(message, config);
    return;
  }

  // --- Quiz answer ---
  if (config.quizChannel && message.channel.id === config.quizChannel) {
    await handleQuizAnswer(message);
  }
}

async function handleCounting(message: Message, config: any) {
  const expected = config.countingCurrent + 1;
  const num = parseInt(message.content.trim());
  if (message.author.id === config.countingLastUserId) {
    await message.react('❌');
    await message.reply('⚠️ Du kannst nicht zweimal hintereinander zählen!');
    return;
  }
  if (isNaN(num) || num !== expected) {
    await message.react('❌');
    await message.reply(`❌ Falsch! Die nächste Zahl war **${expected}**. Es geht wieder bei **1** los.`);
    await prisma.guildConfig.update({ where: { guildId: message.guild!.id }, data: { countingCurrent: 0, countingLastUserId: null } });
    await (message.channel as TextChannel).setTopic(`Nächste Zahl: 1`).catch(() => {});
    return;
  }
  await message.react('✅');
  await prisma.guildConfig.update({ where: { guildId: message.guild!.id }, data: { countingCurrent: expected, countingLastUserId: message.author.id } });
  await (message.channel as TextChannel).setTopic(`Nächste Zahl: ${expected + 1}`).catch(() => {});
}

async function handleQuizAnswer(message: Message) {
  const guildId = message.guild!.id;
  const activeQuiz = await prisma.activeQuiz.findUnique({ where: { guildId } });
  if (!activeQuiz) return;

  const question = await prisma.quizQuestion.findUnique({ where: { id: activeQuiz.questionId } });
  if (!question) return;

  if (message.content.trim().toLowerCase() !== question.answer.toLowerCase()) return;

  await message.react('✅');
  const embed = new EmbedBuilder()
    .setColor(0x22c55e)
    .setTitle('🎉 Richtig!')
    .setDescription(
      `<@${message.author.id}> hat es erraten!\n\n` +
      `**Emoji:** ${question.emoji}\n**Antwort:** ${question.answer}\n\n` +
      `+**${question.xpReward} XP** und **${question.coinReward} 🪙**`
    )
    .setFooter({ text: FOOTER_TEXT })
    .setTimestamp();

  await (message.channel as TextChannel).send({ embeds: [embed] });
  await addXPAndCoins(message.author.id, guildId, question.xpReward, question.coinReward, message.guild!).catch(() => {});
  await prisma.activeQuiz.delete({ where: { guildId } });
  setTimeout(() => postNewQuiz(guildId, message.client), 30000);
}

export async function postNewQuiz(guildId: string, client: any) {
  const config = await prisma.guildConfig.findUnique({ where: { guildId } });
  if (!config?.quizChannel) return;
  const questions = await prisma.quizQuestion.findMany({ where: { guildId, active: true } });
  if (!questions.length) return;

  const question = questions[Math.floor(Math.random() * questions.length)];
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;
  const channel = guild.channels.cache.get(config.quizChannel) as TextChannel;
  if (!channel) return;

  // Build letter hint buttons (show first letter of each word)
  const words = question.answer.split(' ').filter(Boolean);
  const firstLetters = words.map((w: string) => w[0].toUpperCase());
  const uniqueLetters = [...new Set<string>(firstLetters)].slice(0, 3);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...uniqueLetters.map((letter: string) =>
      new ButtonBuilder()
        .setCustomId(`quiz_letter_${letter}_${question.id}`)
        .setLabel(letter)
        .setStyle(ButtonStyle.Secondary)
    ),
    new ButtonBuilder().setCustomId(`quiz_hint_btn_${question.id}`).setLabel('💡 Tipp').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`quiz_skip_btn_${question.id}`).setLabel('⏭️ Skip').setStyle(ButtonStyle.Danger),
  );

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🧩 Emoji Quiz!')
    .setDescription(
      `Was bedeutet diese Emoji-Kombination?\n\n# ${question.emoji}\n\n` +
      `Schreibe deine Antwort in den Chat!\n` +
      `Oder nutze die Buttons für Buchstaben-Tipps.`
    )
    .setFooter({ text: `${FOOTER_TEXT} • ${question.xpReward} XP | ${question.coinReward} Coins` })
    .setTimestamp();

  const msg = await channel.send({ embeds: [embed], components: [row] });

  await prisma.activeQuiz.upsert({
    where: { guildId },
    update: { questionId: question.id, messageId: msg.id, hintsUsed: 0, startedAt: new Date() },
    create: { guildId, questionId: question.id, messageId: msg.id },
  });
}
