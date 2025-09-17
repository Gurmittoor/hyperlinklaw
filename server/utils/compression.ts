import { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';

// Static asset optimization middleware
export const staticAssetOptimization = (req: Request, res: Response, next: NextFunction) => {
  const staticPaths = ['/assets/', '/images/', '/fonts/', '/js/', '/css/'];
  const isStaticAsset = staticPaths.some(path => req.path.startsWith(path));

  if (isStaticAsset) {
    // Set aggressive caching for static assets with hashed filenames
    const hasHash = /\.[a-f0-9]{8,}\.(js|css|png|jpg|jpeg|gif|svg|woff2?|eot|ttf)$/i.test(req.path);
    
    if (hasHash) {
      // Immutable assets with hash - cache for 1 year
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      // Non-hashed assets - cache for 1 day with revalidation
      res.setHeader('Cache-Control', 'public, max-age=86400, must-revalidate');
    }

    // Enable compression
    res.setHeader('Vary', 'Accept-Encoding');
    
    // Set proper content types
    if (req.path.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    } else if (req.path.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
    } else if (req.path.match(/\.(woff2?|eot|ttf)$/)) {
      res.setHeader('Content-Type', 'font/' + req.path.split('.').pop());
    }

    // Generate ETag for cache validation
    const etag = createHash('md5').update(req.path + req.get('if-none-match')).digest('hex');
    res.setHeader('ETag', `"${etag}"`);

    if (req.get('if-none-match') === `"${etag}"`) {
      return res.status(304).end();
    }
  }

  next();
};

// GZIP compression for responses
export const enableCompression = (req: Request, res: Response, next: NextFunction) => {
  const acceptEncoding = req.get('Accept-Encoding') || '';
  
  if (acceptEncoding.includes('gzip')) {
    res.setHeader('Content-Encoding', 'gzip');
  }
  
  next();
};

// CDN-ready headers
export const cdnHeaders = (req: Request, res: Response, next: NextFunction) => {
  // Allow CDN caching for static content
  if (req.path.startsWith('/api/')) {
    // API responses should not be cached by CDN
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  } else {
    // Static content can be cached by CDN
    res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour default
  }

  // Enable CDN to vary responses based on user agent for mobile optimization
  res.setHeader('Vary', 'Accept-Encoding, User-Agent');

  next();
};