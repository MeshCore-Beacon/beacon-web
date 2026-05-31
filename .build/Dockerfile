FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV VITE_API_BASE=__VITE_API_BASE__
ENV VITE_WS_URL=__VITE_WS_URL__
ENV VITE_MAP_CENTER=__VITE_MAP_CENTER__
ENV VITE_MAP_ZOOM=__VITE_MAP_ZOOM__
RUN npm run build

FROM caddy:2-alpine
COPY .build/Caddyfile /etc/caddy/Caddyfile
COPY .build/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
COPY --from=build /app/dist /srv
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
