# Как включить видеосвязь вне localhost (TURN)

На `localhost` и в пределах одной локальной сети WebRTC-звонки работают без
дополнительной настройки: браузеры соединяются напрямую по host-кандидатам.
Как только участники оказываются за разными NAT (интернет), нужен STUN/TURN-сервер.
В проекте для этого предусмотрен `coturn`.

## 1. Поднять coturn

`coturn` описан в `compose.yaml` под профилем `webrtc`, поэтому обычный
`docker compose up` его не запускает. Запустите явно:

```bash
docker compose --profile webrtc up -d
```

Учётные данные берутся из `.env`:

```dotenv
TURN_USERNAME=voffice
TURN_CREDENTIAL=voffice-secret
```

## 2. Сообщить клиенту адреса ICE-серверов

Фронтенд читает ICE-конфигурацию из переменных `VITE_*`. Пропишите в `.env`
(замените хост на адрес вашего сервера):

```dotenv
VITE_STUN_URL=stun:your-host:3478
VITE_TURN_URL=turn:your-host:3478
VITE_TURN_USERNAME=voffice
VITE_TURN_CREDENTIAL=voffice-secret
```

Пустые значения (по умолчанию) означают «только host-кандидаты» — этого хватает
для localhost/LAN.

## 3. Пересобрать фронтенд

`VITE_*` переменные вшиваются в бандл на сборке, поэтому после изменения нужно
перезапустить Vite (dev) или пересобрать (prod):

```bash
docker compose restart vite       # dev
# или
npm run build                     # prod
```

## Проверка

Откройте звонок с двух устройств в разных сетях. Если соединение устанавливается
только при включённом TURN — значит, коворкинг работает как relay, и всё
настроено верно. Клиентская конфигурация ICE собирается в
[`resources/js/webrtc/config.ts`](../../resources/js/webrtc/config.ts).

## Почему это отдельный шаг

Медиапоток в voffice идёт напрямую между браузерами (mesh), сервер его не
касается — он только пересылает сигналинг через Reverb. TURN нужен ровно там,
где прямое соединение невозможно из-за NAT/файрвола. Подробнее — в
[Пояснении про звонки](../explanation/proximity-i-zvonki.md).
