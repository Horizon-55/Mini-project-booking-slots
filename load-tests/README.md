# Навантажувальне тестування (Load & Performance Baseline)

Цей модуль реалізований у межах **Лабораторної роботи № 5** з дисципліни *«Інженерія високонавантажених систем та автоматизована верифікація ПЗ»*.

---

## 1. Архітектура сценаріїв тестування

У директорії `load-tests/` реалізовано три незалежні декларативні сценарії з використанням **k6**:

| Сценарій | Файл | Тип навантаження | Опис та ресурсний профіль |
|---|---|---|---|
| **Scenario A** | `scenarios/read-intensive.js` | **Read-Intensive** | Часті читання каталогів (`GET /api/workspaces`, `GET /api/bookings/my`). Навантаження на Cache Layer (Redis), оперативну пам'ять та зчитування з PostgreSQL. Моніторинг `X-Cache: HIT / MISS`. |
| **Scenario B** | `scenarios/write-intensive.js` | **Write-Intensive** | Створення нових користувачів та бронювань (`POST /api/users/register`, `POST /api/bookings`). Високе дискове I/O, транзакційні локи БД (`EXCLUDE CONSTRAINT`) та Redis Distributed Lock (`lock:workspace:${id}`). |
| **Scenario C** | `scenarios/complex-workflow.js` | **Complex Workflow** | Повний наскрізний бізнес-сценарій: Пошук у каталозі -> Реєстрація резидента -> Перевірка слотів -> Бронювання -> Скасування. Комплексне навантаження на всі підсистеми. |

---

## 2. Моделювання профілю навантаження (Staging Ramp-Up)

Відповідно до вимог п. 2.3 методички, кожен сценарій підтримує ступеневе збільшення навантаження:
1. **Warm-up (15с):** 5 VUs — розігрів JIT V8, ініціалізація пулів з'єднань БД (Connection Pool) та DNS/Redis сокетів.
2. **Рівень 1 (30с):** 10 VUs — базове низьке навантаження.
3. **Рівень 2 (30с):** 50 VUs — середнє робоче навантаження.
4. **Рівень 3 (30с):** 100 VUs — високе навантаження / наближення до точки насичення.
5. **Рівень 4 (30с):** 200 VUs — стресове пікове навантаження (виявлення тротлінгу, черг та відмов).
6. **Cooldown (15с):** плавний спуск до 0.

---

## 3. Запуск тестів

### Запуск через npm:
```bash
# Scenario A (Read-Intensive)
npm run test:load:read

# Scenario B (Write-Intensive)
npm run test:load:write

# Scenario C (Complex Workflow)
npm run test:load:workflow
```

### Запуск напряму через k6 CLI із параметрами:
```bash
# Запуск проти Minikube сервісу
k6 run -e BASE_URL=http://192.168.49.2:30080 load-tests/scenarios/read-intensive.js

# Експрес-тест (наприклад, 20 VUs на 30 секунд)
k6 run --vus 20 --duration 30s -e BASE_URL=http://localhost:3000 load-tests/scenarios/read-intensive.js
```

