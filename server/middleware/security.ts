import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createHash } from 'crypto';

// Extend session to include csrfToken
declare module 'express-session' {
  interface SessionData {
    csrfToken?: string;
  }
}

// File upload security - Enhanced for large court documents
const upload = multer({
  dest: 'temp-uploads/',
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB limit for large court documents (1000-3000 pages)
    files: 1,
    fieldSize: 500 * 1024 * 1024, // Allow large field values
    fields: 20, // Allow more fields if needed
  },
  fileFilter: (req, file, cb) => {
    // Only allow PDF files
    if (file.mimetype === 'application/pdf' || 
        path.extname(file.originalname).toLowerCase() === '.pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
});

// Input sanitization middleware
export const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
  // Basic XSS protection for string inputs
  const sanitizeString = (str: string): string => {
    return str.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
              .replace(/javascript:/gi, '')
              .replace(/on\w+\s*=/gi, '');
  };

  // Recursively sanitize object properties
  const sanitizeObject = (obj: any): any => {
    if (typeof obj === 'string') {
      return sanitizeString(obj);
    }
    if (typeof obj === 'object' && obj !== null) {
      const sanitized: any = Array.isArray(obj) ? [] : {};
      for (const key in obj) {
        sanitized[key] = sanitizeObject(obj[key]);
      }
      return sanitized;
    }
    return obj;
  };

  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  
  next();
};

// Health check endpoint
export const healthCheck = (req: Request, res: Response) => {
  const healthData = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0'
  };

  res.status(200).json(healthData);
};

// Error monitoring
export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  // Log error (in production, send to monitoring service)
  console.error('Error:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString(),
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  const status = err.status || err.statusCode || 500;
  
  res.status(status).json({
    message: isDevelopment ? err.message : 'Internal Server Error',
    ...(isDevelopment && { stack: err.stack })
  });
};

// Enhanced security headers
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      connectSrc: ["'self'", "https://api.replit.com"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
});

// Rate limiting for different endpoints
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Reduced to 5 uploads per hour for large court documents
  message: 'Too many uploads from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful uploads toward the limit
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 auth attempts per windowMs
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// CSRF Protection
export const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
  // Skip CSRF for GET requests, static files, auth routes, health endpoints, webhooks, and parallel OCR routes
  if (req.method === 'GET' || 
      req.path.startsWith('/api/auth/') ||
      req.path.startsWith('/out/') ||
      req.path.startsWith('/assets/') ||
      req.path.startsWith('/health') ||
      req.path.startsWith('/ready') ||
      req.path === '/healthz' ||
      req.path === '/readyz' ||
      req.path === '/metrics' ||
      req.path.startsWith('/api/billing/webhook') ||
      req.path.includes('/parallel-ocr') ||
      req.path.includes('/vision-parallel-ocr') ||
      req.path.includes('/batches') ||
      !req.session) {
    return next();
  }

  const token = req.headers['x-csrf-token'] || req.body._csrf;
  const sessionToken = req.session?.csrfToken;

  if (!token || !sessionToken || token !== sessionToken) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }

  next();
};

// Generate CSRF token
export const generateCSRFToken = (req: Request, res: Response, next: NextFunction) => {
  // Only generate CSRF tokens for requests with sessions
  if (req.session) {
    if (!req.session.csrfToken) {
      req.session.csrfToken = createHash('sha256')
        .update((req.sessionID || 'fallback') + Date.now().toString())
        .digest('hex');
    }
  }
  next();
};

export { upload };