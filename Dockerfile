FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

# Estas carpetas se sobrescriben con el volumen persistente en Northflank,
# pero deben existir para que la app arranque si no hay volumen montado todavía.
RUN mkdir -p data uploads

EXPOSE 3000

CMD ["node", "server.js"]
