export interface PerformanceMetrics {
  timestamp: string;
  endpoint: string;
  method: string;
  duration: number;
  statusCode: number;
  memoryUsage: NodeJS.MemoryUsage;
  uptime: number;
}

class PerformanceMonitor {
  private metrics: PerformanceMetrics[] = [];
  private readonly maxMetrics = 1000; // Keep last 1000 requests

  recordRequest(endpoint: string, method: string, duration: number, statusCode: number) {
    const metric: PerformanceMetrics = {
      timestamp: new Date().toISOString(),
      endpoint,
      method,
      duration,
      statusCode,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime()
    };

    this.metrics.push(metric);
    
    // Keep only recent metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift();
    }

    // Log slow requests
    if (duration > 5000) { // 5 seconds
      console.warn(`Slow request detected: ${method} ${endpoint} took ${duration}ms`);
    }
  }

  getMetrics(limit: number = 100): PerformanceMetrics[] {
    return this.metrics.slice(-limit);
  }

  getAverageResponseTime(minutes: number = 5): number {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    const recentMetrics = this.metrics.filter(m => new Date(m.timestamp) > cutoff);
    
    if (recentMetrics.length === 0) return 0;
    
    const totalDuration = recentMetrics.reduce((sum, m) => sum + m.duration, 0);
    return Math.round(totalDuration / recentMetrics.length);
  }

  getErrorRate(minutes: number = 5): number {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    const recentMetrics = this.metrics.filter(m => new Date(m.timestamp) > cutoff);
    
    if (recentMetrics.length === 0) return 0;
    
    const errorCount = recentMetrics.filter(m => m.statusCode >= 400).length;
    return Math.round((errorCount / recentMetrics.length) * 100);
  }

  getHealthStatus() {
    const avgResponseTime = this.getAverageResponseTime();
    const errorRate = this.getErrorRate();
    const memoryUsage = process.memoryUsage();
    
    return {
      status: avgResponseTime < 2000 && errorRate < 5 ? 'healthy' : 'degraded',
      averageResponseTime: avgResponseTime,
      errorRate: errorRate,
      uptime: process.uptime(),
      memory: {
        used: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
        total: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
        external: Math.round(memoryUsage.external / 1024 / 1024) // MB
      },
      timestamp: new Date().toISOString()
    };
  }
}

export const performanceMonitor = new PerformanceMonitor();