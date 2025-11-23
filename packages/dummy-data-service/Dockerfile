FROM node:18-bullseye
WORKDIR /app
COPY package*.json ./
COPY tsconfig.json ./
COPY src ./src
RUN npm install
RUN npm run build
EXPOSE 4000
CMD ["npm", "run", "start"]
