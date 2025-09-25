import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    proxy: {
      '/admin/api': {
        target: 'http://admin:8000',
        changeOrigin: true,
      },
      '/admin/ws': {
        target: 'ws://admin:8000',
        ws: true,
      }
    }
  },
  base: '/admin'
})