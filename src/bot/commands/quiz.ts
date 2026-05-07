import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, MessageFlags } from 'discord.js';
import { prisma } from '../../database/client';
import { addXP, addCoins } from '../../utils/xpEconomy';

// --- /quiz-hint ---
export const quizHintData = new SlashCommandBuilder()
  .setName('quiz-hint')
  .setDescription('Fordere einen Tipp für das aktuelle Emoji-Quiz an');

export async function quizHintExecute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: 64 });

  const guildId = interaction.guild!.id;
  const activeQuiz = await prisma.activeQuiz.findUnique({ where: { guildId } });
  if (!activeQuiz) {
    await interaction.editReply({ content: '❌ Gerade kein aktives Quiz.' });
    return;
  }

  const question = await prisma.quizQuestion.findUnique({ where: { id: activeQuiz.questionId } });
  if (!question?.hint) {
    await interaction.editReply({ content: '💡 Für diese Frage gibt es keinen Tipp.' });
    return;
  }

  await interaction.editReply({ content: `💡 **Tipp:** ${question.hint}` });
}

// --- /quiz-skip ---
export const quizSkipData = new SlashCommandBuilder()
  .setName('quiz-skip')
  .setDescription('Überspringe die aktuelle Quiz-Frage');

export async function quizSkipExecute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const guildId = interaction.guild!.id;
  const activeQuiz = await prisma.activeQuiz.findUnique({ where: { guildId } });
  if (!activeQuiz) {
    await interaction.editReply({ content: '❌ Gerade kein aktives Quiz.' });
    return;
  }

  const question = await prisma.quizQuestion.findUnique({ where: { id: activeQuiz.questionId } });
  await prisma.activeQuiz.delete({ where: { guildId } });

  await interaction.editReply({
    content: `⏭️ Frage übersprungen! Die Antwort wäre **${question?.answer ?? '???'}** gewesen.\nNächste Frage kommt in 30 Sekunden...`,
  });

  // Post next quiz after 30s
  setTimeout(async () => {
    const config = await prisma.guildConfig.findUnique({ where: { guildId } });
    if (!config?.quizChannel) return;
    const questions = await prisma.quizQuestion.findMany({ where: { guildId, active: true } });
    if (!questions.length) return;
    const newQ = questions[Math.floor(Math.random() * questions.length)];
    const guild = interaction.guild!;
    const channel = guild.channels.cache.get(config.quizChannel) as any;
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🧩 Emoji Quiz!')
      .setDescription(
        `Was bedeutet diese Emoji-Kombination?\n\n# ${newQ.emoji}\n\nSchreibe deine Antwort in diesen Channel!\nNutze \`/quiz-hint\` für einen Tipp oder \`/quiz-skip\` zum Überspringen.`
      )
      .setFooter({ text: `Belohnung: ${newQ.xpReward} XP | ${newQ.coinReward} Coins` })
      .setTimestamp();

    const msg = await channel.send({ embeds: [embed] });
    await prisma.activeQuiz.create({
      data: { guildId, questionId: newQ.id, messageId: msg.id },
    });
  }, 30000);
}
