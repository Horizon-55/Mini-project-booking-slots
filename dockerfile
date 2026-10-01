# ====== Етап 1: Збірка ======
FROM node:22-alpine AS builder

# Встановлюємо робочу директорію всередині контейнера
WORKDIR /app

# Копіюємо файли залежностей
COPY package*.json ./

# Встановлюємо всі залежності (включаючи dev для збірки)
RUN npm ci

# Копіюємо весь вихідний код проєкту
COPY . .

# Компілюємо TypeScript код у JavaScript
RUN npm run build

# ====== Етап 2: Продакшн ======
FROM node:22-alpine AS production

WORKDIR /app

# Копіюємо файли залежностей
COPY package*.json ./

# Встановлюємо тільки продакшн залежності
RUN npm ci --omit=dev

# Копіюємо скомпільований код з етапу збірки
COPY --from=builder /app/dist ./dist

# Відкриваємо порт, на якому працюватиме застосунок
EXPOSE 3000

# Запускаємо під непривілейованим користувачем
USER node

# Запускаємо скомпільований код
CMD ["node", "dist/index.js"]