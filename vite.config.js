import react from '@vitejs/plugin-react';
import laravel from 'laravel-vite-plugin';
import {
    defineConfig
} from 'vite';
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
    plugins: [
        laravel({
            // rooms/show.tsx указан явно: без этого Rollup сливает страницу во
            // внутренний чанк (из-за динамических импортов pixi) и она
            // пропадает из манифеста — @vite в blade падает в проде
            input: ['resources/css/app.css', 'resources/js/app.tsx', 'resources/js/pages/rooms/show.tsx', 'resources/js/pages/rooms/edit.tsx'],
            ssr: 'resources/js/ssr.jsx',
            refresh: true,
        }),
        react(),
        tailwindcss(),
    ],
    esbuild: {
        jsx: 'automatic',
    },
});