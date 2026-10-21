import { defineConfig } from 'vite';

// Two pages: the portfolio at / and p3n's install page at /p3n/.
export default defineConfig({
  build: {
    rolldownOptions: {
      input: {
        index: 'index.html',
        p3n: 'p3n/index.html',
      },
    },
  },
});
