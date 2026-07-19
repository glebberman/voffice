import { AvatarEditor } from '@/components/avatar-editor';
import { CallPanel } from '@/components/call-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { type AvatarConfig } from '@/game/avatar';
import { type DoorState, type MapData, type PortalData } from '@/game/map';
import { type PropCatalogue } from '@/game/props';
import { type PlayerStatus, type RoomMessage } from '@/game/types';
import { REACTIONS, useOffice, type ManualStatus } from '@/hooks/use-office';
import AppLayout from '@/layouts/app-layout';
import { type SharedData, type User } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import { BellRing, Footprints, MapPin, Pencil, SendHorizontal, Shirt } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const STATUS_DOT: Record<PlayerStatus, string> = {
    available: 'bg-green-500',
    busy: 'bg-amber-500',
    dnd: 'bg-red-500',
    away: 'bg-gray-400',
};

const STATUS_LABEL: Record<PlayerStatus, string> = {
    available: 'Доступен',
    busy: 'Занят',
    dnd: 'Не беспокоить',
    away: 'Отошёл',
};

interface RoomInfo {
    id: number;
    slug: string;
    name: string;
    map: MapData;
}

interface RoomShowProps extends SharedData {
    room: RoomInfo;
    history: RoomMessage[];
    lastPosition: { x: number; y: number } | null;
    canEdit: boolean;
    propTypes: PropCatalogue;
    doorStates: Record<string, DoorState>;
}

// координаты прибытия из портала (?x=..&y=..) важнее сохранённой позиции
function arrivalPosition(): { x: number; y: number } | null {
    const params = new URLSearchParams(window.location.search);
    const x = Number(params.get('x'));
    const y = Number(params.get('y'));
    return params.has('x') && Number.isInteger(x) && Number.isInteger(y) ? { x, y } : null;
}

export default function RoomShow() {
    const { auth, room } = usePage<RoomShowProps>().props;

    // Страница живёт за middleware auth, но общий тип этого не знает. Проверяем
    // здесь: внутри RoomView сразу вызываются хуки, а после раннего выхода их
    // вызывать нельзя.
    if (!auth.user) {
        return null;
    }

    // ремоунт на каждую комнату: хук фиксирует карту и канал при монтировании
    return <RoomView key={room.id} me={auth.user} />;
}

