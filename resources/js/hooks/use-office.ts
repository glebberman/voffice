import { CHAT_RADIUS, isWalkable, SPAWN, tilesBetween, zoneAt, type Zone } from '@/game/map';
import { OfficeScene } from '@/game/scene';
import type { ChatMessage, ChatPayload, Direction, MovePayload, PlayerState, PlayerStatus, ReactPayload, StatusPayload } from '@/game/types';
import { getEcho } from '@/lib/echo';
import { useCallback, useEffect, useRef, useState } from 'react';

const STEP_INTERVAL_MS = 150;
const MAX_MESSAGES = 50;
const AWAY_AFTER_MS = 60_000;

export const REACTIONS = ['👋', '❤️', '😂', '🎉', '👍'];

export type ManualStatus = Exclude<PlayerStatus, 'away'>;

const MANUAL_STATUSES: ManualStatus[] = ['available', 'busy', 'dnd'];
const ALL_STATUSES: PlayerStatus[] = [...MANUAL_STATUSES, 'away'];

interface PresenceMember {
    id: number;
    name: string;
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

export function useOffice(user: PresenceMember, canvasHost: React.RefObject<HTMLDivElement | null>) {
    const [online, setOnline] = useState<PresenceMember[]>([]);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [zone, setZone] = useState<Zone | null>(null);
    const [connected, setConnected] = useState(false);
    const [statuses, setStatuses] = useState<Record<number, PlayerStatus>>({});
    const [myStatus, setMyStatusState] = useState<ManualStatus>('available');

    const sceneRef = useRef<OfficeScene | null>(null);
    // Позиции всех игроков (включая себя) — вне React-состояния,
    // чтобы каждый шаг не вызывал перерендер страницы.
    const playersRef = useRef<Map<number, PlayerState>>(new Map());
    const pressedRef = useRef<Direction[]>([]);
    const lastStepRef = useRef(0);
    const userRef = useRef(user);
    userRef.current = user;

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

    const upsert = useCallback((state: PlayerState) => {
        playersRef.current.set(state.id, state);
        sceneRef.current?.upsertPlayer(state, state.id === userRef.current.id);
        sceneRef.current?.movePlayer(state.id, state.x, state.y, state.dir);
        setStatuses((prev) => (prev[state.id] === state.status ? prev : { ...prev, [state.id]: state.status }));
    }, []);

    useEffect(() => {
        const scene = new OfficeScene();
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
        const channel = echo.join('office');

        if (import.meta.env.DEV) {
            // отладка из консоли: window.__voffice.players
            (window as unknown as Record<string, unknown>).__voffice = { players: playersRef.current };
        }

        const self = (): PlayerState =>
            playersRef.current.get(userRef.current.id) ?? { ...userRef.current, x: SPAWN.x, y: SPAWN.y, dir: 'down', status: effectiveStatus() };

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

        // Слышим ли мы игрока в точке (x, y): приватная зона отсекает
        // всех снаружи (и мы не слышим внутрь), иначе — радиус.
        const canHear = (me: PlayerState, sx: number, sy: number): boolean => {
            const myZone = zoneAt(me.x, me.y);
            const senderZone = zoneAt(sx, sy);
            if (myZone?.isPrivate || senderZone?.isPrivate) {
                return myZone === senderZone;
            }
            return tilesBetween(me.x, me.y, sx, sy) <= CHAT_RADIUS;
        };

        channel
            .here((members: PresenceMember[]) => {
                setConnected(true);
                setOnline(members);
                const me = self();
                upsert(me);
                setZone(zoneAt(me.x, me.y));
                for (const m of members) {
                    if (m.id !== me.id && !playersRef.current.has(m.id)) {
                        upsert({ ...m, x: SPAWN.x, y: SPAWN.y, dir: 'down', status: 'available' });
                    }
                }
                announce();
            })
            .joining((member: PresenceMember) => {
                setOnline((prev) => (prev.some((m) => m.id === member.id) ? prev : [...prev, member]));
                if (!playersRef.current.has(member.id)) {
                    upsert({ ...member, x: SPAWN.x, y: SPAWN.y, dir: 'down', status: 'available' });
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
            .listenForWhisper('chat', (p: ChatPayload) => {
                const me = self();
                const sender = playersRef.current.get(p.id);
                const sx = sender?.x ?? p.x;
                const sy = sender?.y ?? p.y;
                if (!canHear(me, sx, sy)) {
                    return;
                }
                sceneRef.current?.showBubble(p.id, p.text);
                setMessages((prev) =>
                    [...prev, { key: `${p.id}-${Date.now()}-${Math.random()}`, userId: p.id, name: p.name, text: p.text, at: Date.now() }].slice(
                        -MAX_MESSAGES,
                    ),
                );
            });

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

            const changed = me.dir !== dir || isWalkable(nx, ny);
            me.dir = dir;
            if (isWalkable(nx, ny)) {
                me.x = nx;
                me.y = ny;
                setZone(zoneAt(nx, ny));
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
            }
        }, 40);

        return () => {
            cancelled = true;
            clearInterval(heartbeat);
            clearInterval(moveLoop);
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
            window.removeEventListener('blur', onBlur);
            window.removeEventListener('pointerdown', markActivity);
            window.removeEventListener('mousemove', markActivity);
            echo.leave('office');
            scene.destroy();
            sceneRef.current = null;
            playersRef.current.clear();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const sendMessage = useCallback((text: string) => {
        const trimmed = text.trim();
        if (!trimmed) {
            return;
        }
        const me = playersRef.current.get(userRef.current.id);
        if (!me) {
            return;
        }
        const echo = getEcho();
        const channel = echo.join('office');
        channel.whisper('chat', { id: me.id, name: me.name, text: trimmed, x: me.x, y: me.y } satisfies ChatPayload);
        sceneRef.current?.showBubble(me.id, trimmed);
        setMessages((prev) =>
            [...prev, { key: `${me.id}-${Date.now()}-self`, userId: me.id, name: me.name, text: trimmed, at: Date.now() }].slice(-MAX_MESSAGES),
        );
    }, []);

    const sendReaction = useCallback((emoji: string) => {
        sendReactionRef.current(emoji);
    }, []);

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

    return { online, messages, zone, connected, statuses, myStatus, sendMessage, sendReaction, setMyStatus };
}
