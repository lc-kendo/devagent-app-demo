import express, { Request, Response, NextFunction, Router } from 'express';
import path from 'path';
import { importRouter } from './routes/import.routes';

interface MulterError extends Error {
  code?: string;
}

export function createApp(overrideImportRouter?: Router) {
  const app = express();

  // Middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Static files
  app.use(express.static(path.join(process.cwd(), 'public')));

  // Health check
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  // Import routes
  app.use('/api/import', overrideImportRouter ?? importRouter);

  // Global error handler
  app.use((err: MulterError, _req: Request, res: Response, _next: NextFunction) => {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        error: 'FILE_TOO_LARGE',
        message: '文件大小超过 5MB 限制',
      });
    }
    console.error(err.stack);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  });

  return app;
}
