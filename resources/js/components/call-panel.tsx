import { Button } from '@/components/ui/button';
import type { CallPeer } from '@/hooks/use-office';
import { Mic, MicOff, Monitor, MonitorOff, Phone, PhoneOff, Video, VideoOff } from 'lucide-react';
import { useEffect, useRef } from 'react';

// Одна видео-плитка: <video> с потоком, громкость по дистанции, кольцо
// вокруг говорящего.
function VideoTile({ peer }: { peer: { name: string; stream: MediaStream | null; speaking: boolean; volume: number; muted: boolean } }) {
    const ref = useRef<HTMLVideoElement | null>(null);

    useEffect(() => {
        const el = ref.current;
        if (el && el.srcObject !== peer.stream) {
            el.srcObject = peer.stream;
        }
    }, [peer.stream]);

    useEffect(() => {
        if (ref.current) {
            ref.current.volume = peer.volume;
        }
    }, [peer.volume]);

    return (
        <div
            className={`relative aspect-video w-40 overflow-hidden rounded-lg border bg-neutral-900 transition-shadow ${
                peer.speaking ? 'ring-2 ring-green-400' : ''
            }`}
        >
            <video ref={ref} autoPlay playsInline muted={peer.muted} className="h-full w-full object-cover" />
            <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">{peer.name}</span>
        </div>
    );
}

interface CallPanelProps {
    inCall: boolean;
    micOn: boolean;
    camOn: boolean;
    screenOn: boolean;
    selfSpeaking: boolean;
    callError: string | null;
    localStream: MediaStream | null;
    peers: Map<number, CallPeer>;
    selfName: string;
    onJoin: () => void;
    onLeave: () => void;
    onToggleMic: () => void;
    onToggleCamera: () => void;
    onToggleScreen: () => void;
}

export function CallPanel({
    inCall,
    micOn,
    camOn,
    screenOn,
    selfSpeaking,
    callError,
    localStream,
    peers,
    selfName,
    onJoin,
    onLeave,
    onToggleMic,
    onToggleCamera,
    onToggleScreen,
}: CallPanelProps) {
    const peerList = [...peers.values()];

    return (
        <div className="border-sidebar-border/70 dark:border-sidebar-border rounded-xl border p-4">
            <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">
                    Звонок {inCall && <span className="text-muted-foreground font-normal">({peerList.length + 1})</span>}
                </h2>
                {!inCall ? (
                    <Button size="sm" className="ml-auto h-8" onClick={onJoin}>
                        <Phone className="size-4" />
                        Присоединиться
                    </Button>
                ) : (
                    <div className="ml-auto flex gap-1">
                        <Button size="icon" variant={micOn ? 'outline' : 'secondary'} className="size-8" title="Микрофон" onClick={onToggleMic}>
                            {micOn ? <Mic className="size-4" /> : <MicOff className="size-4" />}
                        </Button>
                        <Button size="icon" variant={camOn ? 'outline' : 'secondary'} className="size-8" title="Камера" onClick={onToggleCamera}>
                            {camOn ? <Video className="size-4" /> : <VideoOff className="size-4" />}
                        </Button>
                        <Button
                            size="icon"
                            variant={screenOn ? 'default' : 'outline'}
                            className="size-8"
                            title="Демонстрация экрана"
                            onClick={onToggleScreen}
                        >
                            {screenOn ? <MonitorOff className="size-4" /> : <Monitor className="size-4" />}
                        </Button>
                        <Button size="icon" variant="destructive" className="size-8" title="Выйти из звонка" onClick={onLeave}>
                            <PhoneOff className="size-4" />
                        </Button>
                    </div>
                )}
            </div>

            {callError && <p className="text-destructive mt-2 text-xs">{callError}</p>}

            {inCall && (
                <div className="mt-3 flex flex-wrap gap-2">
                    <VideoTile peer={{ name: `${selfName} (вы)`, stream: localStream, speaking: selfSpeaking, volume: 0, muted: true }} />
                    {peerList.map((peer) => (
                        <VideoTile
                            key={peer.id}
                            peer={{ name: peer.name, stream: peer.stream, speaking: peer.speaking, volume: peer.volume, muted: false }}
                        />
                    ))}
                    {peerList.length === 0 && (
                        <p className="text-muted-foreground text-xs">Подойдите к коллеге в звонке — видео и звук включатся автоматически.</p>
                    )}
                </div>
            )}

            {!inCall && (
                <p className="text-muted-foreground mt-2 text-xs">
                    Присоединитесь к звонку — с теми, кто рядом и тоже в звонке, связь установится сама. Громкость зависит от расстояния.
                </p>
            )}
        </div>
    );
}
