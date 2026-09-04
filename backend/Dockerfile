FROM node:20-alpine

WORKDIR /app

COPY backend/package.json backend/package-lock.json ./backend/
RUN cd backend && npm ci --omit=dev

COPY backend ./backend
RUN mkdir -p /app/backend/data /app/pwa-tracker/release /app/backend/public

WORKDIR /app/backend

ENV NODE_ENV=production
ENV PORT=4001
ENV APK_PATH=/app/pwa-tracker/release/live-tracker.apk

EXPOSE 4001

CMD ["node", "src/index.js"]
