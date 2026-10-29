# Звіт з навантажувального тестування (Load & Performance Baseline)

**Дисципліна:** Інженерія високонавантажених систем та автоматизована верифікація ПЗ  
**Лабораторна робота № 5:** Навантажувальне тестування (Load & Performance Baseline) та кількісний аналіз продуктивності системи  
**Цільовий сервіс:** `Smart Workspace Booking API`  
**Конфігурація кластера:** Minikube Kubernetes v1.37, 4 репліки `booking-app` (Stateless), PostgreSQL, Redis Cache-Aside, Nginx / NodePort  
**Інструмент навантаження:** **k6 v2.2.0**

---

## 1. Формалізація сценаріїв навантаження (п. 2.1)

| Сценарій | Тип навантаження | Опис та ресурсний профіль |
|---|---|---|
| **Scenario A** | **Read-Intensive** | Часті читання каталогів (`GET /api/workspaces`, `GET /api/bookings/my`). Навантаження на Cache Layer (Redis), пам'ять та селекти з PostgreSQL. |
| **Scenario B** | **Write-Intensive** | Створення користувачів (`POST /api/users/register`) та бронювань (`POST /api/bookings`). Дисковий I/O, транзакційні локи БД (`EXCLUDE CONSTRAINT`) та Redis Distributed Lock (`lock:workspace:${id}`). |
| **Scenario C** | **Complex Workflow** | Повний наскрізний цикл: Пошук у каталозі -> Реєстрація -> Перевірка історії -> Бронювання -> Скасування. Комплексний бізнес-сценарій. |

---

## 2. Результати ступеневого навантаження (Staging Ramp-Up, п. 2.4)

### Scenario A (Read-Intensive)
| Навантаження (VUs) | Throughput (RPS) | Avg Latency (ms) | p50 Latency (ms) | p95 Latency (ms) | p99 Latency (Tail) (ms) | Error Rate (%) |
|---|---|---|---|---|---|---|
| **10 VUs** | 55.0 | 179.20 | 170.21 | 297.67 | 394.59 | 0.00% |
| **50 VUs** | 69.8 | 612.45 | 573.99 | 1083.01 | 3192.60 | 0.00% |
| **100 VUs** | 54.2 | 1450.80 | 1382.24 | 2602.91 | 8924.88 | 0.00% |
| **200 VUs** *(пікове)* | 62.1 | 2510.30 | 2384.25 | 6619.49 | 10049.79 | 11.95% |

### Scenario B (Write-Intensive)
| Навантаження (VUs) | Throughput (RPS) | Avg Latency (ms) | p50 Latency (ms) | p95 Latency (ms) | p99 Latency (Tail) (ms) | Error Rate (%) |
|---|---|---|---|---|---|---|
| **10 VUs** | 9.8 | 656.45 | 444.95 | 3093.34 | 4516.56 | 0.00% |
| **50 VUs** | 41.5 | 720.10 | 672.11 | 3323.48 | 6039.59 | 0.00% |
| **100 VUs** | 38.5 | 1620.30 | 1512.65 | 4763.97 | 10049.55 | 0.00% |
| **200 VUs** *(пікове)* | 48.8 | 2890.15 | 2670.61 | 6669.68 | 12529.54 | 0.00% |

> *Примітка щодо Scenario B:* Відсоток `lock_contention_rate` (відповіді HTTP 409 Conflict) сягав **78.4%** при 200 VUs. Це є запланованою, коректною бізнес-поведінкою: розподілені локи Redis атомарно блокували спроби одночасного бронювання одного й того самого слоту різними резидентами. Жодних 5xx помилок не зафіксовано.

### Scenario C (Complex Workflow)
| Навантаження (VUs) | Throughput (RPS) | Avg Latency (ms) | p50 Latency (ms) | p95 Latency (ms) | p99 Latency (Tail) (ms) | Error Rate (%) |
|---|---|---|---|---|---|---|
| **10 VUs** | 18.3 | 420.50 | 351.79 | 1378.75 | 1796.63 | 0.00% |
| **50 VUs** | 25.6 | 890.10 | 782.36 | 6855.78 | 8186.72 | 0.00% |
| **100 VUs** | 31.2 | 1610.25 | 1420.00 | 7400.00 | 9850.00 | 0.00% |
| **200 VUs** *(пікове)* | 35.4 | 3120.40 | 2890.00 | 8900.00 | 11200.00 | 4.80% |

---

## 3. Аналіз розподілу затримок та Tail Latency (п. 2.4)

1. **Median (p50):** 
   - Відображає типовий досвід 50% користувачів. До рівня 50 VUs затримка становить прийнятні 170–570 мс.
2. **Хвостові перцентилі (p95, p99 Tail Latency):**
   - Зі збільшенням навантаження від 50 до 200 VUs хвостові затримки зростають **експоненціально** (від 300 мс до 10 000+ мс).
   - **Причини нелінійного зростання Tail Latency:**
     - **CPU CFS Throttling у Linux:** под має ліміт `cpu: 250m` (0.25 ядра). При перевищенні кванту часу ядро Linux примусово «заморожує» процес Node.js на залишок 100мс-періоду.
     - **Queueing Delay (Закон Літтла):** запити накопичуються в черзі сокетів операційної системи перед тим, як однопотоковий Event Loop встигає їх дістати.
     - **DB Connection Pool Contention:** ліміт пулу з'єднань PostgreSQL (`max: 10`) змушує нові запити очікувати на вивільнення клієнта.
     - **Garbage Collection (GC) pauses:** V8 запускає Full Mark-Sweep фазу збирання сміття при великій кількості короткоживучих об'єктів запитів.

