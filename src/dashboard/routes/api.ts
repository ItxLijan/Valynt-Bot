import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../database/client';

export const apiRouter = Router();

// GET /api/invite — returns bot invite URL from env
apiRouter.get('/invite', (_req, res) => {
  const url = process.env.BOT_INVITE_URL
    ?? `https://discord.com/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&scope=bot+applications.commands&permissions=8`;
  res.json({ url });
});

// GET /api/bot-guilds — returns list of guild IDs where bot is present
apiRouter.get('/bot-guilds', async (_req, res) => {
  try {
    const guildIds = new Set<string>();

    // Method 1: guilds with existing config in DB
    const configs = await prisma.guildConfig.findMany({ select: { guildId: true } });
    configs.forEach((c: any) => guildIds.add(c.guildId));

    // Method 2: guilds with any user data
    const users = await prisma.userData.findMany({ select: { guildId: true }, distinct: ['guildId'] });
    users.forEach((u: any) => guildIds.add(u.guildId));

    // Method 3: try bot client (works if same process)
    try {
      const { getDiscordClient } = await import('../../bot/clientRef');
      const client = getDiscordClient();
      if (client?.guilds?.cache) {
        client.guilds.cache.forEach((g: any) => guildIds.add(g.id));
      }
    } catch {}

    res.json({ guilds: [...guildIds] });
  } catch {
    res.json({ guilds: [] });
  }
});

// Auth middleware
function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.user) {
    console.log('[API] 401 - No session user. Session:', JSON.stringify(req.session));
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

function requireGuildAccess(req: Request, res: Response, next: NextFunction) {
  const { guildId } = req.params;
  const user = req.session.user!;
  const guilds: any[] = Array.isArray(user.guilds) ? user.guilds : JSON.parse(user.guilds as any || '[]');
  const hasAccess = guilds.some((g: any) => g.id === guildId);
  if (!hasAccess) {
    console.log(`[API] 403 - User ${user.id} has no access to guild ${guildId}. Guilds:`, guilds.map((g:any) => g.id));
    return res.status(403).json({ error: 'No access to this guild' });
  }
  next();
}

// Global error wrapper
function asyncHandler(fn: Function) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await fn(req, res, next);
    } catch (err: any) {
      console.error('[API Error]', req.method, req.path, err?.message ?? err);
      res.status(500).json({ error: err?.message ?? 'Internal server error' });
    }
  };
}

// GET /api/guilds/:guildId/config
apiRouter.get('/guilds/:guildId/config', requireAuth, requireGuildAccess, asyncHandler(async (req: Request, res: Response) => {
  const { guildId } = req.params;
  const config = await prisma.guildConfig.findUnique({ where: { guildId } }) ?? { guildId };
  res.json(config);
}));

// POST /api/guilds/:guildId/config
apiRouter.post('/guilds/:guildId/config', requireAuth, requireGuildAccess, asyncHandler(async (req: Request, res: Response) => {
  const { guildId } = req.params;
  const data = req.body;

  const allowed = [
    'mainChannel', 'logChannel', 'logIgnoreChannels', 'autoRoles',
    'welcomeChannel', 'welcomeTitle', 'welcomeMessage', 'welcomeShowAvatar',
    'xpPerMessage', 'xpPerVoiceMinute', 'xpBlacklistChannels', 'xpLeaderboardChannel',
    'levelUpChannel', 'xpLogChannel',
    'coinsPerMessage', 'coinsPerVoiceMinute', 'coinLeaderboardChannel', 'coinBlacklistChannels',
    'shopChannel', 'birthdayChannel', 'countingChannel', 'quizChannel',
    'imageOnlyChannels', 'absenceChannel', 'teamRankChannel', 'giveawayChannel',
    'streamNotifyChannel', 'streamNotifyTwitch', 'streamNotifyYoutube',
  ];

  const filtered: any = {};
  for (const key of allowed) {
    if (data[key] !== undefined) {
      filtered[key] = typeof data[key] === 'object' ? JSON.stringify(data[key]) : data[key];
    }
  }

  console.log(`[API] Saving config for guild ${guildId}:`, filtered);

  const config = await prisma.guildConfig.upsert({
    where: { guildId },
    update: filtered,
    create: { guildId, ...filtered },
  });

  res.json(config);
}));

