import { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { cases } from '@shared/schema';
import { eq } from 'drizzle-orm';

// Extend Request type to include user and tenant info
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        claims?: {
          sub: string;
          email?: string;
        };
      };
      tenantId?: string;
    }
  }
}

// Middleware to extract tenant ID from authenticated user
export const extractTenantId = (req: Request, res: Response, next: NextFunction) => {
  if (req.user?.claims?.sub) {
    // In this implementation, each user is their own tenant
    // In a multi-tenant SaaS, you'd look up the user's organization
    req.tenantId = req.user.claims.sub;
  }
  next();
};

// Middleware to ensure case access is restricted to tenant
export const validateCaseAccess = async (req: Request, res: Response, next: NextFunction) => {
  const caseId = req.params.caseId || req.params.id;
  const tenantId = req.tenantId;

  if (!caseId || !tenantId) {
    return res.status(400).json({ error: 'Missing case ID or tenant information' });
  }

  try {
    // Check if the case belongs to the current tenant
    const [caseRecord] = await db
      .select()
      .from(cases)
      .where(eq(cases.id, caseId));

    if (!caseRecord) {
      return res.status(404).json({ error: 'Case not found' });
    }

    if (caseRecord.userId !== tenantId) {
      return res.status(403).json({ error: 'Access denied to this case' });
    }

    // Add case to request for use in route handlers
    req.case = caseRecord;
    next();
  } catch (error) {
    console.error('Error validating case access:', error);
    res.status(500).json({ error: 'Failed to validate access' });
  }
};

// Middleware to filter database queries by tenant
export const filterByTenant = (tenantId: string) => {
  return {
    cases: (query: any) => query.where(eq(cases.userId, tenantId)),
    // Add other entity filters as needed
  };
};

// Audit logging for tenant access
export const auditTenantAccess = (req: Request, res: Response, next: NextFunction) => {
  const originalJson = res.json;
  
  res.json = function(data) {
    // Log access for security auditing
    if (req.tenantId && req.method !== 'GET') {
      console.log('Tenant Access Log:', {
        tenantId: req.tenantId,
        method: req.method,
        path: req.path,
        timestamp: new Date().toISOString(),
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        success: res.statusCode < 400
      });
    }
    
    return originalJson.call(this, data);
  };
  
  next();
};

// Validate environment variables for tenant isolation
export const validateTenantConfig = () => {
  const requiredVars = [
    'DATABASE_URL',
    'SESSION_SECRET',
    'NODE_ENV'
  ];

  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables for tenant isolation: ${missing.join(', ')}`);
  }

  // Ensure session secret is strong enough
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters for secure tenant isolation');
  }
};