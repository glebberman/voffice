import { iceServers } from './config';

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
}

// Mesh WebRTC-соединений с «perfect negotiation»: обе стороны создают
// соединение симметрично, коллизии офферов (glare) разруливает вежливый
// (polite) пир. См. https://w3c.github.io/webrtc-pc/#perfect-negotiation-example
export class Mesh {
    private peers = new Map<number, Peer>();
    private localStream: MediaStream | null = null;

    constructor(
        private selfId: number,
        private cb: MeshCallbacks,
    ) {}

    setLocalStream(stream: MediaStream | null): void {
        this.localStream = stream;
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
        // сигнал может прийти раньше, чем близость создаст соединение
        const peer = this.peers.get(peerId) ?? this.createPeer(peerId);
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
        for (const [, peer] of this.peers) {
            const sender = peer.pc.getSenders().find((s) => s.track?.kind === 'video');
            void sender?.replaceTrack(track);
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

    private attachTracks(peer: Peer): void {
        if (!this.localStream) {
            return;
        }
        const existing = new Set(peer.pc.getSenders().map((s) => s.track));
        for (const track of this.localStream.getTracks()) {
            if (!existing.has(track)) {
                peer.pc.addTrack(track, this.localStream);
            }
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
        this.cb.onPeerClosed(peerId);
    }
}