// GET /api/guilds/:guildId/shop
apiRouter.get('/guilds/:guildId/shop', requireAuth, requireGuildAccess, asyncHandler(async (req: Request, res: Response) => {
  const items = await prisma.shopItem.findMany({ where: { guildId: req.params.guildId } });
  res.json(items);
}));

// POST /api/guilds/:guildId/shop
apiRouter.post('/guilds/:guildId/shop', requireAuth, requireGuildAccess, asyncHandler(async (req: Request, res: Response) => {
  const { name, description, price, emoji } = req.body;
  if (!name || !price) return res.status(400).json({ error: 'name and price required' });
  const item = await prisma.shopItem.create({
    data: { guildId: req.params.guildId, name, description: description || '', price: parseInt(price), emoji },
  });
  res.json(item);
}));

// DELETE /api/guilds/:guildId/shop/:itemId
apiRouter.delete('/guilds/:guildId/shop/:itemId', requireAuth, requireGuildAccess, asyncHandler(async (req: Request, res: Response) => {
  await prisma.shopItem.update({ where: { id: req.params.itemId }, data: { active: false } });
  res.json({ success: true });
}));

// GET /api/guilds/:guildId/quiz
apiRouter.get('/guilds/:guildId/quiz', requireAuth, requireGuildAccess, asyncHandler(async (req: Request, res: Response) => {
  const questions = await prisma.quizQuestion.findMany({ where: { guildId: req.params.guildId } });
  res.json(questions);
}));

// POST /api/guilds/:guildId/quiz
apiRouter.post('/guilds/:guildId/quiz', requireAuth, requireGuildAccess, asyncHandler(async (req: Request, res: Response) => {
  const { emoji, answer, hint, xpReward, coinReward } = req.body;
  if (!emoji || !answer) return res.status(400).json({ error: 'emoji and answer required' });
  const q = await prisma.quizQuestion.create({
    data: {
      guildId: req.params.guildId,
      emoji, answer, hint: hint || null,
      xpReward: parseInt(xpReward ?? 20),
      coinReward: parseInt(coinReward ?? 10),
    },
  });
  res.json(q);
}));

// DELETE /api/guilds/:guildId/quiz/:questionId
apiRouter.delete('/guilds/:guildId/quiz/:questionId', requireAuth, requireGuildAccess, asyncHandler(async (req: Request, res: Response) => {
  await prisma.quizQuestion.update({ where: { id: req.params.questionId }, data: { active: false } });
  res.json({ success: true });
}));

// GET /api/guilds/:guildId/purchases
apiRouter.get('/guilds/:guildId/purchases', requireAuth, requireGuildAccess, asyncHandler(async (req: Request, res: Response) => {
  const purchases = await prisma.shopPurchase.findMany({
    where: { guildId: req.params.guildId, delivered: false },
    orderBy: { createdAt: 'asc' },
  });
  res.json(purchases);
}));

// PATCH /api/guilds/:guildId/purchases/:purchaseId/deliver
apiRouter.patch('/guilds/:guildId/purchases/:purchaseId/deliver', requireAuth, requireGuildAccess, asyncHandler(async (req: Request, res: Response) => {
  const purchase = await prisma.shopPurchase.update({
    where: { id: req.params.purchaseId },
    data: { delivered: true },
  });

  try {
    const { getDiscordClient } = await import('../../bot/clientRef');
    const client = getDiscordClient();
    if (client) {
      const user = await client.users.fetch(purchase.userId).catch(() => null);
      if (user) {
        const { EmbedBuilder } = await import('discord.js');
        const { FOOTER_TEXT } = await import('../../utils/embed');
        const embed = new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle('📦 Deine Bestellung ist fertig!')
          .setDescription(
            `Dein Item **${purchase.itemName}** wurde bearbeitet!\n\n` +
            `✅ Du kannst deine Bestellung jetzt **ingame abholen**!\n\n` +
            `Wende dich an ein Team-Mitglied falls du Fragen hast.`
          )
          .setFooter({ text: FOOTER_TEXT })
          .setTimestamp();
        await user.send({ embeds: [embed] }).catch(() => {});
      }
    }
  } catch (e) {
    console.warn('[API] DM send failed:', e);
  }

  res.json({ success: true });
}));

