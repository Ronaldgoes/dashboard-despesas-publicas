import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/dashboard-r2': {
        target: 'https://pub-e8acbbb11489485c8b061c0cc8e9811f.r2.dev',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/dashboard-r2/, ''),
      },
    },
  },
})
