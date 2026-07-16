import { Application, Container, Graphics, Text } from 'pixi.js';
import { CHAT_RADIUS, MAP_H, MAP_ROWS, MAP_W, TILE, ZONES } from './map';
import type { Direction, PlayerState } from './types';

const COLORS = {
    floor: 0xede7dc,
    floorAlt: 0xe7e0d3,
    wall: 0x4a4458,
    wallTop: 0x5d5570,
    desk: 0xb08968,
    deskTop: 0xc9a583,
    kitchenFloor: 0xdce8e4,
    counter: 0x8aafa5,
    counterTop: 0xa3c4bb,
    meetingCarpet: 0xdce0f0,
    table: 0x7c6fae,
    tableTop: 0x958ac2,
    loungeRug: 0xf2ddd0,
    sofa: 0xd98e73,
    sofaTop: 0xe5a68e,
    plantPot: 0xa9714b,
    plant: 0x5fa867,
    zoneLabel: 0x6b6478,
};

const AVATAR_COLORS = [0xe4572e, 0x17bebb, 0xffc914, 0x2e933c, 0x7768ae, 0xd1495b, 0x3b8ea5, 0xf26430];

function avatarColor(id: number): number {
    return AVATAR_COLORS[Math.abs(id) % AVATAR_COLORS.length];
}

function centerOf(tileX: number, tileY: number): { x: number; y: number } {
    return { x: tileX * TILE + TILE / 2, y: tileY * TILE + TILE / 2 };
}

const EYE_OFFSET: Record<Direction, { dx: number; dy: number }> = {
    up: { dx: 0, dy: -1 },
    down: { dx: 0, dy: 1 },
    left: { dx: -1, dy: 0 },
    right: { dx: 1, dy: 0 },
};

interface PlayerSprite {
    root: Container;
    eyes: Graphics;
    bubble: Container;
    bubbleTimer: ReturnType<typeof setTimeout> | null;
    target: { x: number; y: number };
    dir: Direction;
}

const MOVE_SPEED = TILE * 7; // px в секунду

export class OfficeScene {
    private app = new Application();
    private players = new Map<number, PlayerSprite>();
    private playerLayer = new Container();
    private proximityRing = new Graphics();
    private selfId: number | null = null;
    private destroyed = false;

    async init(host: HTMLElement): Promise<void> {
        await this.app.init({
            width: MAP_W * TILE,
            height: MAP_H * TILE,
            background: 0x37323f,
            antialias: true,
            resolution: Math.min(window.devicePixelRatio || 1, 2),
            autoDensity: true,
        });

        if (this.destroyed) {
            // React успел размонтироваться, пока Pixi инициализировался
            this.app.destroy(true, { children: true });
            return;
        }

        host.appendChild(this.app.canvas);
        this.app.canvas.style.maxWidth = '100%';
        this.app.canvas.style.height = 'auto';

        this.drawMap();
        this.proximityRing
            .circle(0, 0, CHAT_RADIUS * TILE)
            .fill({ color: 0xffffff, alpha: 0.05 })
            .stroke({ width: 1.5, color: 0xffffff, alpha: 0.18 });
        this.proximityRing.visible = false;
        this.drawZoneLabels();
        this.app.stage.addChild(this.proximityRing);
        this.app.stage.addChild(this.playerLayer);

        this.app.ticker.add((ticker) => this.tick(ticker.deltaMS));
    }

    destroy(): void {
        this.destroyed = true;
        for (const sprite of this.players.values()) {
            if (sprite.bubbleTimer) {
                clearTimeout(sprite.bubbleTimer);
            }
        }
        this.players.clear();
        if (this.app.renderer) {
            this.app.destroy(true, { children: true });
        }
    }

    upsertPlayer(state: PlayerState, isSelf: boolean): void {
        const existing = this.players.get(state.id);
        const pos = centerOf(state.x, state.y);

        if (existing) {
            existing.target = pos;
            this.faceDirection(existing, state.dir);
            return;
        }

        const root = new Container();
        root.position.set(pos.x, pos.y);

        const color = avatarColor(state.id);
        const body = new Graphics();
        body.circle(0, 0, 12)
            .fill(color)
            .stroke({ width: isSelf ? 3 : 2, color: isSelf ? 0xffffff : 0x37323f, alpha: 0.9 });
        root.addChild(body);

        const eyes = new Graphics();
        root.addChild(eyes);

        const label = new Text({
            text: state.name,
            style: {
                fontFamily: 'Instrument Sans, sans-serif',
                fontSize: 11,
                fontWeight: '600',
                fill: 0xffffff,
                stroke: { color: 0x37323f, width: 3 },
            },
        });
        label.anchor.set(0.5, 0);
        label.position.set(0, 15);
        root.addChild(label);

        const bubble = new Container();
        bubble.visible = false;
        root.addChild(bubble);

        this.playerLayer.addChild(root);

        const sprite: PlayerSprite = { root, eyes, bubble, bubbleTimer: null, target: pos, dir: state.dir };
        this.players.set(state.id, sprite);
        this.faceDirection(sprite, state.dir);

        if (isSelf) {
            this.selfId = state.id;
            this.proximityRing.visible = true;
            this.proximityRing.position.set(pos.x, pos.y);
        }
    }

