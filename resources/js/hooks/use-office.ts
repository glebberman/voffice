import type { AvatarConfig } from '@/game/avatar';
import { parseEmbedSettings, type EmbedSettings } from '@/game/behaviors';
import {
    makeMap,
    tilesBetween,
    type DoorData,
    type DoorState,
    type InteractionTarget,
    type MapData,
    type MapObjectData,
    type PortalData,
    type Zone,
} from '@/game/map';
import { findStep } from '@/game/path';
import type { PropCatalogue } from '@/game/props';
import { OfficeScene } from '@/game/scene';
import { newTabId, shouldYieldTo, type TabHello } from '@/game/tabs';
import type {
    BuzzPayload,
    CallPayload,
    ChatMessage,
    ChatPayload,
    Direction,
    LookPayload,
    MovePayload,
    PlayerState,
    PlayerStatus,
    ReactPayload,
    RoomMessage,
    RtcSignalPayload,
    StatusPayload,
} from '@/game/types';
import { beacon, postJson } from '@/lib/api';
import { getEcho } from '@/lib/echo';
import { AudioMeter } from '@/webrtc/audio-meter';
import { Mesh } from '@/webrtc/mesh';
import { callPeers, volumeForDistance } from '@/webrtc/proximity';
import { useCallback, useEffect, useRef, useState } from 'react';

// одна видео-плитка звонка
export interface CallPeer {
    id: number;
    name: string;
    stream: MediaStream;
    speaking: boolean;
    volume: number;
}

const STEP_INTERVAL_MS = 150;
const MAX_MESSAGES = 50;
const MAX_ROOM_MESSAGES = 100;
const AWAY_AFTER_MS = 60_000;
const POSITION_SAVE_MS = 30_000;
// как часто максимум пересчитывать путь в режиме «следовать»
const FOLLOW_REPATH_MS = 300;

export const REACTIONS = ['👋', '❤️', '😂', '🎉', '👍'];

export type ManualStatus = Exclude<PlayerStatus, 'away'>;

const MANUAL_STATUSES: ManualStatus[] = ['available', 'busy', 'dnd'];
const ALL_STATUSES: PlayerStatus[] = [...MANUAL_STATUSES, 'away'];

interface PresenceMember {
    id: number;
    name: string;
    avatar?: AvatarConfig | null;
}

