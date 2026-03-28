FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

EXPOSE 3000

CMD ["sh", "-c", "node createDb.js && node scripts/init.js && node server.js"]
