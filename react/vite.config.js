// Configuração do Vite (a ferramenta que transforma o React em site pronto).
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