const KEY_TO_DIR: Partial<Record<string, Direction>> = {
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

/**
 * Подпись для подсказки/модалки интерактивного предмета — по поведению. null,
 * если предмету пока нечем ответить (embed без настроек): тогда ни подсказки,
 * ни подсветки, ни реакции на X. switchable подключится с VOF-31.
 */
function interactionLabel(target: InteractionTarget): string | null {
    if (target.spec.behavior === 'embed') {
        return parseEmbedSettings(target.prop.settings)?.label ?? null;
    }
    return null;
}

export interface OfficeOptions {
    roomId: number;
    map: MapData;
    // каталог предметов приходит с сервера вместе с картой
    propTypes: PropCatalogue;
    // открыта дверь или заперта — состояние игры, оно вне карты
    doorStates: Record<string, DoorState>;
    roomSlug: string;
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
    // подсказка «{label} — нажмите X»: ближайший объект или интерактивный предмет
    const [interactionHint, setInteractionHint] = useState<string | null>(null);
    // короткое «Заперто» под картой, когда дверь не поддалась
    const [doorHint, setDoorHint] = useState<string | null>(null);
    // офис открыт в другой вкладке: эта замолчала и ничего не отправляет
    const [yielded, setYielded] = useState(false);
    // открытая iframe-модалка: и старые map.objects, и embed-предметы дают {label, url}
    const [activeFrame, setActiveFrame] = useState<EmbedSettings | null>(null);

    // звонок по близости (WebRTC)
    const [inCall, setInCall] = useState(false);
    const [micOn, setMicOn] = useState(false);
    const [camOn, setCamOn] = useState(false);
    const [screenOn, setScreenOn] = useState(false);
    const [selfSpeaking, setSelfSpeaking] = useState(false);
    const [callError, setCallError] = useState<string | null>(null);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [callPeersState, setCallPeersState] = useState<Map<number, CallPeer>>(new Map());

    // компонент комнаты монтируется заново на каждую комнату (key={room.id}),
    // поэтому карта и id комнаты фиксируются на весь жизненный цикл хука
    const [map] = useState(() => {
        const built = makeMap(options.map, options.propTypes);
        for (const [id, state] of Object.entries(options.doorStates)) {
            built.setDoorState(id, state);
        }

        return built;
    });
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
    // Управление держит вкладка, открытая последней. Идентификатор живёт
    // столько же, сколько страница, и отличает нас от других своих вкладок.
    const tabIdRef = useRef(newTabId());
    const yieldedRef = useRef(false);
    const takeOverRef = useRef<() => void>(() => undefined);
    const nearbyObjectRef = useRef<MapObjectData | null>(null);
    // интерактивный предмет, в зоне которого стоим (для X)
    const nearbyInteractionRef = useRef<InteractionTarget | null>(null);
    // чья зона сейчас подсвечена — чтобы не перерисовывать её на каждом шаге
    const highlightedPropRef = useRef<string | null>(null);
    const activeFrameRef = useRef<EmbedSettings | null>(null);
    const portalTriggeredRef = useRef(false);
    const onPortalRef = useRef(options.onPortal);
    onPortalRef.current = options.onPortal;
    const followTargetRef = useRef<number | null>(null);
    const followPathRef = useRef<{ fromX: number; fromY: number; targetX: number; targetY: number; dir: Direction | null; at: number } | null>(null);
    const buzzRef = useRef<(id: number) => void>(() => undefined);

    // WebRTC-рефы: mesh, локальный поток, состав звонка, метры речи и
    // отдельные ссылки на треки камеры/экрана для screen sharing
    const meshRef = useRef<Mesh | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const screenStreamRef = useRef<MediaStream | null>(null);
    const inCallRef = useRef<Set<number>>(new Set());
    const metersRef = useRef<Map<number, AudioMeter>>(new Map());
    const callApiRef = useRef<{
        join: () => Promise<void>;
        leave: () => void;
        toggleMic: () => void;
        toggleCamera: () => void;
        toggleScreen: () => Promise<void>;
    } | null>(null);

    // эффективный статус (учитывает авто-away) — для колбэков без замыканий
    const manualRef = useRef<ManualStatus>('available');
    const awayRef = useRef(false);
    const lastActivityRef = useRef(performance.now());
    const broadcastStatusRef = useRef<() => void>(() => undefined);
    const sendReactionRef = useRef<(emoji: string) => void>(() => undefined);
    // обработчик клавиш вешается один раз, поэтому свежие функции — через рефы
    const toggleDoorRef = useRef<(withLock: boolean) => void>(() => undefined);
    const nearestDoorRef = useRef<(x: number, y: number) => DoorData | null>(() => null);

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

    /** Дверь, до которой можно дотянуться: строго соседняя клетка. */
    const nearestDoor = useCallback(
        (x: number, y: number): DoorData | null => map.doors.find((d) => Math.abs(d.x - x) + Math.abs(d.y - y) === 1) ?? null,
        [map],
    );

    // ближайшая интерактивная штука: объект (радиус 1.6) или предмет (клетка зоны)
    const updateNearby = useCallback(
        (x: number, y: number) => {
            const obj = map.nearestObject(x, y);
            if (obj?.id !== nearbyObjectRef.current?.id) {
                nearbyObjectRef.current = obj;
                sceneRef.current?.setObjectHighlight(obj?.id ?? null);
            }
            // предмет считаем интерактивным, только если поведению есть чем ответить
            const raw = map.interactableAt(x, y);
            const target = raw && interactionLabel(raw) !== null ? raw : null;
            if (target?.prop.id !== nearbyInteractionRef.current?.prop.id) {
                nearbyInteractionRef.current = target;
            }
            // подсвечиваем зону, только когда X сработает именно по предмету:
            // у объекта приоритет, иначе зелёная зона обманывала бы
            const lit = obj ? null : target;
            if ((lit?.prop.id ?? null) !== highlightedPropRef.current) {
                highlightedPropRef.current = lit?.prop.id ?? null;
                sceneRef.current?.setInteractionHighlight(lit?.cells ?? null);
            }
            // подсказка: объект приоритетнее (он «в радиусе»), иначе предмет
            const hint = obj?.label ?? (target ? interactionLabel(target) : null);
            setInteractionHint((prev) => (prev === hint ? prev : hint));
        },
        [map],
    );

    /**
     * Дёргает дверь: X открывает/закрывает, Shift+X запирает/отпирает.
     * Решение принимает сервер (он же знает про замок и сторону), клиент лишь
     * называет действие и говорит, откуда тянется.
     */
    const toggleDoor = useCallback(
        async (withLock: boolean) => {
            const me = playersRef.current.get(userRef.current.id);
            if (!me) {
                return;
            }
            const door = nearestDoor(me.x, me.y);
            if (!door) {
                return;
            }
            const state = map.doorState(door.id);
            const action = withLock ? (state.locked ? 'unlock' : 'lock') : state.closed ? 'open' : 'close';

            try {
                // своё состояние применяем сразу: эхо от Reverb придёт, но
                // ждать его незачем — дверь должна отзываться мгновенно
                const next = await postJson<DoorState & { id: string }>(`/rooms/${options.roomSlug}/doors`, {
                    id: door.id,
                    action,
                    x: me.x,
                    y: me.y,
                });
                sceneRef.current?.setDoorState(next.id, { closed: next.closed, locked: next.locked });
                setDoorHint(null);
            } catch {
                // сервер отказал: заперто, замок с другой стороны или не дотянуться
                setDoorHint(state.locked ? 'Заперто' : 'Не выходит');
                window.setTimeout(() => setDoorHint(null), 1600);
            }
        },
        [map, nearestDoor, options.roomSlug],
    );

    useEffect(() => {
        const scene = new OfficeScene(map);
        sceneRef.current = scene;
        let cancelled = false;

        // вьюпорт подстраивается под контейнер: камера показывает столько мира,
        // сколько влезает в доступную область страницы
        let resizeObserver: ResizeObserver | null = null;
        const host = canvasHost.current;

        if (host) {
            void scene.init(host).then(() => {
                if (cancelled) {
                    return;
                }
                // отрисовываем всех, кто успел появиться до готовности сцены
                for (const p of playersRef.current.values()) {
                    scene.upsertPlayer(p, p.id === userRef.current.id);
                }
                // на момент init хост мог быть ещё не измерен — берём фактический размер
                const rect = host.getBoundingClientRect();
                scene.resize(rect.width, rect.height);

                resizeObserver = new ResizeObserver((entries) => {
                    const box = entries.at(0)?.contentRect;
                    if (box) {
                        scene.resize(box.width, box.height);
                    }
                });
                resizeObserver.observe(host);
            });
        }

        const echo = getEcho();
        const channelName = `room.${roomId}`;
        const channel = echo.join(channelName);

        if (import.meta.env.DEV) {
            // отладка из консоли: window.__voffice.players / .scene; Mesh — для E2E webrtc
            (window as unknown as Record<string, unknown>).__voffice = { players: playersRef.current, Mesh, scene };
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
            say('buzz', { from: me.id, name: me.name, to: id } satisfies BuzzPayload);
            // разрешение спрашиваем в жесте пользователя — пригодится, когда
            // buzz прилетит нам самим
            if ('Notification' in window && Notification.permission === 'default') {
                void Notification.requestPermission();
            }
        };

        /**
         * Отправка в канал. Уступившая вкладка молчит: иначе остальные клиенты
         * получали бы два потока позиций от одного пользователя.
         */
        const say = (event: string, payload: object) => {
            if (yieldedRef.current) {
                return;
            }
            channel.whisper(event, payload);
        };

        /** Здоровается новая вкладка — остальные вкладки этого юзера замолкают. */
        const helloFromThisTab = () => {
            channel.whisper('hello', { id: userRef.current.id, tab: tabIdRef.current } satisfies TabHello);
        };

        const yieldControl = () => {
            if (yieldedRef.current) {
                return;
            }
            yieldedRef.current = true;
            setYielded(true);
            pressedRef.current = [];
            followTargetRef.current = null;
            if (inCallRef.current.has(userRef.current.id)) {
                callApiRef.current?.leave(); // из молчащей вкладки звонок вести нельзя
            }
        };

        takeOverRef.current = () => {
            yieldedRef.current = false;
            setYielded(false);
            helloFromThisTab(); // остальные вкладки уступят в ответ
            announce();
        };

        const announce = () => {
            const me = self();
            say('pos', {
                id: me.id,
                x: me.x,
                y: me.y,
                dir: me.dir,
                st: effectiveStatus(),
                call: inCallRef.current.has(me.id),
            } satisfies MovePayload);
        };

        const broadcastStatus = () => {
            const me = self();
            const status = effectiveStatus();
            me.status = status;
            playersRef.current.set(me.id, me);
            updateStatusState(me.id, status);
            say('status', { id: me.id, status } satisfies StatusPayload);
        };
        broadcastStatusRef.current = broadcastStatus;

        // ref обещает void, а useDoor асинхронный — ошибку он обрабатывает сам
        toggleDoorRef.current = (withLock: boolean) => void toggleDoor(withLock);
        nearestDoorRef.current = nearestDoor;

        sendReactionRef.current = (emoji: string) => {
            if (!REACTIONS.includes(emoji)) {
                return;
            }
            const me = self();
            sceneRef.current?.showReaction(me.id, emoji);
            say('react', { id: me.id, emoji } satisfies ReactPayload);
        };

        // --- WebRTC mesh ---
        const mesh = new Mesh(userRef.current.id, {
            sendSignal: (to, signal) => {
                say('rtc', { from: userRef.current.id, to, signal } satisfies RtcSignalPayload);
            },
            onRemoteStream: (peerId, stream) => {
                const member = playersRef.current.get(peerId);
                setCallPeersState((prev) => {
                    const next = new Map(prev);
                    const meta = next.get(peerId);
                    next.set(peerId, {
                        id: peerId,
                        name: member?.name ?? meta?.name ?? '—',
                        stream,
                        speaking: meta?.speaking ?? false,
                        volume: meta?.volume ?? 1,
                    });
                    return next;
                });
                if (stream.getAudioTracks().length > 0 && !metersRef.current.has(peerId)) {
                    metersRef.current.set(
                        peerId,
                        new AudioMeter(stream, (speaking) =>
                            setCallPeersState((prev) => {
                                const meta = prev.get(peerId);
                                if (!meta) {
                                    return prev;
                                }
                                const next = new Map(prev);
                                next.set(peerId, { ...meta, speaking });
                                return next;
                            }),
                        ),
                    );
                }
            },
            onPeerClosed: (peerId) => {
                metersRef.current.get(peerId)?.destroy();
                metersRef.current.delete(peerId);
                setCallPeersState((prev) => {
                    if (!prev.has(peerId)) {
                        return prev;
                    }
                    const next = new Map(prev);
                    next.delete(peerId);
                    return next;
                });
            },
        });
        meshRef.current = mesh;

        // громкость удалённых собеседников по дистанции в тайлах
        const updateVolumes = (me: PlayerState, ids: number[]) => {
            setCallPeersState((prev) => {
                let changed = false;
                const next = new Map(prev);
                for (const id of ids) {
                    const p = playersRef.current.get(id);
                    const meta = next.get(id);
                    if (p && meta) {
                        const vol = volumeForDistance(tilesBetween(me.x, me.y, p.x, p.y));
                        if (Math.abs(meta.volume - vol) > 0.01) {
                            next.set(id, { ...meta, volume: vol });
                            changed = true;
                        }
                    }
                }
                return changed ? next : prev;
            });
        };

        // пересчёт состава звонка по близости + громкостей
        const recomputeCall = () => {
            const me = self();
            const others = [...playersRef.current.values()].filter((p) => p.id !== me.id);
            const desired = callPeers(map, me, others, inCallRef.current);
            mesh.updatePeers(desired);
            updateVolumes(me, desired);
        };

        const isInCall = () => inCallRef.current.has(userRef.current.id);

        const announceCall = () => {
            say('call', { id: userRef.current.id, inCall: isInCall() } satisfies CallPayload);
        };

        // реконсиляция состава звонка по флагу из heartbeat / call-события
        const setPeerInCall = (id: number, active: boolean) => {
            const had = inCallRef.current.has(id);
            if (active) {
                inCallRef.current.add(id);
            } else {
                inCallRef.current.delete(id);
            }
            if (had !== active) {
                recomputeCall();
            }
        };

        const localMeter = (stream: MediaStream) => {
            metersRef.current.get(userRef.current.id)?.destroy();
            metersRef.current.set(userRef.current.id, new AudioMeter(stream, setSelfSpeaking));
        };

        callApiRef.current = {
            join: async () => {
                if (isInCall()) {
                    return;
                }
                setCallError(null);
                let stream: MediaStream;
                try {
                    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
                } catch {
                    try {
                        // нет камеры — пробуем только микрофон
                        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    } catch {
                        setCallError('Нет доступа к камере и микрофону');
                        return;
                    }
                }
                localStreamRef.current = stream;
                setLocalStream(stream);
                mesh.setLocalStream(stream);
                localMeter(stream);
                inCallRef.current.add(userRef.current.id);
                setInCall(true);
                setMicOn(stream.getAudioTracks().some((t) => t.enabled));
                setCamOn(stream.getVideoTracks().some((t) => t.enabled));
                announceCall();
                recomputeCall();
            },
            leave: () => {
                inCallRef.current.delete(userRef.current.id);
                mesh.updatePeers([]);
                metersRef.current.get(userRef.current.id)?.destroy();
                metersRef.current.delete(userRef.current.id);
                localStreamRef.current?.getTracks().forEach((t) => t.stop());
                screenStreamRef.current?.getTracks().forEach((t) => t.stop());
                localStreamRef.current = null;
                screenStreamRef.current = null;
                mesh.setLocalStream(null);
                setLocalStream(null);
                setInCall(false);
                setMicOn(false);
                setCamOn(false);
                setScreenOn(false);
                setSelfSpeaking(false);
                announceCall();
            },
            toggleMic: () => {
                const track = localStreamRef.current?.getAudioTracks()[0];
                if (track) {
                    track.enabled = !track.enabled;
                    setMicOn(track.enabled);
                }
            },
            toggleCamera: () => {
                const track = localStreamRef.current?.getVideoTracks()[0];
                if (track) {
                    track.enabled = !track.enabled;
                    setCamOn(track.enabled);
                }
            },
            toggleScreen: async () => {
                if (screenStreamRef.current) {
                    // вернуться к камере
                    screenStreamRef.current.getTracks().forEach((t) => t.stop());
                    screenStreamRef.current = null;
                    const cam = localStreamRef.current?.getVideoTracks()[0] ?? null;
                    mesh.replaceVideoTrack(cam);
                    setScreenOn(false);
                    return;
                }
                let display: MediaStream;
                try {
                    display = await navigator.mediaDevices.getDisplayMedia({ video: true });
                } catch {
                    return; // пользователь отменил выбор
                }
                screenStreamRef.current = display;
                const screenTrack = display.getVideoTracks()[0];
                mesh.replaceVideoTrack(screenTrack);
                setScreenOn(true);
                // системная кнопка «Остановить показ» тоже возвращает камеру
                screenTrack.addEventListener('ended', () => {
                    screenStreamRef.current = null;
                    mesh.replaceVideoTrack(localStreamRef.current?.getVideoTracks()[0] ?? null);
                    setScreenOn(false);
                });
            },
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
                if (p.call !== undefined) {
                    setPeerInCall(p.id, p.call);
                }
                recomputeCall(); // близость изменилась — пересчёт соединений и громкостей
            }
        };

        channel
            .here((members: PresenceMember[]) => {
                setConnected(true);
                setOnline(members);
                helloFromThisTab();
                const me = self();
                upsert(me);
                setZone(map.zoneAt(me.x, me.y));
                updateNearby(me.x, me.y);
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
                setStatuses((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => Number(id) !== member.id)));
                setPeerInCall(member.id, false); // рвём звонок с ушедшим
            })
            // другая вкладка этого же пользователя взяла управление
            .listenForWhisper('hello', (p: TabHello) => {
                if (shouldYieldTo(p, userRef.current.id, tabIdRef.current)) {
                    yieldControl();
                }
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
            .listenForWhisper('call', (p: CallPayload) => {
                if (p.id === userRef.current.id) {
                    return;
                }
                setPeerInCall(p.id, p.inCall);
                // новичку в звонке сообщаем, что мы тоже здесь (иначе он узнает
                // о нас только со следующего heartbeat)
                if (p.inCall && isInCall()) {
                    announceCall();
                }
            })
            .listenForWhisper('rtc', (p: RtcSignalPayload) => {
                if (p.to !== userRef.current.id) {
                    return;
                }
                void mesh.handleSignal(p.from, p.signal);
            })
            .listenForWhisper('chat', (p: ChatPayload) => {
                const me = self();
                const sender = playersRef.current.get(p.id);
                const sx = sender?.x ?? p.x;
                const sy = sender?.y ?? p.y;
                // со spotlight-плитки говорящего слышит вся комната
                if (!map.isSpotlight(sx, sy) && !map.canHear(me.x, me.y, sx, sy)) {
                    return;
                }
                // ...но не сквозь закрытую дверь, даже если он в двух тайлах
                if (!sceneRef.current?.isVisible(sx, sy)) {
                    return;
                }
                sceneRef.current.showBubble(p.id, p.text);
                setMessages((prev) =>
                    [...prev, { key: `${p.id}-${Date.now()}-${Math.random()}`, userId: p.id, name: p.name, text: p.text, at: Date.now() }].slice(
                        -MAX_MESSAGES,
                    ),
                );
            })
            // серверное broadcast-событие чата комнаты (see MessageSent)
            .listen('.message.sent', (p: RoomMessage) => {
                appendRoomMessage(p);
            })
            // дверь дёрнул кто-то из комнаты (see DoorChanged)
            .listen('.door.changed', (p: { id: string; closed: boolean; locked: boolean }) => {
                sceneRef.current?.setDoorState(p.id, { closed: p.closed, locked: p.locked });
            });

        // периодическое сохранение позиции (+ при закрытии страницы)
        const savePosition = (viaBeacon = false) => {
            const me = playersRef.current.get(userRef.current.id);
            if (!me || yieldedRef.current) {
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
            if (yieldedRef.current) {
                return;
            }
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
                updateNearby(nx, ny);

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
            say('move', {
                id: me.id,
                x: me.x,
                y: me.y,
                dir: me.dir,
                st: effectiveStatus(),
                call: inCallRef.current.has(me.id),
            } satisfies MovePayload);
            recomputeCall(); // мой сдвиг мог изменить состав звонка
        };

        // открыть iframe-модалку (объект или embed-предмет дают {label, url})
        const openFrame = (frame: EmbedSettings) => {
            activeFrameRef.current = frame;
            setActiveFrame(frame);
        };

        const onKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
                return;
            }
            markActivity();

            // пока открыта iframe-модалка, игровые клавиши не работают
            if (activeFrameRef.current) {
                return;
            }

            // X — взаимодействие: ближайший объект → интерактивный предмет →
            // дверь рядом. Shift+X — замок двери.
            if (e.code === 'KeyX' && !e.shiftKey) {
                const obj = nearbyObjectRef.current;
                if (obj) {
                    e.preventDefault();
                    openFrame({ label: obj.label, url: obj.url });
                    return;
                }
                const target = nearbyInteractionRef.current;
                const embed = target ? parseEmbedSettings(target.prop.settings) : null;
                if (embed) {
                    e.preventDefault();
                    openFrame(embed);
                    return;
                }
            }
            if (e.code === 'KeyX') {
                const me = playersRef.current.get(userRef.current.id);
                if (me && nearestDoorRef.current(me.x, me.y)) {
                    e.preventDefault();
                    toggleDoorRef.current(e.shiftKey);
                    return;
                }
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
            followPathRef.current = null;
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

        // BFS дорог на большой карте, поэтому направление кешируется и
        // пересчитывается только когда мы сами сдвинулись, цель сменила клетку
        // или прошло достаточно времени.
        const followStep = (target: PlayerState): Direction | null => {
            const me = self();
            const cache = followPathRef.current;
            const now = performance.now();
            const fresh =
                cache &&
                cache.fromX === me.x &&
                cache.fromY === me.y &&
                cache.targetX === target.x &&
                cache.targetY === target.y &&
                now - cache.at < FOLLOW_REPATH_MS;

            if (fresh) {
                return cache.dir;
            }

            const dir = findStep(map, me, target);
            followPathRef.current = { fromX: me.x, fromY: me.y, targetX: target.x, targetY: target.y, dir, at: now };
            return dir;
        };

        const moveLoop = setInterval(() => {
            // модалка открыта: не двигаемся ни зажатой клавишей, ни «следованием»
            // (onKeyDown гасит только новое нажатие, а клавишу могли зажать до X)
            if (activeFrameRef.current) {
                return;
            }
            const dir = pressedRef.current.at(-1);
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
                    followPathRef.current = null;
                    return;
                }
                const stepDir = followStep(target);
                if (stepDir) {
                    tryStep(stepDir);
                }
            }
        }, 40);

        // Контейнеры создаются один раз и не переприсваиваются, поэтому взять
        // их здесь — то же самое, что читать .current в уборке, но правило
        // видит стабильную переменную, а не поле рефа.
        const meters = metersRef.current;
        const inCall = inCallRef.current;
        const players = playersRef.current;

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
            // сворачиваем звонок: закрываем соединения, глушим метры и потоки
            mesh.destroy();
            for (const meter of meters.values()) {
                meter.destroy();
            }
            meters.clear();
            localStreamRef.current?.getTracks().forEach((t) => t.stop());
            screenStreamRef.current?.getTracks().forEach((t) => t.stop());
            localStreamRef.current = null;
            screenStreamRef.current = null;
            inCall.clear();
            meshRef.current = null;
            callApiRef.current = null;
            resizeObserver?.disconnect();
            echo.leave(channelName);
            scene.destroy();
            sceneRef.current = null;
            players.clear();
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
            // из уступившей вкладки не говорим: её место в комнате занято другой
            if (!me || yieldedRef.current) {
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

    const closeFrame = useCallback(() => {
        activeFrameRef.current = null;
        setActiveFrame(null);
    }, []);

    const locatePlayer = useCallback((id: number) => {
        sceneRef.current?.pingPlayer(id);
    }, []);

    const followPlayer = useCallback((id: number) => {
        followTargetRef.current = id;
        followPathRef.current = null; // новая цель — кешированный путь неактуален
    }, []);

    const buzzPlayer = useCallback((id: number) => {
        buzzRef.current(id);
    }, []);

    const joinCall = useCallback(() => {
        void callApiRef.current?.join();
    }, []);
    const leaveCall = useCallback(() => {
        callApiRef.current?.leave();
    }, []);
    const toggleMic = useCallback(() => {
        callApiRef.current?.toggleMic();
    }, []);
    const toggleCamera = useCallback(() => {
        callApiRef.current?.toggleCamera();
    }, []);
    const toggleScreen = useCallback(() => {
        void callApiRef.current?.toggleScreen();
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
        interactionHint,
        doorHint,
        yielded,
        takeOver: () => takeOverRef.current(),
        activeFrame,
        closeFrame,
        sendMessage,
        sendRoomMessage,
        sendReaction,
        setMyStatus,
        locatePlayer,
        followPlayer,
        buzzPlayer,
        saveAvatar,
        // звонок
        inCall,
        micOn,
        camOn,
        screenOn,
        selfSpeaking,
        callError,
        localStream,
        callPeers: callPeersState,
        joinCall,
        leaveCall,
        toggleMic,
        toggleCamera,
        toggleScreen,
    };
}
