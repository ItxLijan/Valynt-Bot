import { VoiceState } from 'discord.js';
import { prisma } from '../../database/client';

export const name = 'voiceStateUpdate';
export const once = false;

export async function execute(oldState: VoiceState, newState: VoiceState) {
  const userId = newState.member?.id ?? oldState.member?.id;
  if (!userId || newState.member?.user.bot) return;

  const guildId = newState.guild.id;

  // User joined a voice channel
  if (!oldState.channel && newState.channel) {
    await prisma.voiceSession.upsert({
      where: { userId_guildId: { userId, guildId } },
      update: { channelId: newState.channel.id, joinedAt: new Date() },
      create: { userId, guildId, channelId: newState.channel.id },
    });
  }

  // User moved channels
  if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id) {
    await prisma.voiceSession.update({
      where: { userId_guildId: { userId, guildId } },
      data: { channelId: newState.channel.id },
    }).catch(() => {});
  }

  // User left voice
  if (oldState.channel && !newState.channel) {
    await prisma.voiceSession.delete({
      where: { userId_guildId: { userId, guildId } },
    }).catch(() => {});
  }
}
