import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { logger } from '../utils/logger';
import { authRouter } from './routes/auth';
import { apiRouter } from './routes/api';

const app = express();
const PORT = process.env.DASHBOARD_PORT ?? 3000;

// Trust reverse proxy (Cloudflare Tunnel, nginx, etc.)
app.set('trust proxy', 1);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.DASHBOARD_URL, credentials: true }));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET ?? 'changeme',
    resave: true,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      secure: 'auto',
      sameSite: 'none',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      httpOnly: true,
    },
  })
);

// Extend session type
declare module 'express-session' {
  interface SessionData {
    user?: { id: string; username: string; avatar: string; guilds: any[] };
  }
}

app.use('/auth', authRouter);
app.use('/api', apiRouter);

// Clean URLs for legal pages
app.get('/privacy', (_req, res) => res.sendFile(path.join(__dirname, '../../public/privacy.html')));
app.get('/terms', (_req, res) => res.sendFile(path.join(__dirname, '../../public/terms.html')));

// Serve static dashboard files
app.use(express.static(path.join(__dirname, '../../public')));

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../../public/index.html'));
});

app.listen(PORT, () => {
  logger.info(`Dashboard running at http://localhost:${PORT}`);
});
