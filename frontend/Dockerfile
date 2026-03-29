FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

# Build needs dummy env vars (Next.js collects page data during build)
# These are overridden at runtime by docker-compose environment
ENV SECRET_KEY=build-time-placeholder
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN npm run build
ENV SECRET_KEY=
ENV DATABASE_URL=

CMD ["npm", "start", "--", "--hostname", "0.0.0.0", "--port", "3000"]