    movePlayer(id: number, tileX: number, tileY: number, dir: Direction): void {
        const sprite = this.players.get(id);
        if (!sprite) {
            return;
        }
        sprite.target = centerOf(tileX, tileY);
        this.faceDirection(sprite, dir);
    }

    removePlayer(id: number): void {
        const sprite = this.players.get(id);
        if (!sprite) {
            return;
        }
        if (sprite.bubbleTimer) {
            clearTimeout(sprite.bubbleTimer);
        }
        sprite.root.destroy({ children: true });
        this.players.delete(id);
    }

    showBubble(id: number, text: string): void {
        const sprite = this.players.get(id);
        if (!sprite) {
            return;
        }

        sprite.bubble.removeChildren().forEach((c) => c.destroy());

        const content = new Text({
            text: text.length > 60 ? text.slice(0, 57) + '…' : text,
            style: {
                fontFamily: 'Instrument Sans, sans-serif',
                fontSize: 11,
                fill: 0x2b2733,
                wordWrap: true,
                wordWrapWidth: 150,
            },
        });

        const padX = 8;
        const padY = 5;
        const bg = new Graphics();
        bg.roundRect(-content.width / 2 - padX, -content.height - padY * 2, content.width + padX * 2, content.height + padY * 2, 8).fill({
            color: 0xffffff,
            alpha: 0.95,
        });
        content.anchor.set(0.5, 1);
        content.position.set(0, -padY);

        sprite.bubble.addChild(bg, content);
        sprite.bubble.position.set(0, -18);
        sprite.bubble.visible = true;

        if (sprite.bubbleTimer) {
            clearTimeout(sprite.bubbleTimer);
        }
        sprite.bubbleTimer = setTimeout(() => {
            sprite.bubble.visible = false;
        }, 4500);
    }

    private tick(deltaMS: number): void {
        const step = (MOVE_SPEED * deltaMS) / 1000;
        for (const [id, sprite] of this.players) {
            const dx = sprite.target.x - sprite.root.x;
            const dy = sprite.target.y - sprite.root.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 0.5) {
                const k = Math.min(1, step / dist);
                sprite.root.x += dx * k;
                sprite.root.y += dy * k;
            } else {
                sprite.root.position.set(sprite.target.x, sprite.target.y);
            }
            if (id === this.selfId) {
                this.proximityRing.position.set(sprite.root.x, sprite.root.y);
            }
        }
    }

    private faceDirection(sprite: PlayerSprite, dir: Direction): void {
        sprite.dir = dir;
        const { dx, dy } = EYE_OFFSET[dir];
        const px = -dy; // перпендикуляр для разноса глаз
        const py = dx;
        sprite.eyes.clear();
        sprite.eyes
            .circle(dx * 5 + px * 3.5, dy * 5 + py * 3.5, 2.2)
            .circle(dx * 5 - px * 3.5, dy * 5 - py * 3.5, 2.2)
            .fill(0xffffff);
    }

    private drawMap(): void {
        const g = new Graphics();

        for (let y = 0; y < MAP_H; y++) {
            for (let x = 0; x < MAP_W; x++) {
                const ch = MAP_ROWS[y][x];
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
                }
            }
        }

        this.app.stage.addChild(g);
    }

    private drawZoneLabels(): void {
        for (const zone of ZONES) {
            const label = new Text({
                text: zone.name.toUpperCase(),
                style: {
                    fontFamily: 'Instrument Sans, sans-serif',
                    fontSize: 10,
                    fontWeight: '700',
                    fill: COLORS.zoneLabel,
                    letterSpacing: 1.5,
                },
            });
            label.alpha = 0.75;
            label.anchor.set(0.5, 0);
            label.position.set(((zone.x1 + zone.x2 + 1) / 2) * TILE, zone.y1 * TILE + 4);
            this.app.stage.addChild(label);
        }
    }
}
