import type { AvatarConfig } from '@/game/avatar';
import { makeMap, type MapData, type MapObjectData, type PortalData, type Zone } from '@/game/map';
import { findStep } from '@/game/path';
import { OfficeScene } from '@/game/scene';
import type {
    BuzzPayload,
    ChatMessage,
    ChatPayload,
    Direction,
    LookPayload,
    MovePayload,
    PlayerState,
    PlayerStatus,
    ReactPayload,
    RoomMessage,
    StatusPayload,
} from '@/game/types';
import { beacon, postJson } from '@/lib/api';
import { getEcho } from '@/lib/echo';
import { useCallback, useEffect, useRef, useState } from 'react';

const STEP_INTERVAL_MS = 150;
const MAX_MESSAGES = 50;
const MAX_ROOM_MESSAGES = 100;
const AWAY_AFTER_MS = 60_000;
const POSITION_SAVE_MS = 30_000;

export const REACTIONS = ['👋', '❤️', '😂', '🎉', '👍'];

export type ManualStatus = Exclude<PlayerStatus, 'away'>;

const MANUAL_STATUSES: ManualStatus[] = ['available', 'busy', 'dnd'];
const ALL_STATUSES: PlayerStatus[] = [...MANUAL_STATUSES, 'away'];

interface PresenceMember {
    id: number;
    name: string;
    avatar?: AvatarConfig | null;
}

const KEY_TO_DIR: Record<string, Direction> = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
    KeyW: 'up',
    KeyS: 'down',
    KeyA: 'left',
    KeyD: 'right',
};

const DIR_DELTA: Record<Direction, { dx: number; dy: number }> = {
    up: { dx: 0, dy: -1 },
    down: { dx: 0, dy: 1 },
    left: { dx: -1, dy: 0 },
    right: { dx: 1, dy: 0 },
};

export interface OfficeOptions {
    roomId: number;
    map: MapData;
    initialPosition: { x: number; y: number } | null;
    history: RoomMessage[];
    // вызывается, когда игрок наступает на портал
    onPortal: (portal: PortalData) => void;
}

