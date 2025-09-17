import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cors from "cors";
import { registerRoutes } from "./routes";
import tabs from "./routes/tabs";
import { setupVite, serveStatic, log } from "./vite";
import { sanitizeInput, healthCheck, errorHandler, securityHeaders, generalLimiter, uploadLimiter, authLimiter, generateCSRFToken, csrfProtection } from "./middleware/security";
import { monitoring } from "./utils/monitoring";
import healthRouter from "./routes/health";

const app = express();

// Configure server for large court documents (1000-3000 pages)
app.use((req, res, next) => {
  // Increase timeout for large file processing (30 minutes for very large documents)
  req.setTimeout(30 * 60 * 1000);
  res.setTimeout(30 * 60 * 1000);
  next();
});

// CORS configuration for production subdomain setup
if (process.env.NODE_ENV === 'production') {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
  app.use(cors({
    origin: (origin: string | undefined, callback: Function) => {
      // Allow requests with no origin (mobile apps, etc.)
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      } else {
        return callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token']
  }));
} else {
  // Development mode: allow all origins
  app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token']
  }));
}

// Enhanced security headers
app.use(securityHeaders);

// Trust proxy for proper IP detection
app.set('trust proxy', 1);

// Trust proxy and force HTTPS in production
app.enable("trust proxy");
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.get("x-forwarded-proto") !== "https") {
      return res.redirect(301, "https://" + req.get("host") + req.originalUrl);
    }
    next();
  });
}

// DUAL DEPLOYMENT: Handle domain-based routing
app.use((req, res, next) => {
  const hostname = req.get('host') || '';
  
  // Add domain information to request for frontend routing
  (req as any).domain = hostname.includes('app.hyperlinklaw.com') ? 'app' : 
               hostname.includes('hyperlinklaw.com') ? 'marketing' : 'development';
  
  // If on main marketing domain (hyperlinklaw.com), restrict to marketing content only
  if (hostname === 'hyperlinklaw.com') {
    // Block all API routes except health checks on marketing domain
    if (req.path.startsWith('/api/') && !req.path.startsWith('/api/health')) {
      return res.status(404).json({ error: 'API not available on marketing domain' });
    }
    
    // Only allow marketing routes and static assets
    if (!req.path.startsWith('/assets/') && req.path !== '/' && req.path !== '/index.html') {
      // In development, let Vite handle routing
      if (process.env.NODE_ENV === 'development') {
        return next();
      }
      // In production, redirect non-marketing paths to app subdomain
      return res.redirect(301, `https://app.hyperlinklaw.com${req.originalUrl}`);
    }
  }
  
  // For app subdomain (app.hyperlinklaw.com), serve the full application
  if (hostname === 'app.hyperlinklaw.com' || hostname.startsWith('app.')) {
    // Full application access - all routes allowed
    return next();
  }
  
  // For development or other domains, serve full application
  next();
});

// Performance monitoring
app.use(monitoring.recordRequest.bind(monitoring));

// Rate limiting
app.use('/api/auth', authLimiter);
app.use('/api/upload', uploadLimiter);
app.use('/api', generalLimiter);

// Increased limits for large court documents (1000-3000 pages)
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: false, limit: '500mb' }));

// Input sanitization
app.use(sanitizeInput);

// CSRF protection for routes with sessions
app.use(generateCSRFToken);
app.use(csrfProtection);

