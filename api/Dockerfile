FROM node:20-alpine
WORKDIR /app
# Copier uniquement package.json en premier pour profiter du cache Docker :
# si package.json n'a pas changé, "npm install" n'est pas rejoué
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
# Copier le reste du code (node_modules est exclu via .dockerignore)
COPY . .
EXPOSE 3001
CMD ["node", "server.js"]
