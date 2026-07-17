# Справочник: база данных

СУБД по умолчанию — SQLite (`database/database.sqlite`). Ниже — таблицы,
относящиеся к voffice (служебные таблицы Laravel — cache, jobs, sessions — опущены).

## `users`

Базовые поля из стартер-кита плюс добавленные проектом:

| Поле                        | Тип                    | Описание                                          |
| --------------------------- | ---------------------- | ------------------------------------------------- |
| `id`                        | bigint                 | PK                                                |
| `name`, `email`, `password` | string                 | стандартные                                       |
| `avatar`                    | json, nullable         | конфиг внешности `{ body, hair, top, legs, tie }` |
| `last_x`, `last_y`          | smallint, nullable     | последняя позиция                                 |
| `last_room_id`              | bigint, nullable       | комната последней позиции                         |
| `is_admin`                  | boolean, default false | может редактировать карты                         |

Миграции: `add_avatar_to_users_table`, `add_last_position_to_users_table`,
`add_last_room_id_to_users_table`, `add_is_admin_to_users_table`.

## `rooms`

| Поле         | Тип            | Описание                              |
| ------------ | -------------- | ------------------------------------- |
| `id`         | bigint         | PK                                    |
| `slug`       | string, unique | идентификатор в URL (`/rooms/{slug}`) |
| `name`       | string         | отображаемое название                 |
| `map`        | json           | карта комнаты (см. «Формат карты»)    |
| `timestamps` |                |                                       |

Заполняется `RoomSeeder` из `resources/maps/*.json`.

## `messages`

Персистентный чат комнаты.

| Поле         | Тип                           | Описание            |
| ------------ | ----------------------------- | ------------------- |
| `id`         | bigint                        | PK                  |
| `room_id`    | bigint, index                 | комната (default 1) |
| `user_id`    | FK → users, cascade on delete | автор               |
| `body`       | string(500)                   | текст               |
| `timestamps` |                               |                     |

## Связи

- `User hasMany Message`
- `Room hasMany Message`
- `Message belongsTo User`

## Заполнение

```bash
php artisan migrate           # схема
php artisan db:seed           # DatabaseSeeder → RoomSeeder (комнаты)
```

Тестовые пользователи (`anya@voffice.test` — админ, `borya@voffice.test`) в
сидер не входят — они созданы отдельно в dev-окружении. Пароль у обоих `password`.

## Что где хранится (эфемерное vs персистентное)

В БД лежит только **персистентное**: пользователи, комнаты, история чата,
последняя позиция, внешность. **Эфемерное** — текущие координаты, статусы,
реакции, состав звонка — в БД не пишется, живёт в памяти клиентов и передаётся
whisper-ами. См. [Пояснение про архитектуру](../explanation/arhitektura.md).
