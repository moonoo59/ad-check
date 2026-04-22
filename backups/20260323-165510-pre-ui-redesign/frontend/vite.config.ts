import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    host: true,
    // 내부 도메인 허용 (내부 DNS에 등록된 도메인 접속 허용)
    allowedHosts: ['adcheck.tech.net'],
    // Vite dev server → 백엔드 프록시
    // 이 설정으로 다른 PC에서 접속 시에도 /api 요청이 서버의 localhost:4000으로 정확히 전달됨
    // (브라우저가 자신의 localhost:4000 대신 서버의 4000 포트로 요청)
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
