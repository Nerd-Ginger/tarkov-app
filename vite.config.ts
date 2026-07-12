import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// viteSingleFile inlines all JS/CSS into one index.html so it opens straight from
// a double-click (file://) with no server or install.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
})
