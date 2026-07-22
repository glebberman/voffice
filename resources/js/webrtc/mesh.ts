import { iceServers } from './config';

// Сколько не поднимать соединение по входящему сигналу после того, как сами его
// закрыли: чуть шире периода heartbeat (5 с), которым сверяется состав звонка.
const RESURRECT_GUARD_MS = 6000;

// Сигнал, которым обмениваются пиры (через whisper 'rtc'): либо SDP-описание,
// либо ICE-кандидат.
export interface RtcSignal {
    description?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
}

export interface MeshCallbacks {
    // отправить сигнал конкретному пиру (пойдёт whisper'ом)
    sendSignal: (to: number, signal: RtcSignal) => void;
    onRemoteStream: (peerId: number, stream: MediaStream) => void;
    onPeerClosed: (peerId: number) => void;
}

interface Peer {
    pc: RTCPeerConnection;
    polite: boolean;
    makingOffer: boolean;
    ignoreOffer: boolean;
    stream: MediaStream;
    // Видео-дорожка у пира одна, а её содержимое меняется (камера ↔ экран).
    // Держим сендер здесь: getSenders() не найдёт его, пока трек снят в null,
    // а у вошедшего без камеры его поначалу вообще нет.
    videoSender: RTCRtpSender | null;
}

// Mesh WebRTC-соединений с «perfect negotiation»: обе стороны создают
// соединение симметрично, коллизии офферов (glare) разруливает вежливый
// (polite) пир. См. https://w3c.github.io/webrtc-pc/#perfect-negotiation-example
export class Mesh {
    private peers = new Map<number, Peer>();
    private localStream: MediaStream | null = null;
    // что реально уходит в видео-дорожку: камера или экран
    private videoTrack: MediaStreamTrack | null = null;
    // Кого только что закрыли: «хвостовой» сигнал от них воскрешал бы
    // соединение. Чёрный список, а не белый: пропускать сигнал от того, кого мы
    // ещё не успели захотеть, обязательно — иначе отброшенный оффер оставит
    // обе стороны в have-local-offer навсегда (impolite ждёт rollback, которого
    // не будет).
    private recentlyClosed = new Map<number, number>();

    constructor(
        private selfId: number,
        private cb: MeshCallbacks,
    ) {}

    setLocalStream(stream: MediaStream | null): void {
        this.localStream = stream;
        this.videoTrack = stream?.getVideoTracks()[0] ?? null;
        for (const [, peer] of this.peers) {
            this.attachTracks(peer);
        }
    }

    // Привести множество соединений к желаемому (по близости): создать новые,
    // закрыть ушедшие.
    updatePeers(desired: number[]): void {
        const set = new Set(desired);
        for (const id of desired) {
            if (!this.peers.has(id)) {
                this.createPeer(id);
            }
        }
        for (const id of [...this.peers.keys()]) {
            if (!set.has(id)) {
                this.closePeer(id);
            }
        }
    }

    async handleSignal(peerId: number, signal: RtcSignal): Promise<void> {
        // Сигнал может прийти раньше, чем близость создаст соединение, —
        // поднимаем пира. Не поднимаем только того, кого сами что закрыли:
        // его «хвостовой» оффер иначе воскрешал бы связь до heartbeat.
        const known = this.peers.get(peerId);
        if (!known && this.closedJustNow(peerId)) {
            return;
        }
        const peer = known ?? this.createPeer(peerId);
        const pc = peer.pc;

        try {
            if (signal.description) {
                const collision = signal.description.type === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable');
                peer.ignoreOffer = !peer.polite && collision;
                if (peer.ignoreOffer) {
                    return;
                }
                await pc.setRemoteDescription(signal.description);
                if (signal.description.type === 'offer') {
                    await pc.setLocalDescription();
                    this.cb.sendSignal(peerId, { description: pc.localDescription ?? undefined });
                }
            } else if (signal.candidate) {
                try {
                    await pc.addIceCandidate(signal.candidate);
                } catch (err) {
                    if (!peer.ignoreOffer) {
                        throw err;
                    }
                }
            }
        } catch {
            // сбой согласования на одном пире не должен ронять остальные
        }
    }

    // заменить исходящий видео-трек (демонстрация экрана / возврат к камере)
    replaceVideoTrack(track: MediaStreamTrack | null): void {
        this.videoTrack = track;
        for (const [, peer] of this.peers) {
            this.applyVideo(peer);
        }
    }

