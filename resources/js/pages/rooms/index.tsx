import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, Link, usePage } from '@inertiajs/react';
import { DoorOpen } from 'lucide-react';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Комнаты',
        href: '/rooms',
    },
];

interface RoomsProps extends SharedData {
    rooms: { id: number; slug: string; name: string }[];
}

const ROOM_EMOJI: Record<string, string> = {
    office: '🏢',
    coworking: '💻',
};

export default function RoomsIndex() {
    const { rooms } = usePage<RoomsProps>().props;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Комнаты" />
            <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
                {rooms.map((room) => (
                    <div key={room.id} className="border-sidebar-border/70 dark:border-sidebar-border flex flex-col gap-3 rounded-xl border p-5">
                        <div className="text-3xl">{ROOM_EMOJI[room.slug] ?? '🚪'}</div>
                        <h2 className="text-lg font-semibold">{room.name}</h2>
                        <Button asChild className="mt-auto w-fit">
                            <Link href={`/rooms/${room.slug}`}>
                                <DoorOpen className="size-4" />
                                Войти
                            </Link>
                        </Button>
                    </div>
                ))}
            </div>
        </AppLayout>
    );
}
