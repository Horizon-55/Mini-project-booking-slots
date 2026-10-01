# Використовуємо легкий образ Node.js на базі Alpine Linux
FROM node:18-alpine

# Встановлюємо робочу директорію всередині контейнера
WORKDIR /app

# Копіюємо файли залежностей
COPY package*.json ./

# Встановлюємо всі залежності
RUN npm install

# Копіюємо весь вихідний код проєкту
COPY . .

# Компілюємо TypeScript код у JavaScript
RUN npm run build

# Відкриваємо порт, на якому працюватиме застосунок
EXPOSE 3000

# Запускаємо скомпільований код
CMD ["npm", "start"]