import { Mesh } from '@/webrtc/mesh';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Мешу нужен браузерный WebRTC, которого в vitest нет. Подменяем ровно то, чем
// он пользуется: сендеры, addTrack/removeTrack и заглушки согласования.

class FakeSender {
    constructor(public track: FakeTrack | null) {}

    replaceTrack(track: FakeTrack | null): Promise<void> {
        this.track = track;

        return Promise.resolve();
    }
}

interface FakeTrack {
    kind: 'audio' | 'video';
    label: string;
}

class FakePeerConnection {
    senders: FakeSender[] = [];

    closed = false;

    signalingState = 'stable';

    localDescription = null;

    onnegotiationneeded: (() => void) | null = null;

    onicecandidate: (() => void) | null = null;

    ontrack: (() => void) | null = null;

    onconnectionstatechange: (() => void) | null = null;

    addTrack(track: FakeTrack): FakeSender {
        const sender = new FakeSender(track);
        this.senders.push(sender);

        return sender;
    }

    removeTrack(sender: FakeSender): void {
        this.senders = this.senders.filter((s) => s !== sender);
    }

    getSenders(): FakeSender[] {
        return this.senders;
    }

    close(): void {
        this.closed = true;
    }

    setLocalDescription(): Promise<void> {
        return Promise.resolve();
    }

    setRemoteDescription(): Promise<void> {
        return Promise.resolve();
    }

    addIceCandidate(): Promise<void> {
        return Promise.resolve();
    }
}

class FakeMediaStream {
    constructor(private tracks: FakeTrack[] = []) {}

    getTracks(): FakeTrack[] {
        return this.tracks;
    }

    getAudioTracks(): FakeTrack[] {
        return this.tracks.filter((t) => t.kind === 'audio');
    }

    getVideoTracks(): FakeTrack[] {
        return this.tracks.filter((t) => t.kind === 'video');
    }
}

const track = (kind: 'audio' | 'video', label: string): FakeTrack => ({ kind, label });

const created: FakePeerConnection[] = [];

// подмены живут в globalThis — типы браузерных API здесь только мешают
const globals = globalThis as unknown as Record<string, unknown>;

beforeEach(() => {
    created.length = 0;
    globals.RTCPeerConnection = function FakeRtc() {
        const pc = new FakePeerConnection();
        created.push(pc);

        return pc;
    };
    globals.MediaStream = FakeMediaStream;
});

const meshOf = () =>
    new Mesh(1, {
        sendSignal: vi.fn(),
        onRemoteStream: vi.fn(),
        onPeerClosed: vi.fn(),
    });

const sentTracks = (pc: FakePeerConnection | undefined) => (pc ? pc.getSenders().map((s) => s.track?.label ?? null) : []);

describe('исходящее видео', () => {
    it('пиру, поднятому во время демонстрации, уезжает экран, а не камера', () => {
        const mesh = meshOf();
        mesh.setLocalStream(new FakeMediaStream([track('audio', 'mic'), track('video', 'cam')]) as unknown as MediaStream);
        mesh.replaceVideoTrack(track('video', 'screen') as unknown as MediaStreamTrack);

        mesh.updatePeers([2]); // новый собеседник подошёл уже во время показа

        expect(sentTracks(created[0])).toEqual(['mic', 'screen']);
    });

    it('вошедшему без камеры сендер создаётся по месту, а на остановке показа снимается', () => {
        const mesh = meshOf();
        // audio-only фолбэк: видео-трека нет вовсе
        mesh.setLocalStream(new FakeMediaStream([track('audio', 'mic')]) as unknown as MediaStream);
        mesh.updatePeers([2]);
        expect(sentTracks(created[0])).toEqual(['mic']);

        mesh.replaceVideoTrack(track('video', 'screen') as unknown as MediaStreamTrack);
        expect(sentTracks(created[0])).toEqual(['mic', 'screen']);

        // показ остановлен, возвращаться нечему: дорожку снимаем целиком —
        // replaceTrack(null) оставил бы у собеседников замерший кадр
        mesh.replaceVideoTrack(null);
        expect(sentTracks(created[0])).toEqual(['mic']);
    });
});

describe('подъём соединения по входящему сигналу', () => {
    it('сигнал от неизвестного пира поднимает соединение', async () => {
        const mesh = meshOf();
        await mesh.handleSignal(2, { candidate: {} });

        expect(mesh.peerIds()).toEqual([2]);
    });

    it('«хвостовой» сигнал от только что закрытого пира соединение не воскрешает', async () => {
        const mesh = meshOf();
        mesh.updatePeers([2]);
        mesh.updatePeers([]); // собеседник вышел из звонка — пир закрыт

        await mesh.handleSignal(2, { candidate: {} });

        expect(mesh.peerIds()).toEqual([]);
    });
});
