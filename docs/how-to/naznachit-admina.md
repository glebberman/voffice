# Как назначить пользователя администратором

Администратор (`users.is_admin = true`) может редактировать карты комнат. Обычные
пользователи — нет. Флаг проверяется и на бэкенде (маршруты редактора отдают 403
не-администраторам), и на фронтенде (кнопка «Редактор» и сам роут).

## Через tinker (разовая правка)

```bash
docker compose exec app php artisan tinker
```

```php
App\Models\User::where('email', 'user@example.com')->update(['is_admin' => true]);
```

## Через фабрику (в тестах и сидерах)

У `UserFactory` есть состояние `admin()`:

```php
$admin = User::factory()->admin()->create();
```

## Как это работает

- Флаг `is_admin` (boolean) приезжает на клиент вместе с `auth.user` через
  `HandleInertiaRequests` — отдельного запроса не нужно.
- Страница комнаты (`RoomController::show`) отдаёт вычисленный проп `canEdit`.
- Маршруты `GET /rooms/{slug}/edit` и `PUT /rooms/{slug}` защищены проверкой
  `abort_unless($user->is_admin, 403)` и `MapUpdateRequest::authorize()`.

Убрать права — тем же способом, `['is_admin' => false]`.
