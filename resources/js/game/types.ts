import type { RtcSignal } from '@/webrtc/mesh';
import type { AvatarConfig } from './avatar';

export type Direction = 'up' | 'down' | 'left' | 'right';

export type PlayerStatus = 'available' | 'busy' | 'dnd' | 'away';

export interface PlayerState {
    id: number;
    name: string;
    x: number; // координата тайла
    y: number;
    dir: Direction;
    status: PlayerStatus;
    avatar?: AvatarConfig | null;
}

export interface ChatMessage {
    key: string;
    userId: number;
    name: string;
    text: string;
    at: number;
}

// персистентное сообщение чата комнаты (из БД / broadcast-события)
export interface RoomMessage {
    id: number;
    userId: number;
    name: string;
    body: string;
    at: string;
}

export interface MovePayload {
    id: number;
    x: number;
    y: number;
    dir: Direction;
    st?: PlayerStatus;
    // в звонке ли отправитель — для реконсиляции состава звонка по heartbeat
    call?: boolean;
}

export interface ChatPayload {
    id: number;
    name: string;
    text: string;
    x: number;
    y: number;
}

export interface ReactPayload {
    id: number;
    emoji: string;
}

export interface StatusPayload {
    id: number;
    status: PlayerStatus;
}

export interface LookPayload {
    id: number;
    avatar: AvatarConfig;
}

export interface BuzzPayload {
    from: number;
    name: string;
    to: number;
}

export interface CallPayload {
    id: number;
    inCall: boolean;
}

export interface RtcSignalPayload {
    from: number;
    to: number;
    signal: RtcSignal;
}
