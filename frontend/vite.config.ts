import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // '@/' 경로를 'src/' 로 매핑 — shadcn/ui 컴포넌트 임포트 경로 단순화
      '@': path.resolve(__dirname, './src'),
    },
    // pnpm 환경에서 react/react-dom이 두 경로로 resolve되어 "Invalid hook call" 오류 방지
    // (루트 node_modules에 호이스팅된 버전과 .pnpm 가상 스토어 버전이 공존할 때)
    dedupe: ['react', 'react-dom'],
  },
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