    peerIds(): number[] {
        return [...this.peers.keys()];
    }

    destroy(): void {
        for (const id of [...this.peers.keys()]) {
            this.closePeer(id);
        }
    }

    /** Закрывали ли мы этого пира только что — окно чуть шире периода heartbeat. */
    private closedJustNow(peerId: number): boolean {
        const at = this.recentlyClosed.get(peerId);

        return at !== undefined && Date.now() - at < RESURRECT_GUARD_MS;
    }

    private attachTracks(peer: Peer): void {
        if (!this.localStream) {
            return;
        }
        const existing = new Set(peer.pc.getSenders().map((s) => s.track));
        for (const track of this.localStream.getAudioTracks()) {
            if (!existing.has(track)) {
                peer.pc.addTrack(track, this.localStream);
            }
        }
        // видео отдельно: пиру, поднятому во время демонстрации экрана, должен
        // уехать экран, а не камера из localStream
        this.applyVideo(peer);
    }

    /**
     * Приводит видео-дорожку пира к текущему `videoTrack`. Сендера может ещё не
     * быть — у вошедшего по audio-only фолбэку камеры нет вовсе, и без addTrack
     * демонстрация экрана у него молча никуда не уходила.
     */
    private applyVideo(peer: Peer): void {
        const sender = peer.videoSender;
        if (sender && this.videoTrack) {
            // replaceTrack может отказать (новый трек не ложится на сендер без
            // ренеготиации) — тогда пересобираем дорожку через addTrack
            sender.replaceTrack(this.videoTrack).catch(() => {
                peer.pc.removeTrack(sender);
                peer.videoSender = this.videoTrack ? peer.pc.addTrack(this.videoTrack, this.localStream ?? new MediaStream()) : null;
            });

            return;
        }
        if (sender) {
            // Отдавать нечего: снимаем дорожку целиком, а не replaceTrack(null).
            // Тот лишь заглушает трек, и у собеседников замирал бы последний
            // кадр экрана — «показ остановлен», а картинка висит.
            peer.pc.removeTrack(sender);
            peer.videoSender = null;

            return;
        }
        if (this.videoTrack) {
            peer.videoSender = peer.pc.addTrack(this.videoTrack, this.localStream ?? new MediaStream());
        }
    }

    private createPeer(peerId: number): Peer {
        const pc = new RTCPeerConnection({ iceServers: iceServers() });
        const peer: Peer = {
            pc,
            polite: this.selfId < peerId, // меньший id — вежливый
            makingOffer: false,
            ignoreOffer: false,
            stream: new MediaStream(),
            videoSender: null,
        };
        this.peers.set(peerId, peer);
        this.attachTracks(peer);

        pc.onnegotiationneeded = async () => {
            try {
                peer.makingOffer = true;
                await pc.setLocalDescription();
                this.cb.sendSignal(peerId, { description: pc.localDescription ?? undefined });
            } catch {
                // проглатываем — perfect negotiation повторит при необходимости
            } finally {
                peer.makingOffer = false;
            }
        };

        pc.onicecandidate = ({ candidate }) => {
            if (candidate) {
                this.cb.sendSignal(peerId, { candidate: candidate.toJSON() });
            }
        };

        pc.ontrack = ({ track, streams }) => {
            peer.stream.addTrack(track);
            this.cb.onRemoteStream(peerId, streams[0] ?? peer.stream);
        };

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
                this.closePeer(peerId);
            }
        };

        return peer;
    }

    private closePeer(peerId: number): void {
        const peer = this.peers.get(peerId);
        if (!peer) {
            return;
        }
        peer.pc.onnegotiationneeded = null;
        peer.pc.onicecandidate = null;
        peer.pc.ontrack = null;
        peer.pc.onconnectionstatechange = null;
        peer.pc.close();
        this.peers.delete(peerId);
        this.recentlyClosed.set(peerId, Date.now());
        // заодно подчищаем протухшие отметки, чтобы map не рос вечно
        for (const [id, at] of this.recentlyClosed) {
            if (Date.now() - at >= RESURRECT_GUARD_MS) {
                this.recentlyClosed.delete(id);
            }
        }
        this.cb.onPeerClosed(peerId);
    }
}