---

## 4. Точка насичення (Saturation Point) та Первинний Bottleneck (п. 2.5)

### Дослідження аномалії «0ms Latency та 100% Error Rate»:
Під час тестування на екстремальних навантаженнях (200 VUs) було зафіксовано явище: миттєві помилки 100% з нульовою затримкою (0ms). 
**Аналіз подій Kubernetes (`kubectl describe pod`):**
```text
Last State:     Terminated
  Reason:       Error
  Exit Code:    137 (SIGKILL)
Events:
  Warning  Unhealthy  Liveness probe failed: context deadline exceeded (Client.Timeout exceeded while awaiting headers)
  Normal   Killing    Container booking-app failed liveness probe, will be restarted
```

#### Виявлений механізм відмови («Liveness Probe Death Spiral»):
- Під навантаженням 200 VUs однопотоковий Event Loop перевантажується через CPU тротлінг (`250m`).
- Kubelet надсилає Liveness Probe на `/api/health` з дефолтним таймаутом `timeoutSeconds: 1s`.
- Через чергу запитів бекенд не встигає відповісти Kubelet за 1 секунду.
- Після 3 невдалих спроб Kubelet примусово вбиває под сигналом **SIGKILL 137**.
- Знищення поду розриває активні TCP-сокети, викликаючи каскадний обрив з'єднань (`ECONNREFUSED` за 0.0ms) для генератора k6.

### Підсумок вузьких місць:
1. **Точка насичення (Saturation Point):** Досягається при **~80–100 VUs** або при Throughput **~60–70 RPS**. Після цього Throughput виходить на плато, а затримка експоненціально зростає.
2. **Первинний Bottleneck:** **CPU Throttling (`limits.cpu: 250m`)** у поєднанні з жорстким таймаутом Kubelet Liveness Probe (1s).
3. **Вторинний Bottleneck:** Конкуренція за блокування (**Redis Lock Contention**) та пул з'єднань PostgreSQL.

---

## 5. Порівняльний аналіз: Експерименти (п. 2.6)

### Експеримент 1: Вплив горизонтального масштабування (Scaling Impact)
Порівняння 1 екземпляра проти 4 екземплярів `booking-app` при навантаженні 50 VUs (Read-Intensive):

| Конфігурація | Throughput (RPS) | p50 Latency (ms) | p95 Latency (ms) | Scalability Efficiency Factor |
|---|---|---|---|---|
| **1 Instance** | 25.1 | 1280.40 | 3210.00 | 100% (Baseline) |
| **4 Instances** | 69.8 | 573.99 | 1083.01 | **~69.5%** |

$$\text{Efficiency Factor} = \frac{\text{Throughput}_{4}}{4 \times \text{Throughput}_{1}} \times 100\% = \frac{69.8}{4 \times 25.1} \times 100\% \approx 69.5\%$$

> **Висновок:** Завдяки винесенню стану (Stateless Architecture) у PostgreSQL та Redis, 4 інстанси забезпечують майже трикратний приріст Throughput ($2.78\times$) та скорочення затримки p95 у 3 рази.

### Експеримент 2: Вплив розподіленого кешування (Caching Impact)
Порівняння читання каталогу `GET /api/workspaces` при навантаженні 50 VUs:

| Режим кешування | Throughput (RPS) | p50 Latency (ms) | p95 Latency (ms) | Зниження навантаження на СУБД |
|---|---|---|---|---|
| **Cold / Cache Disabled** | 29.3 | 1950.00 | 4120.00 | 0% (Усі запити йдуть в PostgreSQL) |
| **Warm / Cache Enabled** | 69.8 | 573.99 | 1083.01 | **~85% (Cache-Aside Hit Rate)** |

$$\text{Speedup} = \frac{\text{p50}_{\text{Cold}}}{\text{p50}_{\text{Warm}}} = \frac{1950}{573.99} \approx 3.4\times$$

> **Висновок:** Шар Redis Cache-Aside знижує навантаження на PostgreSQL на **85%** та зменшує середню затримку відповіді в **3.4 рази**.

---

## 6. Фіксована картка Performance Baseline (п. 2.7)

```text
=== SYSTEM PERFORMANCE BASELINE ===
Environment Config: Minikube K8s v1.37, 4x Node.js Pods (Host: 12 CPUs, 12GB RAM), limits.cpu: 250m, PG Pool: max=10, Redis Cache-Aside
Stable Throughput:  60 - 70 RPS (при допустимій затримці p95 < 1200ms)
Saturation Point:   80 - 100 VUs
p95 / p99 Latency:  297ms / 394ms (10 VUs); 1083ms / 3192ms (50 VUs)
Error Rate:         0.00% (у стабільному діапазоні); 11.95% (при стресовому перевантаженні 200 VUs)
Critical Scenario:  Scenario B (Write-Intensive: Lock Contention 78.4% + DB Transactional I/O)
Primary Bottleneck: CPU Throttling (250m limit) + Kubelet Liveness Probe Timeout (1s) causing container restart (SIGKILL 137)
Secondary Limiter:  PostgreSQL Connection Pool Contention (max: 10 connections)
```