// Helper to get username from Discord API
async function getUsername(userId: string): Promise<string> {
  try {
    const axios = (await import('axios')).default;
    const r = await axios.get(`https://discord.com/api/v10/users/${userId}`, {
      headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
    });
    return r.data.global_name || r.data.username || userId;
  } catch { return userId; }
}

// GET /api/guilds/:guildId/leaderboard/xp
apiRouter.get('/guilds/:guildId/leaderboard/xp', requireAuth, requireGuildAccess, asyncHandler(async (req: Request, res: Response) => {
  const top = await prisma.userData.findMany({
    where: { guildId: req.params.guildId },
    orderBy: { xp: 'desc' },
    take: 10,
  });
  const withNames = await Promise.all(top.map(async u => ({
    ...u,
    username: await getUsername(u.userId),
  })));
  res.json(withNames);
}));

// GET /api/guilds/:guildId/leaderboard/coins
apiRouter.get('/guilds/:guildId/leaderboard/coins', requireAuth, requireGuildAccess, asyncHandler(async (req: Request, res: Response) => {
  const top = await prisma.userData.findMany({
    where: { guildId: req.params.guildId },
    orderBy: { coins: 'desc' },
    take: 10,
  });
  const withNames = await Promise.all(top.map(async u => ({
    ...u,
    username: await getUsername(u.userId),
  })));
  res.json(withNames);
}));

// ─── TICKET PANEL ROUTES ──────────────────────────────────────────────────────

// GET /api/guilds/:guildId/ticket-panels
apiRouter.get('/guilds/:guildId/ticket-panels', requireAuth, requireGuildAccess, asyncHandler(async (req: Request, res: Response) => {
  const panels = await prisma.ticketPanel.findMany({
    where: { guildId: req.params.guildId },
    include: { categories: { include: { questions: { orderBy: { order: 'asc' } } } } },
  });
  res.json(panels);
}));

// POST /api/guilds/:guildId/ticket-panels
apiRouter.post('/guilds/:guildId/ticket-panels', requireAuth, requireGuildAccess, asyncHandler(async (req: Request, res: Response) => {
  const { channelId, title, description, color } = req.body;
  const panel = await prisma.ticketPanel.create({
    data: { guildId: req.params.guildId, channelId, title: title || 'Support', description: description || 'Wähle eine Kategorie.', color: color || '#5865f2' },
  });
  res.json(panel);
}));

// DELETE /api/guilds/:guildId/ticket-panels/:panelId
apiRouter.delete('/guilds/:guildId/ticket-panels/:panelId', requireAuth, requireGuildAccess, asyncHandler(async (req: Request, res: Response) => {
  const panelId = req.params.panelId;
  // Get all categories first
  const cats = await prisma.ticketCategory.findMany({ where: { panelId } });
  for (const cat of cats) {
    await prisma.ticketQuestion.deleteMany({ where: { categoryId: cat.id } });
    await prisma.ticket.deleteMany({ where: { categoryId: cat.id } });
    await prisma.ticketCategory.delete({ where: { id: cat.id } });
  }
  await prisma.ticketPanel.delete({ where: { id: panelId } });
  res.json({ success: true });
}));

