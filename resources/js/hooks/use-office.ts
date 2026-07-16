import { CHAT_RADIUS, isWalkable, SPAWN, tilesBetween, zoneAt } from '@/game/map';
import { OfficeScene } from '@/game/scene';
import type { ChatMessage, ChatPayload, Direction, MovePayload, PlayerState } from '@/game/types';
import { getEcho } from '@/lib/echo';
import { useCallback, useEffect, useRef, useState } from 'react';

const STEP_INTERVAL_MS = 150;
const MAX_MESSAGES = 50;

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
    const [zone, setZone] = useState<string | null>(null);
    const [connected, setConnected] = useState(false);

    const sceneRef = useRef<OfficeScene | null>(null);
    // Позиции всех игроков (включая себя) — вне React-состояния,
    // чтобы каждый шаг не вызывал перерендер страницы.
    const playersRef = useRef<Map<number, PlayerState>>(new Map());
    const pressedRef = useRef<Direction[]>([]);
    const lastStepRef = useRef(0);
    const userRef = useRef(user);
    userRef.current = user;

    const upsert = useCallback((state: PlayerState) => {
        playersRef.current.set(state.id, state);
        sceneRef.current?.upsertPlayer(state, state.id === userRef.current.id);
        sceneRef.current?.movePlayer(state.id, state.x, state.y, state.dir);
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

        const self = (): PlayerState => playersRef.current.get(userRef.current.id) ?? { ...userRef.current, x: SPAWN.x, y: SPAWN.y, dir: 'down' };

        const announce = () => {
            const me = self();
            channel.whisper('pos', { id: me.id, x: me.x, y: me.y, dir: me.dir } satisfies MovePayload);
        };

        channel
            .here((members: PresenceMember[]) => {
                setConnected(true);
                setOnline(members);
                const me = self();
                upsert(me);
                setZone(zoneAt(me.x, me.y)?.name ?? null);
                for (const m of members) {
                    if (m.id !== me.id && !playersRef.current.has(m.id)) {
                        upsert({ ...m, x: SPAWN.x, y: SPAWN.y, dir: 'down' });
                    }
                }
                announce();
            })
            .joining((member: PresenceMember) => {
                setOnline((prev) => (prev.some((m) => m.id === member.id) ? prev : [...prev, member]));
                if (!playersRef.current.has(member.id)) {
                    upsert({ ...member, x: SPAWN.x, y: SPAWN.y, dir: 'down' });
                }
                // рассказываем новичку, где мы стоим
                announce();
            })
            .leaving((member: PresenceMember) => {
                setOnline((prev) => prev.filter((m) => m.id !== member.id));
                playersRef.current.delete(member.id);
                sceneRef.current?.removePlayer(member.id);
            })
            .listenForWhisper('pos', (p: MovePayload) => {
                const known = playersRef.current.get(p.id);
                if (known) {
                    known.x = p.x;
                    known.y = p.y;
                    known.dir = p.dir;
                    sceneRef.current?.movePlayer(p.id, p.x, p.y, p.dir);
                }
            })
            .listenForWhisper('move', (p: MovePayload) => {
                const known = playersRef.current.get(p.id);
                if (known) {
                    known.x = p.x;
                    known.y = p.y;
                    known.dir = p.dir;
                    sceneRef.current?.movePlayer(p.id, p.x, p.y, p.dir);
                }
            })
            .listenForWhisper('chat', (p: ChatPayload) => {
                const me = self();
                const sender = playersRef.current.get(p.id);
                const sx = sender?.x ?? p.x;
                const sy = sender?.y ?? p.y;
                if (tilesBetween(me.x, me.y, sx, sy) > CHAT_RADIUS) {
                    return; // слишком далеко — не слышим
                }
                sceneRef.current?.showBubble(p.id, p.text);
                setMessages((prev) =>
                    [...prev, { key: `${p.id}-${Date.now()}-${Math.random()}`, userId: p.id, name: p.name, text: p.text, at: Date.now() }].slice(
                        -MAX_MESSAGES,
                    ),
                );
            });

        // страховочный heartbeat: если чей-то whisper потерялся, раз в 5 секунд
        // все узнают актуальные позиции
        const heartbeat = setInterval(announce, 5000);

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
                setZone(zoneAt(nx, ny)?.name ?? null);
            }

            if (!changed) {
                return; // упёрлись в стену — не спамим сеть одинаковыми координатами
            }

            playersRef.current.set(me.id, me);
            sceneRef.current?.movePlayer(me.id, me.x, me.y, me.dir);
            channel.whisper('move', { id: me.id, x: me.x, y: me.y, dir: me.dir } satisfies MovePayload);
        };

        const onKeyDown = (e: KeyboardEvent) => {
            // code — физическая клавиша (WASD в любой раскладке), key — запасной вариант
            const dir = KEY_TO_DIR[e.code] ?? KEY_TO_DIR[e.key];
            if (!dir) {
                return;
            }
            const target = e.target as HTMLElement | null;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
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

    return { online, messages, zone, connected, sendMessage };
}
