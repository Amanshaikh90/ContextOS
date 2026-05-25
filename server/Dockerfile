FROM node:20-alpine

RUN npm install -g pnpm

WORKDIR /app

# 1. Copy the package files first
COPY package.json pnpm-lock.yaml* ./

# 2. Copy the prisma folder into the container
COPY prisma ./prisma/

# 3. Install dependencies
RUN pnpm install

# 4. Generate the Prisma Client for the Linux container
RUN pnpm prisma generate

# 5. Copy the rest of your code
COPY . .

# 6. Build/compile TypeScript to production JavaScript files
RUN pnpm run build

# ⚡ EXPOSE the environment port that Railway requires
EXPOSE 3001

# ⚡ CHANGE: Execute the production script containing the automatic Prisma migration 
CMD ["pnpm", "run", "start"]