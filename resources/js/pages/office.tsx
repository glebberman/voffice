import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { type PlayerStatus, type RoomMessage } from '@/game/types';
import { REACTIONS, useOffice, type ManualStatus } from '@/hooks/use-office';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, usePage } from '@inertiajs/react';
import { SendHorizontal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Офис',
        href: '/office',
    },
];

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

interface OfficeProps extends SharedData {
    history: RoomMessage[];
    lastPosition: { x: number; y: number } | null;
}

export default function Office() {
    const { auth, history, lastPosition } = usePage<OfficeProps>().props;
    const canvasHost = useRef<HTMLDivElement | null>(null);
    const messagesEnd = useRef<HTMLDivElement | null>(null);
    const [draft, setDraft] = useState('');
    const [tab, setTab] = useState<'nearby' | 'room'>('nearby');

    const { online, messages, roomMessages, zone, connected, statuses, myStatus, sendMessage, sendRoomMessage, sendReaction, setMyStatus } =
        useOffice({ id: auth.user.id, name: auth.user.name }, canvasHost, { initialPosition: lastPosition, history });

    useEffect(() => {
        messagesEnd.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, roomMessages, tab]);

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (tab === 'nearby') {
            sendMessage(draft);
        } else {
            void sendRoomMessage(draft).catch(() => {});
        }
        setDraft('');
    };

    const selfStatus = statuses[auth.user.id] ?? 'available';

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Офис" />
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
                            <span className="text-muted-foreground hidden text-xs xl:block">Ходить — стрелки/WASD, реакции — 1–5</span>
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
                    <div className="relative w-fit max-w-full">
                        <div ref={canvasHost} className="border-sidebar-border/70 dark:border-sidebar-border overflow-hidden rounded-xl border" />
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
                                return (
                                    <li key={member.id} className="flex items-center gap-2 text-sm">
                                        <span title={STATUS_LABEL[status]} className={`size-2 rounded-full ${STATUS_DOT[status]}`} />
                                        {member.name}
                                        {member.id === auth.user.id && <span className="text-muted-foreground text-xs">(вы)</span>}
                                        {status !== 'available' && (
                                            <span className="text-muted-foreground ml-auto text-xs">{STATUS_LABEL[status]}</span>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </div>

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
                                        <span className={m.userId === auth.user.id ? 'font-semibold' : 'text-primary font-semibold'}>{m.name}: </span>
                                        <span>{m.text}</span>
                                    </div>
                                ))}
                            {tab === 'room' &&
                                roomMessages.map((m) => (
                                    <div key={m.id}>
                                        <span className={m.userId === auth.user.id ? 'font-semibold' : 'text-primary font-semibold'}>{m.name}: </span>
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
        </AppLayout>
    );
}
