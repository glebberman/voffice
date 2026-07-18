# Справочник: структура проекта

Проект — приложение Laravel (React starter kit) с игровым слоем на PixiJS и
realtime на Laravel Reverb. Ниже — назначение ключевых файлов.

## Бэкенд (PHP)

| Путь                                          | Назначение                                                     |
| --------------------------------------------- | -------------------------------------------------------------- |
| `routes/web.php`                              | HTTP-маршруты (комнаты, сообщения, позиция, аватар)            |
| `routes/channels.php`                         | авторизация broadcast-каналов (`room.{id}`)                    |
| `app/Models/Room.php`                         | комната: `slug`, `name`, `map` (JSON)                          |
| `app/Models/Message.php`                      | сообщение чата комнаты                                         |
| `app/Models/User.php`                         | пользователь: `avatar`, `last_x/y`, `last_room_id`, `is_admin` |
| `app/Http/Controllers/RoomController.php`     | лобби, комната, редактор, сохранение карты                     |
| `app/Http/Controllers/MessageController.php`  | `POST /messages`                                               |
| `app/Http/Controllers/PositionController.php` | `POST /position`                                               |
| `app/Http/Controllers/AvatarController.php`   | `POST /avatar`, валидация по гардеробу                         |
| `app/Http/Requests/MapUpdateRequest.php`      | валидация структуры и геометрии карты                          |
| `app/Events/MessageSent.php`                  | серверное broadcast-событие чата комнаты                       |
| `database/migrations/`                        | схема (users, rooms, messages + правки users)                  |
| `database/seeders/RoomSeeder.php`             | заливка комнат из `resources/maps/*.json`                      |

## Игровой слой (TypeScript, `resources/js/game/`)

| Файл             | Назначение                                                                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `map.ts`         | `makeMap(data)` → `GameMap`: тайлы, коллизии, зоны, `canHear`, `isSpotlight`, порталы, объекты; `resizeRows`/`setTile`/`fillRect` для редактора |
| `scene.ts`       | `OfficeScene` — рендер на PixiJS: камера, чанки карты, аватары, реакции, порталы                                                                |
| `camera.ts`      | `cameraOffset` (следование за игроком + кламп), `visibleChunkRange`, `approach`                                                                 |
| `avatar.ts`      | сборка аватара из слоёв LPC; `lookFromConfig`, `lookFor`                                                                                        |
| `path.ts`        | `findStep` — BFS-поиск пути (для режима «следовать»)                                                                                            |
| `types.ts`       | типы состояний и whisper-нагрузок                                                                                                               |
| `tile-colors.ts` | CSS-цвета и подписи тайлов для редактора                                                                                                        |

## Realtime и звонки

| Файл                                 | Назначение                                                        |
| ------------------------------------ | ----------------------------------------------------------------- |
| `resources/js/hooks/use-office.ts`   | центральный хук: presence, whisper-события, движение, чат, звонки |
| `resources/js/lib/echo.ts`           | инстанс Laravel Echo (Reverb)                                     |
| `resources/js/lib/api.ts`            | `postJson`, `beacon` (для `sendBeacon`)                           |
| `resources/js/webrtc/proximity.ts`   | чистые функции: `callPeers`, `volumeForDistance`, `isInitiator`   |
| `resources/js/webrtc/mesh.ts`        | `Mesh` — WebRTC-соединения (perfect negotiation)                  |
| `resources/js/webrtc/audio-meter.ts` | детектор речи (AnalyserNode)                                      |
| `resources/js/webrtc/config.ts`      | ICE-серверы из env                                                |

## Страницы и компоненты (React/Inertia)

| Файл                                        | Назначение                            |
| ------------------------------------------- | ------------------------------------- |
| `resources/js/pages/rooms/index.tsx`        | лобби со списком комнат               |
| `resources/js/pages/rooms/show.tsx`         | комната: сцена, чат, звонок, действия |
| `resources/js/pages/rooms/edit.tsx`         | редактор карт (admin)                 |
| `resources/js/components/call-panel.tsx`    | панель звонка и видео-плитки          |
| `resources/js/components/avatar-editor.tsx` | конструктор персонажа                 |

## Данные и ассеты

| Путь                      | Назначение                                                     |
| ------------------------- | -------------------------------------------------------------- |
| `resources/maps/*.json`   | исходные карты комнат (единый источник для сидера и js-тестов) |
| `resources/wardrobe.json` | гардероб: единый источник для `avatar.ts` и `AvatarController` |
| `public/assets/lpc/`      | пиксель-арт LPC (персонажи, мебель, полы) + `CREDITS.md`       |

## Тесты

| Путь                  | Что покрывает                                                                    |
| --------------------- | -------------------------------------------------------------------------------- |
| `tests/Feature/*.php` | HTTP-маршруты, авторизация каналов, API сообщений/позиции/аватара, редактор карт |
| `tests/js/*.test.ts`  | целостность карт, коллизии, `canHear`, гардероб, BFS-путь, proximity звонка      |

## Инфраструктура

| Путь                 | Назначение                                                           |
| -------------------- | -------------------------------------------------------------------- |
| `compose.yaml`       | сервисы app / reverb / vite / queue (+ coturn под профилем `webrtc`) |
| `.github/workflows/` | CI: линт и тесты (PHPUnit + Vitest)                                  |
| `vite.config.js`     | сборка; страницы с pixi заданы явными входами                        |
| `ROADMAP.md`         | план развития (этапы 1–6 пройдены)                                   |