function RoomView({ me }: { me: User }) {
    const { room, history, lastPosition, canEdit, propTypes, doorStates } = usePage<RoomShowProps>().props;
    const canvasHost = useRef<HTMLDivElement | null>(null);
    const messagesEnd = useRef<HTMLDivElement | null>(null);
    const [draft, setDraft] = useState('');
    const [tab, setTab] = useState<'nearby' | 'room'>('nearby');
    const [editorOpen, setEditorOpen] = useState(false);
    // в этом проекте users.avatar — json-конфиг образа, а не URL картинки
    const [avatarCfg, setAvatarCfg] = useState<AvatarConfig | null>((me.avatar as unknown as AvatarConfig | null) ?? null);

    const {
        online,
        messages,
        roomMessages,
        zone,
        connected,
        statuses,
        myStatus,
        nearbyObject,
        doorHint,
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
        inCall,
        micOn,
        camOn,
        screenOn,
        selfSpeaking,
        callError,
        localStream,
        callPeers,
        joinCall,
        leaveCall,
        toggleMic,
        toggleCamera,
        toggleScreen,
    } = useOffice({ id: me.id, name: me.name, avatar: avatarCfg }, canvasHost, {
        roomId: room.id,
        roomSlug: room.slug,
        map: room.map,
        propTypes,
        doorStates,
        initialPosition: arrivalPosition() ?? lastPosition,
        history,
        onPortal: (portal: PortalData) => {
            router.visit(`/rooms/${portal.to}?x=${portal.tx}&y=${portal.ty}`, { preserveState: false });
        },
    });

    useEffect(() => {
        messagesEnd.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, roomMessages, tab]);

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (tab === 'nearby') {
            sendMessage(draft);
        } else {
            // сообщение уже в истории на сервере; ошибку сети покажет перезагрузка
            void sendRoomMessage(draft).catch(() => undefined);
        }
        setDraft('');
    };

    const selfStatus = statuses[me.id] ?? 'available';

    return (
        <AppLayout
            breadcrumbs={[
                { title: 'Комнаты', href: '/rooms' },
                { title: room.name, href: `/rooms/${room.slug}` },
            ]}
        >
            <Head title={room.name} />
            <div className="flex h-full flex-1 flex-col gap-4 p-4 lg:flex-row">
                <div className="flex min-w-0 flex-1 flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={connected ? 'default' : 'secondary'}>{connected ? 'В сети' : 'Подключение…'}</Badge>
                        {zone && (
                            <Badge variant="outline">
                                {zone.name}
                                {zone.isPrivate ? ' · приватная' : ''}
                            </Badge>
                        )}
                        {selfStatus === 'away' && <Badge variant="secondary">Отошёл</Badge>}
                        <div className="ml-auto flex items-center gap-2">
                            <span className="text-muted-foreground hidden text-xs xl:block">
                                Стрелки/WASD · реакции 1–5 · X — объект и дверь · Shift+X — замок
                            </span>
                            {doorHint && <span className="text-xs font-medium text-amber-600 dark:text-amber-400">{doorHint}</span>}
                            {canEdit && (
                                <Button variant="outline" size="sm" className="h-8" onClick={() => router.visit(`/rooms/${room.slug}/edit`)}>
                                    <Pencil className="size-4" />
                                    Редактор
                                </Button>
                            )}
                            <Button variant="outline" size="sm" className="h-8" onClick={() => setEditorOpen(true)}>
                                <Shirt className="size-4" />
                                Персонаж
                            </Button>
                            <Select value={myStatus} onValueChange={(v) => setMyStatus(v as ManualStatus)}>
                                <SelectTrigger className="h-8 w-44">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {(['available', 'busy', 'dnd'] as ManualStatus[]).map((s) => (
                                        <SelectItem key={s} value={s}>
                                            <span className="flex items-center gap-2">
                                                <span className={`size-2 rounded-full ${STATUS_DOT[s]}`} />
                                                {STATUS_LABEL[s]}
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    {/* размер задаёт контейнер, канвас-вьюпорт подстраивается под него
                        (раньше было наоборот: канвас был размером с карту) */}
                    <div className="relative min-h-[420px] w-full flex-1">
                        <div
                            ref={canvasHost}
                            className="border-sidebar-border/70 dark:border-sidebar-border absolute inset-0 overflow-hidden rounded-xl border"
                        />
                        {nearbyObject && (
                            <div className="bg-background/90 absolute top-3 left-1/2 -translate-x-1/2 rounded-full border px-3 py-1 text-sm shadow-sm backdrop-blur">
                                <span className="font-semibold">{nearbyObject.label}</span>
                                <span className="text-muted-foreground"> — нажмите X</span>
                            </div>
                        )}
                        <div className="bg-background/80 absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border px-2 py-1 shadow-sm backdrop-blur">
                            {REACTIONS.map((emoji, i) => (
                                <button
                                    key={emoji}
                                    type="button"
                                    title={`Реакция ${emoji} — клавиша ${i + 1}`}
                                    onClick={() => sendReaction(emoji)}
                                    className="rounded-full px-1.5 py-0.5 text-lg transition-transform hover:scale-125"
                                >
                                    {emoji}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="flex w-full flex-col gap-4 lg:w-80">
                    <div className="border-sidebar-border/70 dark:border-sidebar-border rounded-xl border p-4">
                        <h2 className="mb-3 text-sm font-semibold">
                            Онлайн <span className="text-muted-foreground font-normal">({online.length})</span>
                        </h2>
                        <ul className="flex flex-col gap-2">
                            {online.map((member) => {
                                const status = statuses[member.id] ?? 'available';
                                const isSelf = member.id === me.id;
                                return (
                                    <li key={member.id} className="group flex items-center gap-2 text-sm">
                                        <span title={STATUS_LABEL[status]} className={`size-2 rounded-full ${STATUS_DOT[status]}`} />
                                        {member.name}
                                        {isSelf && <span className="text-muted-foreground text-xs">(вы)</span>}
                                        {!isSelf && (
                                            <span className="ml-auto flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                                <button
                                                    type="button"
                                                    title="Где это?"
                                                    onClick={() => locatePlayer(member.id)}
                                                    className="hover:bg-secondary rounded p-1"
                                                >
                                                    <MapPin className="size-3.5" />
                                                </button>
                                                <button
                                                    type="button"
                                                    title="Следовать"
                                                    onClick={() => followPlayer(member.id)}
                                                    className="hover:bg-secondary rounded p-1"
                                                >
                                                    <Footprints className="size-3.5" />
                                                </button>
                                                <button
                                                    type="button"
                                                    title="Позвать"
                                                    onClick={() => buzzPlayer(member.id)}
                                                    className="hover:bg-secondary rounded p-1"
                                                >
                                                    <BellRing className="size-3.5" />
                                                </button>
                                            </span>
                                        )}
                                        {isSelf && status !== 'available' && (
                                            <span className="text-muted-foreground ml-auto text-xs">{STATUS_LABEL[status]}</span>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </div>

                    <CallPanel
                        inCall={inCall}
                        micOn={micOn}
                        camOn={camOn}
                        screenOn={screenOn}
                        selfSpeaking={selfSpeaking}
                        callError={callError}
                        localStream={localStream}
                        peers={callPeers}
                        selfName={me.name}
                        onJoin={joinCall}
                        onLeave={leaveCall}
                        onToggleMic={toggleMic}
                        onToggleCamera={toggleCamera}
                        onToggleScreen={toggleScreen}
                    />

                    <div className="border-sidebar-border/70 dark:border-sidebar-border flex min-h-64 flex-1 flex-col rounded-xl border">
                        <div className="border-sidebar-border/70 dark:border-sidebar-border flex gap-1 border-b p-2">
                            {(
                                [
                                    ['nearby', 'Рядом'],
                                    ['room', 'Комната'],
                                ] as const
                            ).map(([key, label]) => (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => setTab(key)}
                                    className={`rounded-lg px-3 py-1 text-sm font-semibold transition-colors ${
                                        tab === key ? 'bg-secondary' : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        <div className="flex-1 space-y-2 overflow-y-auto p-4 text-sm">
                            {tab === 'nearby' && messages.length === 0 && (
                                <p className="text-muted-foreground text-xs">
                                    Сообщения слышны только тем, кто рядом — подойдите к коллеге и напишите что-нибудь. В приватных зонах
                                    (переговорка) разговор не выходит за стены.
                                </p>
                            )}
                            {tab === 'room' && roomMessages.length === 0 && (
                                <p className="text-muted-foreground text-xs">Чат всей комнаты — виден всем и сохраняется в истории.</p>
                            )}
                            {tab === 'nearby' &&
                                messages.map((m) => (
                                    <div key={m.key}>
                                        <span className={m.userId === me.id ? 'font-semibold' : 'text-primary font-semibold'}>{m.name}: </span>
                                        <span>{m.text}</span>
                                    </div>
                                ))}
                            {tab === 'room' &&
                                roomMessages.map((m) => (
                                    <div key={m.id}>
                                        <span className={m.userId === me.id ? 'font-semibold' : 'text-primary font-semibold'}>{m.name}: </span>
                                        <span>{m.body}</span>
                                    </div>
                                ))}
                            <div ref={messagesEnd} />
                        </div>
                        <form onSubmit={submit} className="border-sidebar-border/70 dark:border-sidebar-border flex gap-2 border-t p-3">
                            <Input
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                placeholder={tab === 'nearby' ? 'Сказать вслух…' : 'Написать всей комнате…'}
                                maxLength={tab === 'nearby' ? 200 : 500}
                            />
                            <Button type="submit" size="icon" disabled={!draft.trim()}>
                                <SendHorizontal className="size-4" />
                            </Button>
                        </form>
                    </div>
                </div>
            </div>

            {editorOpen && (
                <AvatarEditor
                    open={editorOpen}
                    onOpenChange={setEditorOpen}
                    initial={avatarCfg}
                    onSave={async (cfg) => {
                        await saveAvatar(cfg);
                        setAvatarCfg(cfg);
                    }}
                />
            )}

            <Dialog open={activeObject !== null} onOpenChange={(open) => !open && closeObject()}>
                <DialogContent className="flex h-[80vh] !max-w-4xl flex-col gap-0 p-0">
                    <DialogHeader className="px-4 py-3">
                        <DialogTitle>{activeObject?.label}</DialogTitle>
                    </DialogHeader>
                    {activeObject && (
                        <iframe
                            src={activeObject.url}
                            title={activeObject.label}
                            className="h-full w-full rounded-b-lg border-0"
                            allow="fullscreen"
                        />
                    )}
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
