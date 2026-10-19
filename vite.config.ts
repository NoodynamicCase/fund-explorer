import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Normal build  -> static site for GitHub Pages (data fetched from ./data/*.json).
// Preview build -> ONE self-contained html file with sample data baked in
//                  (used for look-and-feel previews; never deployed).
export default defineConfig(({ mode }) => {
  const preview = mode === 'preview'
  return {
    base: './',
    plugins: [react(), ...(preview ? [viteSingleFile()] : [])],
    define: { __PREVIEW__: JSON.stringify(preview) },
    build: { chunkSizeWarningLimit: 1500 },
    test: { environment: 'node', include: ['src/**/*.test.ts'] },
  }
})
