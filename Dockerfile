# Hugging Face Spaces — Todo App Pro backend (API + frontend)
# Free CPU Basic hardware, always-on, no credit card required.
# HF Spaces injects PORT=7860 automatically; set here for clarity.

FROM node:20-slim

WORKDIR /app

# Install dependencies first (better layer caching)
COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev

# Copy source — server must sit at /app/server and frontend at /app/TO-DO APP
# (server.js resolves the frontend via path.join(__dirname, '..', 'TO-DO APP'))
COPY server/ ./server/
COPY ["TO-DO APP/", "./TO-DO APP/"]

ENV NODE_ENV=production
ENV PORT=7860
EXPOSE 7860

WORKDIR /app/server
CMD ["node", "server.js"]
