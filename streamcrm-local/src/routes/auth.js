import { Router } from 'express';
import { createSession, destroySession, login, requireAuth, setSessionCookie } from '../auth.js';

export const authRouter = Router();

authRouter.post('/login', (req, res) => {
  const user = login(req.body?.email, req.body?.password);
  setSessionCookie(req, res, createSession(user.id));
  res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
});

authRouter.post('/logout', (req, res) => {
  destroySession(req, res);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));
