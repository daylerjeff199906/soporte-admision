# Node 24 ejecuta TypeScript directamente (type stripping); no hay paso de compilación ni dependencias de runtime.
FROM node:24-alpine
WORKDIR /app
COPY apps/api/assets ./apps/api/assets
COPY apps/api/src ./apps/api/src
ENV DATA_DIR=/data
VOLUME /data
USER node
EXPOSE 4351
CMD ["node", "--disable-warning=ExperimentalWarning", "apps/api/src/server.ts"]
