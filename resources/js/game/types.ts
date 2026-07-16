export type Direction = 'up' | 'down' | 'left' | 'right';

export type PlayerStatus = 'available' | 'busy' | 'dnd' | 'away';

export interface PlayerState {
    id: number;
    name: string;
    x: number; // координата тайла
    y: number;
    dir: Direction;
    status: PlayerStatus;
}

export interface ChatMessage {
    key: string;
    userId: number;
    name: string;
    text: string;
    at: number;
}

export interface MovePayload {
    id: number;
    x: number;
    y: number;
    dir: Direction;
    st?: PlayerStatus;
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
