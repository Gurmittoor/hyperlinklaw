import { Request, Response, NextFunction } from 'express';

export interface HealthMetrics {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  environment: string;
  version: string;
  memory: {
    used: number;
    total: number;
    external: number;
    heapUsed: number;
    heapTotal: number;
  };
  database: {
    connected: boolean;
    responseTime?: number;
  };
  metrics: {
    totalRequests: number;
    activeRequests: number;
    averageResponseTime: number;
    errorRate: number;
  };
}

class MonitoringService {
  private requestCount = 0;
  private activeRequests = 0;
  private responseTimes: number[] = [];
  private errorCount = 0;
  private readonly maxMetrics = 1000;

  recordRequest(req: Request, res: Response, next: NextFunction) {
    const startTime = Date.now();
    this.requestCount++;
    this.activeRequests++;

    res.on('finish', () => {
      const duration = Date.now() - startTime;
      this.responseTimes.push(duration);
      this.activeRequests--;

      if (res.statusCode >= 400) {
        this.errorCount++;
      }

      // Keep only recent metrics
      if (this.responseTimes.length > this.maxMetrics) {
        this.responseTimes.shift();
      }

      // Log slow requests
      if (duration > 5000) {
        console.warn(`Slow request: ${req.method} ${req.path} took ${duration}ms`);
      }
    });

    next();
  }

  async getHealthMetrics(): Promise<HealthMetrics> {
    const memoryUsage = process.memoryUsage();
    const averageResponseTime = this.responseTimes.length > 0 
      ? this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length 
      : 0;
    
    const errorRate = this.requestCount > 0 
      ? (this.errorCount / this.requestCount) * 100 
      : 0;

    // Test database connection
    let databaseHealth = { connected: false, responseTime: undefined };
    try {
      const dbStart = Date.now();
      // Add your database health check here
      // await db.query('SELECT 1');
      databaseHealth = {
        connected: true,
        responseTime: Date.now() - dbStart
      };
    } catch (error) {
      console.error('Database health check failed:', error);
    }

    const status = this.determineHealthStatus(averageResponseTime, errorRate, databaseHealth.connected);

    return {
      status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: process.env.APP_VERSION || '1.0.0',
      memory: {
        used: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
        total: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
        external: Math.round(memoryUsage.external / 1024 / 1024), // MB
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
      },
      database: databaseHealth,
      metrics: {
        totalRequests: this.requestCount,
        activeRequests: this.activeRequests,
        averageResponseTime: Math.round(averageResponseTime),
        errorRate: Math.round(errorRate * 100) / 100,
      }
    };
  }

  private determineHealthStatus(avgResponseTime: number, errorRate: number, dbConnected: boolean): 'healthy' | 'unhealthy' | 'degraded' {
    if (!dbConnected || errorRate > 10) {
      return 'unhealthy';
    }
    if (avgResponseTime > 2000 || errorRate > 5) {
      return 'degraded';
    }
    return 'healthy';
  }

  reset() {
    this.requestCount = 0;
    this.activeRequests = 0;
    this.responseTimes = [];
    this.errorCount = 0;
  }
}

export const monitoring = new MonitoringService();

// Health check endpoint handler
export const healthCheck = async (req: Request, res: Response) => {
  try {
    const health = await monitoring.getHealthMetrics();
    const statusCode = health.status === 'healthy' ? 200 : 
                      health.status === 'degraded' ? 200 : 503;
    
    res.status(statusCode).json(health);
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed'
    });
  }
};

// Readiness check (for Kubernetes/container orchestration)
export const readinessCheck = async (req: Request, res: Response) => {
  try {
    // Add specific readiness checks here (database, external services, etc.)
    const isReady = true; // Replace with actual readiness logic
    
    if (isReady) {
      res.status(200).json({ status: 'ready', timestamp: new Date().toISOString() });
    } else {
      res.status(503).json({ status: 'not ready', timestamp: new Date().toISOString() });
    }
  } catch (error) {
    res.status(503).json({ status: 'not ready', error: error.message });
  }
};