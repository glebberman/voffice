# Справочник: HTTP API и маршруты

Все прикладные маршруты объявлены в `routes/web.php` и защищены middleware
`auth`. Ответы для страниц — Inertia; для действий — JSON или redirect.

## Страницы (Inertia)

| Метод | Путь                      | Имя           | Контроллер             | Описание                                    |
| ----- | ------------------------- | ------------- | ---------------------- | ------------------------------------------- |
| GET   | `/rooms`                  | `rooms.index` | `RoomController@index` | лобби со списком комнат                     |
| GET   | `/rooms/{room:slug}`      | `rooms.show`  | `RoomController@show`  | комната (сцена, чат, звонок)                |
| GET   | `/rooms/{room:slug}/edit` | `rooms.edit`  | `RoomController@edit`  | редактор карт (**только admin**, иначе 403) |
| GET   | `/office`                 | `office`      | замыкание              | redirect в последнюю/дефолтную комнату      |

### Пропсы `rooms.show`

```
room        { id, slug, name, map }   // map — см. «Формат карты»
history     RoomMessage[]             // последние 50 сообщений комнаты
lastPosition{ x, y } | null           // сохранённая позиция (в этой же комнате)
canEdit     boolean                   // администратор ли текущий пользователь
```

### Пропсы `rooms.edit`

```
room   { id, slug, name, map }
rooms  { slug, name }[]               // для выбора цели портала
```

## Действия (JSON)

### `POST /messages` — отправить сообщение в чат комнаты

Тело: `{ body: string (≤500), room_id: int (exists:rooms) }`.
Ответ `201`: `{ id, userId, name, body, at }`. Порождает broadcast-событие
`MessageSent` (через очередь), исключая сокет отправителя по заголовку
`X-Socket-ID`.

### `POST /position` — сохранить позицию

Тело: `{ x: 0..255, y: 0..255, room_id: int (exists:rooms) }`.
Ответ `204`. Пишет `users.last_x/last_y/last_room_id`. Клиент шлёт периодически
и через `navigator.sendBeacon` при закрытии вкладки.

### `POST /avatar` — сохранить внешность

Тело: `{ body, hair, top, legs, tie }`. Все значения валидируются по
`resources/wardrobe.json` (белый список — защищает от подстановки чужих путей).
Ответ `200`: сохранённый конфиг.

### `PUT /rooms/{room:slug}` — сохранить карту (**только admin**)

Тело: `{ name: string (≤60), map: {...} }`. Валидируется `MapUpdateRequest`:
структура (типы полей) и геометрия (одинаковая ширина строк, проходимый спавн,
порталы в границах, `portals.*.to` существует в `rooms`).
Ответ: redirect на `rooms.show`. Не-администратору — `403`.

## Аутентификация

Маршруты входа/регистрации/сброса пароля предоставляет Laravel React starter kit
(`routes/auth.php`, `routes/settings.php`). Кастомная логика voffice их не меняет.
