import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useOffice } from '@/hooks/use-office';
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

export default function Office() {
    const { auth } = usePage<SharedData>().props;
    const canvasHost = useRef<HTMLDivElement | null>(null);
    const messagesEnd = useRef<HTMLDivElement | null>(null);
    const [draft, setDraft] = useState('');

    const { online, messages, zone, connected, sendMessage } = useOffice({ id: auth.user.id, name: auth.user.name }, canvasHost);

    useEffect(() => {
        messagesEnd.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        sendMessage(draft);
        setDraft('');
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Офис" />
            <div className="flex h-full flex-1 flex-col gap-4 p-4 lg:flex-row">
                <div className="flex min-w-0 flex-1 flex-col gap-3">
                    <div className="flex items-center gap-2">
                        <Badge variant={connected ? 'default' : 'secondary'}>{connected ? 'В сети' : 'Подключение…'}</Badge>
                        {zone && <Badge variant="outline">{zone}</Badge>}
                        <span className="text-muted-foreground ml-auto hidden text-xs sm:block">Ходить — стрелки или WASD</span>
                    </div>
                    <div ref={canvasHost} className="border-sidebar-border/70 dark:border-sidebar-border overflow-hidden rounded-xl border" />
                </div>

                <div className="flex w-full flex-col gap-4 lg:w-80">
                    <div className="border-sidebar-border/70 dark:border-sidebar-border rounded-xl border p-4">
                        <h2 className="mb-3 text-sm font-semibold">
                            Онлайн <span className="text-muted-foreground font-normal">({online.length})</span>
                        </h2>
                        <ul className="flex flex-col gap-2">
                            {online.map((member) => (
                                <li key={member.id} className="flex items-center gap-2 text-sm">
                                    <span className="size-2 rounded-full bg-green-500" />
                                    {member.name}
                                    {member.id === auth.user.id && <span className="text-muted-foreground text-xs">(вы)</span>}
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="border-sidebar-border/70 dark:border-sidebar-border flex min-h-64 flex-1 flex-col rounded-xl border">
                        <h2 className="border-sidebar-border/70 dark:border-sidebar-border border-b p-4 pb-3 text-sm font-semibold">
                            Чат поблизости
                        </h2>
                        <div className="flex-1 space-y-2 overflow-y-auto p-4 text-sm">
                            {messages.length === 0 && (
                                <p className="text-muted-foreground text-xs">
                                    Сообщения слышны только тем, кто рядом — подойдите к коллеге и напишите что-нибудь.
                                </p>
                            )}
                            {messages.map((m) => (
                                <div key={m.key}>
                                    <span className={m.userId === auth.user.id ? 'font-semibold' : 'text-primary font-semibold'}>{m.name}: </span>
                                    <span>{m.text}</span>
                                </div>
                            ))}
                            <div ref={messagesEnd} />
                        </div>
                        <form onSubmit={submit} className="border-sidebar-border/70 dark:border-sidebar-border flex gap-2 border-t p-3">
                            <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Сказать вслух…" maxLength={200} />
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
