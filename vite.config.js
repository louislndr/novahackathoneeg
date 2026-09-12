import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: [
      'webgazer',
      '@tensorflow/tfjs',
      '@tensorflow-models/face-landmarks-detection',
    ],
  },
})
