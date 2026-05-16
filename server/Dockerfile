FROM node:20-alpine

RUN npm install -g pnpm

WORKDIR /app

# 1. Copy the package files first
COPY package.json pnpm-lock.yaml* ./

# 2. Copy the prisma folder into the container
# This looks for the "prisma" folder right next to this Dockerfile
COPY prisma ./prisma/

# 3. Install dependencies
RUN pnpm install

# 4. Generate the Prisma Client for the Linux container
RUN pnpm prisma generate

# 5. Copy the rest of your code
COPY . .

EXPOSE 3001

CMD ["pnpm", "run", "dev"]