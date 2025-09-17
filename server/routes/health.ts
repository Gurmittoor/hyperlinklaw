import { Router } from 'express';
import { healthCheck, readinessCheck, monitoring } from '../utils/monitoring';
import { generalLimiter } from '../middleware/security';

const router = Router();

// Apply rate limiting to health endpoints
router.use(generalLimiter);

// Liveness probe - indicates if the application is running
router.get('/health', healthCheck);
router.get('/healthz', healthCheck); // Kubernetes-style health check

// Readiness probe - indicates if the application is ready to serve traffic
router.get('/ready', readinessCheck);
router.get('/readyz', readinessCheck); // Kubernetes-style readiness check

// Detailed metrics endpoint (protected)
router.get('/metrics', async (req, res) => {
  try {
    const metrics = await monitoring.getHealthMetrics();
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve metrics' });
  }
});

// Version info
router.get('/version', (req, res) => {
  res.json({
    name: 'hyperlinklaw.com',
    version: process.env.APP_VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    buildDate: process.env.BUILD_DATE || new Date().toISOString(),
    gitCommit: process.env.GIT_COMMIT || 'unknown'
  });
});

export default router;