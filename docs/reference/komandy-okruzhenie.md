# Справочник: команды и переменные окружения

## Запуск

| Команда                                 | Что делает                                                             |
| --------------------------------------- | ---------------------------------------------------------------------- |
| `docker compose up -d`                  | весь стек в контейнерах: app (8000), reverb (8080), vite (5173), queue |
| `docker compose --profile webrtc up -d` | то же + coturn (TURN/STUN для WebRTC вне LAN)                          |
| `docker compose down`                   | остановить                                                             |
| `composer run dev`                      | запуск без Docker: serve + queue + pail + vite + reverb одной командой |

## Разработка

| Команда                                  | Что делает                     |
| ---------------------------------------- | ------------------------------ |
| `npm run dev`                            | Vite в режиме разработки (HMR) |
| `npm run build`                          | продакшн-сборка фронтенда      |
| `npm run format`                         | Prettier                       |
| `npm run lint`                           | ESLint                         |
| `php artisan migrate`                    | миграции                       |
| `php artisan db:seed`                    | сидеры (комнаты)               |
| `php artisan db:seed --class=RoomSeeder` | только комнаты                 |

В Docker выполняйте artisan-команды внутри контейнера:
`docker compose exec app php artisan …`.

## Тесты

| Команда                   | Что проверяет                                            |
| ------------------------- | -------------------------------------------------------- |
| `./vendor/bin/phpunit`    | PHP: маршруты, авторизация каналов, API, редактор карт   |
| `npm test` (`vitest run`) | JS: карты, коллизии, `canHear`, гардероб, BFS, proximity |

CI (`.github/workflows/`) гоняет оба набора на каждый push в `main`.

## Ключевые переменные окружения

### Приложение и Docker

| Переменная             | Назначение                                   |
| ---------------------- | -------------------------------------------- |
| `APP_PORT`             | порт приложения на хосте (по умолчанию 8000) |
| `WWWUSER`, `WWWGROUP`  | uid/gid для прав на volume (1000)            |
| `BROADCAST_CONNECTION` | драйвер вещания (`reverb`)                   |
| `QUEUE_CONNECTION`     | очередь для broadcast-событий                |

### Reverb (WebSocket)

| Переменная                                    | Назначение                             |
| --------------------------------------------- | -------------------------------------- |
| `REVERB_APP_ID/KEY/SECRET`                    | ключи приложения Reverb                |
| `REVERB_HOST`, `REVERB_PORT`, `REVERB_SCHEME` | адрес для серверной публикации         |
| `VITE_REVERB_APP_KEY/HOST/PORT/SCHEME`        | адрес для браузера (вшивается в бандл) |

### WebRTC (ICE)

| Переменная                          | Назначение                                  |
| ----------------------------------- | ------------------------------------------- |
| `VITE_STUN_URL`                     | STUN-сервер (пусто = только host-кандидаты) |
| `VITE_TURN_URL/USERNAME/CREDENTIAL` | TURN-сервер для работы за NAT               |
| `TURN_USERNAME`, `TURN_CREDENTIAL`  | учётные данные coturn                       |

> `VITE_*` вшиваются на этапе сборки — после их изменения нужен перезапуск Vite
> (dev) или пересборка (`npm run build`).

## Тестовые пользователи (dev)

| E-mail               | Роль          | Пароль     |
| -------------------- | ------------- | ---------- |
| `anya@voffice.test`  | администратор | `password` |
| `borya@voffice.test` | обычный       | `password` |
