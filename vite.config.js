import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // webgazer and its TF/MediaPipe deps are loaded via <script> tag in index.html,
    // NOT bundled by Vite — bundling breaks MediaPipe's emscripten FaceMesh globals.
    exclude: ['webgazer'],
  },
})
