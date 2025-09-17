// Production environment configuration and validation
export interface ProductionConfig {
  NODE_ENV: string;
  DATABASE_URL: string;
  SESSION_SECRET: string;
  REPLIT_DOMAINS: string;
  REPL_ID: string;
  CSP_ORIGIN: string;
  MAX_UPLOAD_MB: number;
  RATE_LIMIT_WINDOW: number;
  RATE_LIMIT_MAX: number;
  STRICT_INDEX_ONLY: boolean;
}

export function validateProductionEnvironment(): ProductionConfig {
  const requiredVars = [
    'NODE_ENV',
    'DATABASE_URL', 
    'SESSION_SECRET',
    'REPLIT_DOMAINS',
    'REPL_ID'
  ];

  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing);
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // Validate SESSION_SECRET strength
  if (process.env.SESSION_SECRET!.length < 64) {
    throw new Error('SESSION_SECRET must be at least 64 characters for production security');
  }

  // Validate NODE_ENV
  if (!['development', 'production', 'test'].includes(process.env.NODE_ENV!)) {
    throw new Error('NODE_ENV must be development, production, or test');
  }

  const config: ProductionConfig = {
    NODE_ENV: process.env.NODE_ENV!,
    DATABASE_URL: process.env.DATABASE_URL!,
    SESSION_SECRET: process.env.SESSION_SECRET!,
    REPLIT_DOMAINS: process.env.REPLIT_DOMAINS!,
    REPL_ID: process.env.REPL_ID!,
    CSP_ORIGIN: process.env.CSP_ORIGIN || process.env.REPLIT_DOMAINS!,
    MAX_UPLOAD_MB: parseInt(process.env.MAX_UPLOAD_MB || '50'),
    RATE_LIMIT_WINDOW: parseInt(process.env.RATE_LIMIT_WINDOW || '900'), // 15 minutes
    RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX || '50'),
    STRICT_INDEX_ONLY: process.env.STRICT_INDEX_ONLY === 'true' || process.env.NODE_ENV === 'production'
  };

  console.log('✅ Environment validation passed');
  console.log('📊 Configuration:', {
    environment: config.NODE_ENV,
    domain: config.REPLIT_DOMAINS,
    uploadLimit: `${config.MAX_UPLOAD_MB}MB`,
    rateLimit: `${config.RATE_LIMIT_MAX} requests per ${config.RATE_LIMIT_WINDOW/60} minutes`,
    strictMode: config.STRICT_INDEX_ONLY
  });

  return config;
}

export const config = validateProductionEnvironment();