export function useOffice(user: PresenceMember, canvasHost: React.RefObject<HTMLDivElement | null>, options: OfficeOptions) {
    const [online, setOnline] = useState<PresenceMember[]>([]);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [roomMessages, setRoomMessages] = useState<RoomMessage[]>(options.history);
    const [zone, setZone] = useState<Zone | null>(null);
    const [connected, setConnected] = useState(false);
    const [statuses, setStatuses] = useState<Record<number, PlayerStatus>>({});
    const [myStatus, setMyStatusState] = useState<ManualStatus>('available');
    const [nearbyObject, setNearbyObject] = useState<MapObjectData | null>(null);
    const [activeObject, setActiveObject] = useState<MapObjectData | null>(null);

    // компонент комнаты монтируется заново на каждую комнату (key={room.id}),
    // поэтому карта и id комнаты фиксируются на весь жизненный цикл хука
    const [map] = useState(() => makeMap(options.map));
    const roomId = options.roomId;

    const sceneRef = useRef<OfficeScene | null>(null);
    // Позиции всех игроков (включая себя) — вне React-состояния,
    // чтобы каждый шаг не вызывал перерендер страницы.
    const playersRef = useRef<Map<number, PlayerState>>(new Map());
    const pressedRef = useRef<Direction[]>([]);
    const lastStepRef = useRef(0);
    const userRef = useRef(user);
    userRef.current = user;
    const spawnRef = useRef(map.resolveSpawn(options.initialPosition));
    const lastSavedPosRef = useRef<string | null>(null);
    const nearbyObjectRef = useRef<MapObjectData | null>(null);
    const activeObjectRef = useRef<MapObjectData | null>(null);
    const portalTriggeredRef = useRef(false);
    const onPortalRef = useRef(options.onPortal);
    onPortalRef.current = options.onPortal;
    const followTargetRef = useRef<number | null>(null);
    const buzzRef = useRef<(id: number) => void>(() => {});

    // эффективный статус (учитывает авто-away) — для колбэков без замыканий
    const manualRef = useRef<ManualStatus>('available');
    const awayRef = useRef(false);
    const lastActivityRef = useRef(performance.now());
    const broadcastStatusRef = useRef<() => void>(() => {});
    const sendReactionRef = useRef<(emoji: string) => void>(() => {});

    const effectiveStatus = (): PlayerStatus => (awayRef.current ? 'away' : manualRef.current);

    const updateStatusState = useCallback((id: number, status: PlayerStatus) => {
        setStatuses((prev) => (prev[id] === status ? prev : { ...prev, [id]: status }));
        sceneRef.current?.setStatus(id, status);
    }, []);

    const appendRoomMessage = useCallback((message: RoomMessage) => {
        setRoomMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message].slice(-MAX_ROOM_MESSAGES)));
    }, []);

    const upsert = useCallback((state: PlayerState) => {
        playersRef.current.set(state.id, state);
        sceneRef.current?.upsertPlayer(state, state.id === userRef.current.id);
        sceneRef.current?.movePlayer(state.id, state.x, state.y, state.dir);
        setStatuses((prev) => (prev[state.id] === state.status ? prev : { ...prev, [state.id]: state.status }));
    }, []);

    const updateNearbyObject = useCallback(
        (x: number, y: number) => {
            const obj = map.nearestObject(x, y);
            if (obj?.id !== nearbyObjectRef.current?.id) {
                nearbyObjectRef.current = obj;
                setNearbyObject(obj);
                sceneRef.current?.setObjectHighlight(obj?.id ?? null);
            }
        },
        [map],
    );

    useEffect(() => {
        const scene = new OfficeScene(map);
        sceneRef.current = scene;
        let cancelled = false;

        if (canvasHost.current) {
            scene.init(canvasHost.current).then(() => {
                if (cancelled) {
                    return;
                }
                // отрисовываем всех, кто успел появиться до готовности сцены
                for (const p of playersRef.current.values()) {
                    scene.upsertPlayer(p, p.id === userRef.current.id);
                }
            });
        }

        const echo = getEcho();
        const channelName = `room.${roomId}`;
        const channel = echo.join(channelName);

        if (import.meta.env.DEV) {
            // отладка из консоли: window.__voffice.players
            (window as unknown as Record<string, unknown>).__voffice = { players: playersRef.current };
        }

        const self = (): PlayerState =>
            playersRef.current.get(userRef.current.id) ?? {
                id: userRef.current.id,
                name: userRef.current.name,
                avatar: userRef.current.avatar,
                x: spawnRef.current.x,
                y: spawnRef.current.y,
                dir: 'down',
                status: effectiveStatus(),
            };

        buzzRef.current = (id: number) => {
            const me = self();
            channel.whisper('buzz', { from: me.id, name: me.name, to: id } satisfies BuzzPayload);
            // разрешение спрашиваем в жесте пользователя — пригодится, когда
            // buzz прилетит нам самим
            if ('Notification' in window && Notification.permission === 'default') {
                void Notification.requestPermission();
            }
        };

        const announce = () => {
            const me = self();
            channel.whisper('pos', { id: me.id, x: me.x, y: me.y, dir: me.dir, st: effectiveStatus() } satisfies MovePayload);
        };

        const broadcastStatus = () => {
            const me = self();
            const status = effectiveStatus();
            me.status = status;
            playersRef.current.set(me.id, me);
            updateStatusState(me.id, status);
            channel.whisper('status', { id: me.id, status } satisfies StatusPayload);
        };
        broadcastStatusRef.current = broadcastStatus;

        sendReactionRef.current = (emoji: string) => {
            if (!REACTIONS.includes(emoji)) {
                return;
            }
            const me = self();
            sceneRef.current?.showReaction(me.id, emoji);
            channel.whisper('react', { id: me.id, emoji } satisfies ReactPayload);
        };

        // Whisper'ы приходят и от других вкладок этого же пользователя —
        // их heartbeat со старой позицией не должен телепортировать нашего
        // персонажа назад, поэтому свои id игнорируем.
        const applyRemoteMove = (p: MovePayload) => {
            if (p.id === userRef.current.id) {
                return;
            }
            const known = playersRef.current.get(p.id);
            if (known) {
                known.x = p.x;
                known.y = p.y;
                known.dir = p.dir;
                sceneRef.current?.movePlayer(p.id, p.x, p.y, p.dir);
                if (p.st && ALL_STATUSES.includes(p.st)) {
                    known.status = p.st;
                    updateStatusState(p.id, p.st);
                }
            }
        };

        channel
            .here((members: PresenceMember[]) => {
                setConnected(true);
                setOnline(members);
                const me = self();
                upsert(me);
                setZone(map.zoneAt(me.x, me.y));
                updateNearbyObject(me.x, me.y);
                for (const m of members) {
                    if (m.id !== me.id && !playersRef.current.has(m.id)) {
                        upsert({ ...m, x: map.spawn.x, y: map.spawn.y, dir: 'down', status: 'available' });
                    }
                }
                announce();
            })
            .joining((member: PresenceMember) => {
                setOnline((prev) => (prev.some((m) => m.id === member.id) ? prev : [...prev, member]));
                if (!playersRef.current.has(member.id)) {
                    upsert({ ...member, x: map.spawn.x, y: map.spawn.y, dir: 'down', status: 'available' });
                }
                // рассказываем новичку, где мы стоим
                announce();
            })
            .leaving((member: PresenceMember) => {
                setOnline((prev) => prev.filter((m) => m.id !== member.id));
                playersRef.current.delete(member.id);
                sceneRef.current?.removePlayer(member.id);
                setStatuses((prev) => {
                    const next = { ...prev };
                    delete next[member.id];
                    return next;
                });
            })
            .listenForWhisper('pos', (p: MovePayload) => {
                applyRemoteMove(p);
            })
            .listenForWhisper('move', (p: MovePayload) => {
                applyRemoteMove(p);
            })
            .listenForWhisper('status', (p: StatusPayload) => {
                if (p.id === userRef.current.id || !ALL_STATUSES.includes(p.status)) {
                    return;
                }
                const known = playersRef.current.get(p.id);
                if (known) {
                    known.status = p.status;
                    updateStatusState(p.id, p.status);
                }
            })
            .listenForWhisper('react', (p: ReactPayload) => {
                if (p.id === userRef.current.id || !REACTIONS.includes(p.emoji)) {
                    return;
                }
                sceneRef.current?.showReaction(p.id, p.emoji);
            })
            .listenForWhisper('look', (p: LookPayload) => {
                if (p.id === userRef.current.id) {
                    return;
                }
                const known = playersRef.current.get(p.id);
                if (known) {
                    known.avatar = p.avatar;
                    sceneRef.current?.setLook(p.id, p.avatar);
                }
            })
            .listenForWhisper('buzz', (p: BuzzPayload) => {
                if (p.to !== userRef.current.id) {
                    return;
                }
                sceneRef.current?.shake();
                sceneRef.current?.showReaction(userRef.current.id, '🔔');
                if ('Notification' in window && Notification.permission === 'granted') {
                    new Notification(`${p.name} зовёт вас в офис!`, { body: 'Вас позвали в voffice' });
                }
            })
            .listenForWhisper('chat', (p: ChatPayload) => {
                const me = self();
                const sender = playersRef.current.get(p.id);
                const sx = sender?.x ?? p.x;
                const sy = sender?.y ?? p.y;
                if (!map.canHear(me.x, me.y, sx, sy)) {
                    return;
                }
                sceneRef.current?.showBubble(p.id, p.text);
                setMessages((prev) =>
                    [...prev, { key: `${p.id}-${Date.now()}-${Math.random()}`, userId: p.id, name: p.name, text: p.text, at: Date.now() }].slice(
                        -MAX_MESSAGES,
                    ),
                );
            })
            // серверное broadcast-событие чата комнаты (see MessageSent)
            .listen('.message.sent', (p: RoomMessage) => {
                appendRoomMessage(p);
            });

        // периодическое сохранение позиции (+ при закрытии страницы)
        const savePosition = (viaBeacon = false) => {
            const me = playersRef.current.get(userRef.current.id);
            if (!me) {
                return;
            }
            const key = `${me.x}:${me.y}`;
            if (key === lastSavedPosRef.current) {
                return;
            }
            lastSavedPosRef.current = key;
            if (viaBeacon) {
                beacon('/position', { x: me.x, y: me.y, room_id: roomId });
            } else {
                postJson('/position', { x: me.x, y: me.y, room_id: roomId }).catch(() => {
                    lastSavedPosRef.current = null; // не удалось — попробуем в следующий тик
                });
            }
        };
        const positionSaver = setInterval(() => savePosition(), POSITION_SAVE_MS);
        const onPageHide = () => savePosition(true);
        window.addEventListener('pagehide', onPageHide);

        // страховочный heartbeat + проверка авто-away: раз в 5 секунд
        const heartbeat = setInterval(() => {
            if (!awayRef.current && performance.now() - lastActivityRef.current > AWAY_AFTER_MS) {
                awayRef.current = true;
                broadcastStatus();
            }
            announce();
        }, 5000);

        const markActivity = () => {
            lastActivityRef.current = performance.now();
            if (awayRef.current) {
                awayRef.current = false;
                broadcastStatus();
            }
        };

        const tryStep = (dir: Direction) => {
            const now = performance.now();
            if (now - lastStepRef.current < STEP_INTERVAL_MS) {
                return;
            }
            lastStepRef.current = now;

            const me = self();
            const { dx, dy } = DIR_DELTA[dir];
            const nx = me.x + dx;
            const ny = me.y + dy;

            const changed = me.dir !== dir || map.isWalkable(nx, ny);
            me.dir = dir;
            if (map.isWalkable(nx, ny)) {
                me.x = nx;
                me.y = ny;
                setZone(map.zoneAt(nx, ny));
                updateNearbyObject(nx, ny);

                const portal = map.portalAt(nx, ny);
                if (portal && !portalTriggeredRef.current) {
                    portalTriggeredRef.current = true;
                    onPortalRef.current(portal);
                }
            }

            if (!changed) {
                return; // упёрлись в стену — не спамим сеть одинаковыми координатами
            }

            playersRef.current.set(me.id, me);
            sceneRef.current?.movePlayer(me.id, me.x, me.y, me.dir);
            channel.whisper('move', { id: me.id, x: me.x, y: me.y, dir: me.dir, st: effectiveStatus() } satisfies MovePayload);
        };

        const onKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
                return;
            }
            markActivity();

            // пока открыта модалка объекта, игровые клавиши не работают
            if (activeObjectRef.current) {
                return;
            }

            // X — взаимодействие с ближайшим объектом
            if (e.code === 'KeyX' && nearbyObjectRef.current) {
                e.preventDefault();
                activeObjectRef.current = nearbyObjectRef.current;
                setActiveObject(nearbyObjectRef.current);
                return;
            }

            // клавиши 1–5 — эмодзи-реакции
            if (/^Digit[1-5]$/.test(e.code)) {
                const emoji = REACTIONS[Number(e.code.slice(5)) - 1];
                if (emoji) {
                    e.preventDefault();
                    sendReactionRef.current(emoji);
                    return;
                }
            }

            // code — физическая клавиша (WASD в любой раскладке), key — запасной вариант
            const dir = KEY_TO_DIR[e.code] ?? KEY_TO_DIR[e.key];
            if (!dir) {
                return;
            }
            e.preventDefault();
            followTargetRef.current = null; // ручное движение отменяет «следовать»
            if (!pressedRef.current.includes(dir)) {
                pressedRef.current.push(dir);
            }
            // мгновенный шаг по нажатию, интервал ниже обрабатывает удержание
            tryStep(dir);
        };
        const onKeyUp = (e: KeyboardEvent) => {
            const dir = KEY_TO_DIR[e.code] ?? KEY_TO_DIR[e.key];
            if (dir) {
                pressedRef.current = pressedRef.current.filter((d) => d !== dir);
            }
        };
        const onBlur = () => {
            pressedRef.current = [];
        };

        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        window.addEventListener('blur', onBlur);
        window.addEventListener('pointerdown', markActivity);
        window.addEventListener('mousemove', markActivity);

        const moveLoop = setInterval(() => {
            const dir = pressedRef.current[pressedRef.current.length - 1];
            if (dir) {
                tryStep(dir);
                return;
            }
            // режим «следовать»: BFS-шаг к цели, пока не окажемся рядом
            const targetId = followTargetRef.current;
            if (targetId !== null) {
                const target = playersRef.current.get(targetId);
                if (!target) {
                    followTargetRef.current = null;
                    return;
                }
                const stepDir = findStep(map, self(), target);
                if (stepDir) {
                    tryStep(stepDir);
                }
            }
        }, 40);

        return () => {
            cancelled = true;
            clearInterval(heartbeat);
            clearInterval(moveLoop);
            clearInterval(positionSaver);
            window.removeEventListener('pagehide', onPageHide);
            savePosition(true);
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
            window.removeEventListener('blur', onBlur);
            window.removeEventListener('pointerdown', markActivity);
            window.removeEventListener('mousemove', markActivity);
            echo.leave(channelName);
            scene.destroy();
            sceneRef.current = null;
            playersRef.current.clear();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const sendMessage = useCallback(
        (text: string) => {
            const trimmed = text.trim();
            if (!trimmed) {
                return;
            }
            const me = playersRef.current.get(userRef.current.id);
            if (!me) {
                return;
            }
            const echo = getEcho();
            const channel = echo.join(`room.${roomId}`);
            channel.whisper('chat', { id: me.id, name: me.name, text: trimmed, x: me.x, y: me.y } satisfies ChatPayload);
            sceneRef.current?.showBubble(me.id, trimmed);
            setMessages((prev) =>
                [...prev, { key: `${me.id}-${Date.now()}-self`, userId: me.id, name: me.name, text: trimmed, at: Date.now() }].slice(-MAX_MESSAGES),
            );
        },
        [roomId],
    );

    const sendReaction = useCallback((emoji: string) => {
        sendReactionRef.current(emoji);
    }, []);

    const sendRoomMessage = useCallback(
        async (text: string) => {
            const trimmed = text.trim();
            if (!trimmed) {
                return;
            }
            // X-Socket-ID исключает наш сокет из broadcast(...)->toOthers():
            // своё сообщение добавляем из ответа сервера, без дубля
            const socketId = getEcho().socketId();
            const message = await postJson<RoomMessage>('/messages', { body: trimmed, room_id: roomId }, socketId ? { 'X-Socket-ID': socketId } : {});
            appendRoomMessage(message);
        },
        [appendRoomMessage, roomId],
    );

    const setMyStatus = useCallback((status: ManualStatus) => {
        if (!MANUAL_STATUSES.includes(status)) {
            return;
        }
        manualRef.current = status;
        awayRef.current = false;
        lastActivityRef.current = performance.now();
        setMyStatusState(status);
        broadcastStatusRef.current();
    }, []);

    const closeObject = useCallback(() => {
        activeObjectRef.current = null;
        setActiveObject(null);
    }, []);

    const locatePlayer = useCallback((id: number) => {
        sceneRef.current?.pingPlayer(id);
    }, []);

    const followPlayer = useCallback((id: number) => {
        followTargetRef.current = id;
    }, []);

    const buzzPlayer = useCallback((id: number) => {
        buzzRef.current(id);
    }, []);

    const saveAvatar = useCallback(
        async (cfg: AvatarConfig) => {
            const saved = await postJson<AvatarConfig>('/avatar', { ...cfg });
            const me = playersRef.current.get(userRef.current.id);
            if (me) {
                me.avatar = saved;
            }
            sceneRef.current?.setLook(userRef.current.id, saved);
            getEcho()
                .join(`room.${roomId}`)
                .whisper('look', { id: userRef.current.id, avatar: saved } satisfies LookPayload);
            return saved;
        },
        [roomId],
    );

    return {
        online,
        messages,
        roomMessages,
        zone,
        connected,
        statuses,
        myStatus,
        nearbyObject,
        activeObject,
        closeObject,
        sendMessage,
        sendRoomMessage,
        sendReaction,
        setMyStatus,
        locatePlayer,
        followPlayer,
        buzzPlayer,
        saveAvatar,
    };
}