// POST /api/guilds/:guildId/ticket-panels/:panelId/post
apiRouter.post('/guilds/:guildId/ticket-panels/:panelId/post', requireAuth, requireGuildAccess, asyncHandler(async (req: Request, res: Response) => {
  const { getDiscordClient } = await import('../../bot/clientRef');
  const client = getDiscordClient();
  const guild = client.guilds.cache.get(req.params.guildId);
  if (!guild) return res.status(404).json({ error: 'Guild not found' });
  const { postTicketPanel } = await import('../../bot/handlers/ticketHandler');
  await postTicketPanel(req.params.panelId, guild);
  res.json({ success: true });
}));

// POST /api/guilds/:guildId/ticket-panels/:panelId/categories
apiRouter.post('/guilds/:guildId/ticket-panels/:panelId/categories', requireAuth, requireGuildAccess, asyncHandler(async (req: Request, res: Response) => {
  const { label, emoji, description, categoryId, supportRoles, channelNamePattern } = req.body;
  const cat = await prisma.ticketCategory.create({
    data: {
      panelId: req.params.panelId,
      guildId: req.params.guildId,
      label, emoji, description,
      categoryId: categoryId || null,
      supportRoles: JSON.stringify(Array.isArray(supportRoles) ? supportRoles : []),
      channelNamePattern: channelNamePattern || '{username}-{id}',
    },
  });
  res.json(cat);
}));

// DELETE /api/guilds/:guildId/ticket-categories/:catId
apiRouter.delete('/guilds/:guildId/ticket-categories/:catId', requireAuth, requireGuildAccess, asyncHandler(async (req: Request, res: Response) => {
  const catId = req.params.catId;
  // Delete in correct order: questions → tickets → category
  await prisma.ticketQuestion.deleteMany({ where: { categoryId: catId } });
  await prisma.ticket.deleteMany({ where: { categoryId: catId } });
  await prisma.ticketCategory.delete({ where: { id: catId } });
  res.json({ success: true });
}));

// POST /api/guilds/:guildId/ticket-categories/:catId/questions
apiRouter.post('/guilds/:guildId/ticket-categories/:catId/questions', requireAuth, requireGuildAccess, asyncHandler(async (req: Request, res: Response) => {
  const { label, placeholder, required } = req.body;
  const count = await prisma.ticketQuestion.count({ where: { categoryId: req.params.catId } });
  if (count >= 5) return res.status(400).json({ error: 'Max 5 questions' });
  const q = await prisma.ticketQuestion.create({
    data: { categoryId: req.params.catId, label, placeholder: placeholder || '', required: required !== false, order: count },
  });
  res.json(q);
}));

// DELETE /api/guilds/:guildId/ticket-questions/:questionId
apiRouter.delete('/guilds/:guildId/ticket-questions/:questionId', requireAuth, requireGuildAccess, asyncHandler(async (req: Request, res: Response) => {
  await prisma.ticketQuestion.delete({ where: { id: req.params.questionId } });
  res.json({ success: true });
}));

// PATCH /api/guilds/:guildId/ticket-questions/:questionId — edit label/placeholder/required
apiRouter.patch('/guilds/:guildId/ticket-questions/:questionId', requireAuth, requireGuildAccess, asyncHandler(async (req: Request, res: Response) => {
  const { label, placeholder, required } = req.body;
  const q = await prisma.ticketQuestion.update({
    where: { id: req.params.questionId },
    data: {
      ...(label !== undefined && { label }),
      ...(placeholder !== undefined && { placeholder }),
      ...(required !== undefined && { required: required === true || required === 'true' }),
    },
  });
  res.json(q);
}));

// POST /api/guilds/:guildId/ticket-categories/:catId/questions/reorder
// body: { order: ['id1','id2','id3',...] }
apiRouter.post('/guilds/:guildId/ticket-categories/:catId/questions/reorder', requireAuth, requireGuildAccess, asyncHandler(async (req: Request, res: Response) => {
  const { order } = req.body as { order: string[] };
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be array' });
  // Update each question's order field
  await Promise.all(
    order.map((id, index) =>
      prisma.ticketQuestion.update({ where: { id }, data: { order: index } })
    )
  );
  res.json({ success: true });
}));