// Health and monitoring endpoints
app.use('/health', healthRouter);
app.use('/healthz', healthRouter);
app.use('/ready', healthRouter);
app.use('/readyz', healthRouter);
app.use('/metrics', healthRouter);

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    // Early validation for critical environment variables
    log('🔍 Validating environment configuration...');
    const missingVars: string[] = [];
    
    // Check for required environment variables in production
    if (process.env.NODE_ENV === 'production') {
      const requiredVars = ['DATABASE_URL'];
      requiredVars.forEach(varName => {
        if (!process.env[varName]) {
          missingVars.push(varName);
        }
      });
      
      if (missingVars.length > 0) {
        throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
      }
    }
    
    log('✅ Environment validation completed');
    log('🚀 Starting server initialization...');
    
    // Wire in Tab rebuild endpoints
    log('📝 Loading tab rebuild endpoints...');
    app.use(tabs);
    
    // Add index-first detection API
    log('📝 Loading index-first detection API...');
    const indexFirstAPI = await import("./routes/indexFirstAPI");
    app.use(indexFirstAPI.default);
    
    // Add deterministic rebuild API  
    log('📝 Loading deterministic rebuild API...');
    const deterministicAPI = await import("./routes/deterministic");
    app.use(deterministicAPI.default);
    
    // Add OCR hyperlink detection API
    log('📝 Loading OCR hyperlink detection API...');
    const ocrHyperlinks = await import("./routes/ocrHyperlinks");
    app.use(ocrHyperlinks.default);
    
    // Add auto-detection API
    log('📝 Loading auto-detection API...');
    const autoDetection = await import("./routes/autoDetection");
    app.use(autoDetection.default);
    
    // Add enhanced PDF processing API
    log('📝 Loading enhanced PDF processing API...');
    const processPdf = await import("./routes/processPdf");
    app.use(processPdf.default);
    
    // Add parallel OCR processing API
    log('📝 Loading parallel OCR processing API...');
    const parallelOcr = await import("./routes/parallelOcr");
    app.use('/api', parallelOcr.default);
    
    // Add enhanced batch API for page-by-page viewing and editing
    log('📝 Loading enhanced batch API...');
    const enhancedBatchApi = await import("./routes/enhancedBatchApi");
    app.use('/api', enhancedBatchApi.default);
    
    // Tab highlighter API
    log('📝 Loading tab highlighter API...');
    const tabHighlighter = await import("./routes/tabHighlighter");
    app.use(tabHighlighter.default);
    
    // Simple tab editor API
    log('📝 Loading simple tab editor API...');
    const simpleTabEditor = await import("./routes/simpleTabEditor");
    app.use(simpleTabEditor.simpleTabEditorRouter);
    
    log('📝 Registering routes...');
    const server = await registerRoutes(app);
    log('✅ Routes registered successfully');

    // Start optional services with graceful error handling
    log('🔧 Starting optional services...');
    
    // Start GCS watcher for real-time Vision OCR result ingestion
    try {
      log('🔍 Starting GCS watcher...');
      const { startGcsWatcher } = await import('./services/gcsIngestor');
      await startGcsWatcher();
      log('✅ GCS watcher started successfully');
    } catch (error) {
      log(`⚠️ GCS watcher startup failed: ${error instanceof Error ? error.message : String(error)}`);
      console.warn('GCS watcher startup failed - service will continue without real-time Vision OCR ingestion:', error);
    }

    // Initialize parallel OCR processing system
    try {
      log('🔄 Initializing parallel OCR system...');
      await import('./ocr/index');
      log('✅ Parallel OCR system initialized successfully');
      
      // Auto-resume any in-flight OCR jobs after server restart
      try {
        log('🔄 Cleaning up orphaned OCR jobs...');
        const { resumeInFlightDocuments, cleanupOrphanedJobs } = await import('./ocr/autoresume');
        await cleanupOrphanedJobs();
        log('✅ Orphaned OCR jobs cleaned up');
        
        log('🔄 Resuming in-flight OCR documents...');
        await resumeInFlightDocuments();
        log('✅ In-flight OCR documents resumed');
      } catch (resumeError) {
        log(`⚠️ OCR job resume failed: ${resumeError instanceof Error ? resumeError.message : String(resumeError)}`);
        console.warn('OCR job resume failed - manual intervention may be required:', resumeError);
      }
    } catch (error) {
      log(`⚠️ Parallel OCR system startup failed: ${error instanceof Error ? error.message : String(error)}`);
      console.warn('Parallel OCR system startup failed - OCR functionality may be limited:', error);
    }

    // Serve static files from /out with aggressive caching
    log('📁 Setting up static file serving...');
    app.use("/out", express.static("out", {
      maxAge: "1y",
      immutable: true,
      etag: true
    }));

    // Use enhanced error handler
    log('⚡ Setting up error handling...');
    app.use(errorHandler);

    // importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes
    log('🔧 Setting up development/production server...');
    if (app.get("env") === "development") {
      log('🔄 Setting up Vite development server...');
      await setupVite(app, server);
      log('✅ Vite development server configured');
    } else {
      log('📦 Setting up static file serving for production...');
      serveStatic(app);
      log('✅ Production static file serving configured');
    }

    // ALWAYS serve the app on the port specified in the environment variable PORT
    // Other ports are firewalled. Default to 5000 if not specified.
    // this serves both the API and the client.
    // It is the only port that is not firewalled.
    const port = parseInt(process.env.PORT || '5000', 10);
    log(`🚀 Starting server on port ${port}...`);
    
    server.listen({
      port,
      host: "0.0.0.0",
      reusePort: true,
    }, () => {
      log(`✅ Server successfully started on port ${port}`);
      log(`🌐 Application available at http://0.0.0.0:${port}`);
      log('🎉 Deployment ready - all services initialized');
    });
    
    // Handle server errors
    server.on('error', (error: Error) => {
      log(`❌ Server error: ${error.message}`);
      console.error('Server failed to start:', error);
      process.exit(1);
    });
    
  } catch (error) {
    // Catch all initialization errors
    log(`❌ Server initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    console.error('Critical server initialization error:', error);
    
    // Log stack trace for debugging
    if (error instanceof Error && error.stack) {
      console.error('Stack trace:', error.stack);
    }
    
    // Exit with error code for deployment systems to detect failure
    process.exit(1);
  }
})();
