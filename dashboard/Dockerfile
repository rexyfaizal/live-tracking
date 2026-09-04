# Build dashboard (tanpa VITE_API_URL → browser pakai hostname:4001)
FROM node:20-alpine AS build

WORKDIR /app
COPY dashboard/package.json dashboard/package-lock.json ./
RUN npm ci
COPY dashboard ./
RUN npm run build

FROM nginx:1.27-alpine
COPY dashboard/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
