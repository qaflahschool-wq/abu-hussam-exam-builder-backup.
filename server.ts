import fs from 'fs';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { router as apiRouter } from './server/routes.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  const isProd = process.env.NODE_ENV === 'production';

  // Baseline browser security headers. HSTS is enabled only for production deployments.
  app.disable('x-powered-by');
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (isProd) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  // Trust forwarded client IPs only when the deployment explicitly declares
  // the exact number of trusted proxy hops. Never trust X-Forwarded-For by default.
  const trustProxyHops = Number.parseInt(process.env.TRUST_PROXY_HOPS || '0', 10);
  if (Number.isInteger(trustProxyHops) && trustProxyHops > 0 && trustProxyHops <= 5) {
    app.set('trust proxy', trustProxyHops);
  }

  // Restrict cross-origin browser access to explicitly configured origins.
  // Same-origin and non-browser requests without an Origin header continue to work.
  const allowedOrigins = new Set(
    (process.env.CORS_ALLOWED_ORIGINS || '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
  );
  if (!isProd) {
    allowedOrigins.add('http://localhost:3000');
    allowedOrigins.add('http://localhost:5173');
    allowedOrigins.add('http://127.0.0.1:3000');
    allowedOrigins.add('http://127.0.0.1:5173');
  }

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Accept'],
    maxAge: 600,
  }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // API Routes
  app.use('/api', apiRouter);

  // Guarantee /api/* never falls through to Vite/SPA HTML fallback
  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'المسار المطلوب غير موجود' });
  });

  // Ensure Express API errors always respond with JSON rather than HTML error pages without leaking internals
  app.use('/api', (err: any, req: Request, res: Response, _next: NextFunction) => {
    const rawStatus = typeof err?.status === 'number' ? err.status : typeof err?.statusCode === 'number' ? err.statusCode : 500;
    const status = rawStatus >= 400 && rawStatus < 600 ? rawStatus : 500;

    if (err?.type === 'entity.parse.failed' || (err instanceof SyntaxError && status === 400)) {
      res.status(400).json({ error: 'صيغة بيانات JSON المرسلة غير صالحة' });
      return;
    }

    if (err?.type === 'entity.too.large' || status === 413) {
      res.status(413).json({ error: 'حجم البيانات المرسلة يتجاوز الحد المسموح به' });
      return;
    }

    console.error('[API Error]', {
      method: req.method,
      path: req.originalUrl,
      status,
      message: err?.message,
      stack: status >= 500 ? err?.stack : undefined,
    });

    if (status >= 500) {
      res.status(status).json({ error: 'حدث خطأ داخلي في الخادم' });
      return;
    }

    res.status(status).json({
      error: 'تعذر معالجة الطلب',
    });
  });

  // Vite middleware in dev or static files in production
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    const indexHtmlPath = path.resolve(distPath, 'index.html');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      if (req.path.startsWith('/api')) {
        res.status(404).json({ error: 'المسار المطلوب غير موجود' });
        return;
      }
      if (!fs.existsSync(indexHtmlPath)) {
        res.status(503).send('Application build artifacts are not available.');
        return;
      }
      res.sendFile(indexHtmlPath);
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Abu Hussam Exam Builder server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server start error:', err);
  process.exit(1);
});
