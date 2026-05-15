FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --no-audit --no-fund

COPY . .

EXPOSE 3001

ENV CHOKIDAR_USEPOLLING=true

# Синхронизирует node_modules в anonymous volume при изменении package.json
CMD ["sh", "-c", "npm install --no-audit --no-fund && npm run dev -- --host 0.0.0.0 --port 3001"]

