export type Direction = 'up' | 'down' | 'left' | 'right';

export interface PlayerState {
    id: number;
    name: string;
    x: number; // координата тайла
    y: number;
    dir: Direction;
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
}

export interface ChatPayload {
    id: number;
    name: string;
    text: string;
    x: number;
    y: number;
}
