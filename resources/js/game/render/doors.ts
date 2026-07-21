import { Graphics } from 'pixi.js';
import { TILE, type DoorData, type DoorState } from '../map';
import { COLORS } from './palette';

/**
 * Перерисовывает одну дверь: открытая — тонкий косяк по краям проёма,
 * закрытая — полотно во всю клетку. Ручка видна со стороны замка, чтобы было
 * понятно, откуда запирать. Graphics позиционируется на клетке двери снаружи.
 */
export function drawDoor(g: Graphics, door: DoorData, state: DoorState): void {
    g.clear();

    // косяк: две стойки по бокам проёма, они видны всегда
    g.rect(0, 0, 3, TILE).fill(COLORS.doorFrame);
    g.rect(TILE - 3, 0, 3, TILE).fill(COLORS.doorFrame);

    if (state.closed) {
        g.rect(3, 0, TILE - 6, TILE).fill(state.locked ? COLORS.doorLocked : COLORS.door);
        g.rect(3, 0, TILE - 6, 5).fill({ color: 0xffffff, alpha: 0.12 });
        const knob = door.lock === 'north' ? 7 : door.lock === 'south' ? TILE - 7 : TILE / 2;
        g.circle(TILE - 8, knob, 2.5).fill(state.locked ? COLORS.doorLockedKnob : COLORS.doorKnob);
    }
}