// POST /api/guilds/:guildId/post/:type — post leaderboard/shop to channel via Discord REST
apiRouter.post('/guilds/:guildId/post/:type', requireAuth, requireGuildAccess, asyncHandler(async (req: Request, res: Response) => {
  const { guildId, type } = req.params;

  const config = await prisma.guildConfig.findUnique({ where: { guildId } });
  if (!config) return res.status(404).json({ error: 'Keine Konfiguration gefunden' });

  const FOOTER_TEXT = 'Developed by ItxVance_';
  const token = process.env.DISCORD_TOKEN!;

  // Helper: send embed to channel via Discord REST API directly
  async function sendEmbed(channelId: string, embed: object) {
    const axios = (await import('axios')).default;
    await axios.post(
      `https://discord.com/api/v10/channels/${channelId}/messages`,
      { embeds: [embed] },
      { headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' } }
    );
  }

  // Helper: build leaderboard data from DB
  async function buildLeaderboard(type: 'xp' | 'coins') {
    const top10 = await prisma.userData.findMany({
      where: { guildId },
      orderBy: type === 'xp' ? { xp: 'desc' } : { coins: 'desc' },
      take: 10,
    });
    const medals = ['🥇', '🥈', '🥉'];
    const lines = top10.map((u, i) => {
      const prefix = medals[i] ?? `**#${i + 1}**`;
      if (type === 'xp') return `${prefix} <@${u.userId}> — **${u.xp} XP** (Level ${u.level})`;
      return `${prefix} <@${u.userId}> — **${u.coins} 🪙**`;
    });
    return lines.join('\n') || '*Noch keine Daten*';
  }

  if (type === 'xp-leaderboard') {
    const channelId = config.xpLeaderboardChannel;
    if (!channelId) return res.status(400).json({ error: 'Kein XP-Leaderboard-Channel konfiguriert. Bitte zuerst speichern.' });
    const description = await buildLeaderboard('xp');
    await sendEmbed(channelId, {
      title: '🏆 XP Leaderboard – Top 10',
      description,
      color: 0x5865f2,
      footer: { text: `${FOOTER_TEXT} • Wird automatisch aktualisiert` },
      timestamp: new Date().toISOString(),
    });
    return res.json({ success: true });
  }

  if (type === 'coins-leaderboard') {
    const channelId = config.coinLeaderboardChannel;
    if (!channelId) return res.status(400).json({ error: 'Kein Coins-Leaderboard-Channel konfiguriert. Bitte zuerst speichern.' });
    const description = await buildLeaderboard('coins');
    await sendEmbed(channelId, {
      title: '💰 Coins Leaderboard – Top 10',
      description,
      color: 0xf59e0b,
      footer: { text: `${FOOTER_TEXT} • Wird automatisch aktualisiert` },
      timestamp: new Date().toISOString(),
    });
    return res.json({ success: true });
  }

  if (type === 'shop') {
    const channelId = config.shopChannel;
    if (!channelId) return res.status(400).json({ error: 'Kein Shop-Channel konfiguriert. Bitte zuerst speichern.' });
    const items = await prisma.shopItem.findMany({ where: { guildId, active: true } });
    if (!items.length) return res.status(400).json({ error: 'Keine aktiven Items im Shop' });
    await sendEmbed(channelId, {
      title: '🛒 Shop',
      description: 'Kaufe Items mit deinen Coins! Nutze `/buy <item>` zum Kaufen.',
      color: 0xf59e0b,
      fields: items.map(item => ({
        name: `${item.emoji ?? '📦'} ${item.name} — ${item.price} 🪙`,
        value: item.description || '—',
        inline: false,
      })),
      footer: { text: FOOTER_TEXT },
      timestamp: new Date().toISOString(),
    });
    return res.json({ success: true });
  }

  res.status(400).json({ error: 'Unbekannter Typ' });
}));
