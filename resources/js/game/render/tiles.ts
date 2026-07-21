import { Graphics, GraphicsContext } from 'pixi.js';
import { CHUNK_TILES } from '../camera';
import { TILE, type GameMap } from '../map';
import { COLORS } from './palette';

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
 * Рисует один чанк карты (CHUNK_TILES × CHUNK_TILES тайлов) — процедурный пол,
 * стены и символьную мебель.
 *
 * skipCrown — клетки, где верхушку стены рисовать не нужно: в игре это
 * доступная персонажу область (стена ближе к камере не должна загораживать
 * комнату, где он стоит). Редактор передаёт null и видит все верхушки.
 */
export function drawChunk(map: GameMap, cx: number, cy: number, skipCrown: ReadonlySet<number> | null): ChunkParts {
    const g = new Graphics();
    const crownContext = new GraphicsContext();
    const crownTiles = new Set<number>();
    const startX = cx * CHUNK_TILES;
    const startY = cy * CHUNK_TILES;
    const endX = Math.min(startX + CHUNK_TILES, map.width);
    const endY = Math.min(startY + CHUNK_TILES, map.height);

    for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
            const ch = map.rows[y][x];
            const px = x * TILE;
            const py = y * TILE;

            // базовый пол под всеми тайлами
            const baseFloor =
                ch === ':' || ch === 'K'
                    ? COLORS.kitchenFloor
                    : ch === ',' || ch === 'T'
                      ? COLORS.meetingCarpet
                      : ch === ';' || ch === 'S'
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
                case 'D':
                    g.roundRect(px + 2, py + 4, TILE - 4, TILE - 8, 4).fill(COLORS.desk);
                    g.roundRect(px + 4, py + 6, TILE - 8, TILE - 16, 3).fill(COLORS.deskTop);
                    break;
                case 'K':
                    g.roundRect(px + 2, py + 2, TILE - 4, TILE - 4, 3).fill(COLORS.counter);
                    g.roundRect(px + 4, py + 4, TILE - 8, TILE - 12, 2).fill(COLORS.counterTop);
                    break;
                case 'T':
                    g.roundRect(px + 1, py + 3, TILE - 2, TILE - 6, 5).fill(COLORS.table);
                    g.roundRect(px + 3, py + 5, TILE - 6, TILE - 12, 4).fill(COLORS.tableTop);
                    break;
                case 'S':
                    g.roundRect(px + 2, py + 5, TILE - 4, TILE - 8, 6).fill(COLORS.sofa);
                    g.roundRect(px + 4, py + 7, TILE - 8, TILE - 14, 4).fill(COLORS.sofaTop);
                    break;
                case 'P':
                    g.roundRect(px + 9, py + 16, 14, 12, 3).fill(COLORS.plantPot);
                    g.circle(px + 16, py + 12, 9).fill(COLORS.plant);
                    g.circle(px + 10, py + 16, 6).fill(COLORS.plant);
                    g.circle(px + 22, py + 16, 6).fill(COLORS.plant);
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
