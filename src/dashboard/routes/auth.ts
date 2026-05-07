import { Router, Request, Response } from 'express';
import axios from 'axios';

export const authRouter = Router();

const DISCORD_API = 'https://discord.com/api/v10';

authRouter.get('/login', (_req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID!,
    redirect_uri: process.env.OAUTH2_REDIRECT_URI!,
    response_type: 'code',
    scope: 'identify guilds',
  });
  res.redirect(`https://discord.com/oauth2/authorize?${params}`);
});

authRouter.get('/callback', async (req: Request, res: Response) => {
  const { code } = req.query;
  if (!code) return res.redirect('/?error=no_code');

  try {
    const tokenRes = await axios.post(
      `${DISCORD_API}/oauth2/token`,
      new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID!,
        client_secret: process.env.DISCORD_CLIENT_SECRET!,
        grant_type: 'authorization_code',
        code: String(code),
        redirect_uri: process.env.OAUTH2_REDIRECT_URI!,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token } = tokenRes.data;

    const [userRes, guildsRes] = await Promise.all([
      axios.get(`${DISCORD_API}/users/@me`, { headers: { Authorization: `Bearer ${access_token}` } }),
      axios.get(`${DISCORD_API}/users/@me/guilds`, { headers: { Authorization: `Bearer ${access_token}` } }),
    ]);

    const user = userRes.data;
    // Show all guilds where user is admin (bot presence filtered client-side)
    const guilds = guildsRes.data.filter((g: any) =>
      (BigInt(g.permissions) & BigInt(0x8)) === BigInt(0x8)
    );

    req.session.user = {
      id: user.id,
      username: user.username,
      avatar: user.avatar
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
        : `https://cdn.discordapp.com/embed/avatars/0.png`,
      guilds,
    };

    // Force session save before redirect
    req.session.save((err) => {
      if (err) {
        console.error('[Auth] Session save error:', err);
        return res.redirect('/?error=session_failed');
      }
      res.redirect('/');
    });
  } catch (err: any) {
    console.error('[Auth] Callback error:', err?.response?.data ?? err?.message ?? err);
    res.redirect('/?error=auth_failed');
  }
});

authRouter.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.redirect('/');
  });
});

authRouter.get('/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  res.json(req.session.user);
});
