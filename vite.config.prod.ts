import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client/src"),
      "@shared": path.resolve(__dirname, "./shared"),
      "@assets": path.resolve(__dirname, "./attached_assets"),
    },
  },
  build: {
    outDir: 'dist/client',
    sourcemap: false, // Disable sourcemaps in production for security
    minify: 'esbuild',
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'pdf-lib': ['pdf-lib'],
          'ui-lib': ['@radix-ui/react-dialog', '@radix-ui/react-button', '@radix-ui/react-form'],
          'query-lib': ['@tanstack/react-query'],
          'router': ['wouter'],
          'icons': ['lucide-react', 'react-icons'],
        },
        chunkFileNames: 'chunks/[name]-[hash].js',
        entryFileNames: 'js/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          const extType = assetInfo.name?.split('.').pop();
          if (/^(png|jpe?g|svg|gif|tiff|bmp|ico)$/i.test(extType || '')) {
            return 'images/[name]-[hash][extname]';
          }
          if (/^(woff2?|eot|ttf|otf)$/i.test(extType || '')) {
            return 'fonts/[name]-[hash][extname]';
          }
          return 'assets/[name]-[hash][extname]';
        },
      }
    },
    cssCodeSplit: true,
    chunkSizeWarningLimit: 1000,
  },
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
});