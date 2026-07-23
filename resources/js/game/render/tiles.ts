import { Graphics, GraphicsContext } from 'pixi.js';
import { CHUNK_TILES } from '../camera';
import { TILE } from '../map';
import { COLORS } from './palette';

/**
 * Минимум, нужный для отрисовки тайлов: сетка символов, её размеры и признак
 * верхушки стены. `GameMap` этому удовлетворяет структурно (игра), а редактор
 * собирает такой источник из «сырых» рядов, не строя полный `makeMap`.
 */
export interface TileSource {
    rows: string[];
    width: number;
    height: number;
    isWallCrown(x: number, y: number): boolean;
}

/**
 * Части одного чанка: низ (пол и мебель — под игроками), верхушки стен (над
 * ними) и полупрозрачный двойник верхушек для выреза вокруг персонажа.
 * Верхушка и двойник делят один GraphicsContext.
 */
export interface ChunkParts {
    base: Graphics;
    crown: Graphics;
    ghost: Graphics;
    crownTiles: Set<number>; // индексы клеток верхушек: y * width + x
}

/**
 * Рисует один чанк карты (CHUNK_TILES × CHUNK_TILES тайлов) — процедурный пол
 * (в т.ч. зонный) и стены. Мебель — это предметы каталога, их рисует
 * prop-sprites поверх этого слоя.
 *
 * skipCrown — клетки, где верхушку стены рисовать не нужно: в игре это
 * доступная персонажу область (стена ближе к камере не должна загораживать
 * комнату, где он стоит). Редактор передаёт null и видит все верхушки.
 */
export function drawChunk(map: TileSource, cx: number, cy: number, skipCrown: ReadonlySet<number> | null): ChunkParts {
    const g = new Graphics();
    const crownContext = new GraphicsContext();
    const crownTiles = new Set<number>();
    const startX = cx * CHUNK_TILES;
    const startY = cy * CHUNK_TILES;
    const endX = Math.min(startX + CHUNK_TILES, map.width);
    const endY = Math.min(startY + CHUNK_TILES, map.height);

    for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
            const ch = map.rows[y]?.[x] ?? '.';
            const px = x * TILE;
            const py = y * TILE;

            // базовый пол под всеми тайлами
            const baseFloor =
                ch === ':'
                    ? COLORS.kitchenFloor
                    : ch === ','
                      ? COLORS.meetingCarpet
                      : ch === ';'
                        ? COLORS.loungeRug
                        : (x + y) % 2 === 0
                          ? COLORS.floor
                          : COLORS.floorAlt;
            g.rect(px, py, TILE, TILE).fill(baseFloor);

            // верхушка стены: рисуем её НАД клеткой со стеной, если сверху
            // не стена. Клетка остаётся проходимой — за стеной можно пройти
            if (map.isWallCrown(x, y - 1) && y > 0 && !skipCrown?.has((y - 1) * map.width + x)) {
                crownTiles.add((y - 1) * map.width + x);
                const cy2 = (y - 1) * TILE;
                crownContext.rect(px, cy2, TILE, TILE).fill(COLORS.wall);
                crownContext.rect(px, cy2, TILE, 7).fill(COLORS.wallTop);
                crownContext.rect(px, cy2 + TILE - 3, TILE, 3).fill({ color: 0x2b2733, alpha: 0.35 });
            }

            switch (ch) {
                case '#':
                    g.rect(px, py, TILE, TILE).fill(COLORS.wall);
                    g.rect(px, py, TILE, 6).fill(COLORS.wallTop);
                    break;
                case '*':
                    // spotlight-сцена: тёплый круг света
                    g.rect(px, py, TILE, TILE).fill(COLORS.spotlightFloor);
                    g.circle(px + TILE / 2, py + TILE / 2, TILE / 2 - 2).fill({ color: COLORS.spotlight, alpha: 0.5 });
                    g.circle(px + TILE / 2, py + TILE / 2, TILE / 4).fill({ color: COLORS.spotlight, alpha: 0.7 });
                    break;
            }
        }
    }

    return { base: g, crown: new Graphics(crownContext), ghost: new Graphics(crownContext), crownTiles };
}
