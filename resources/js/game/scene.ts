import { Application, Container, Graphics, Sprite, Text } from 'pixi.js';
import { DIR_ROW, loadAvatar, WALK_COLS, type AvatarConfig, type AvatarLayers } from './avatar';
import { CHAT_RADIUS, TILE, type GameMap, type MapObjectType } from './map';
import type { Direction, PlayerState, PlayerStatus } from './types';

const OBJECT_EMOJI: Record<MapObjectType, string> = {
    board: '📝',
    video: '📺',
    map: '🗺️',
    link: '🔗',
};

const STATUS_COLORS: Record<PlayerStatus, number> = {
    available: 0x22c55e,
    busy: 0xf59e0b,
    dnd: 0xef4444,
    away: 0x9ca3af,
};

const REACTION_TTL_MS = 1600;

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
    spotlightFloor: 0xf4e9c8,
    spotlight: 0xffe08a,
};

const AVATAR_COLORS = [0xe4572e, 0x17bebb, 0xffc914, 0x2e933c, 0x7768ae, 0xd1495b, 0x3b8ea5, 0xf26430];

function avatarColor(id: number): number {
    return AVATAR_COLORS[Math.abs(id) % AVATAR_COLORS.length];
}

function centerOf(tileX: number, tileY: number): { x: number; y: number } {
    return { x: tileX * TILE + TILE / 2, y: tileY * TILE + TILE / 2 };
}

// низ LPC-персонажа относительно центра тайла (ноги чуть ниже центра)
const FEET_Y = 16;

interface PlayerSprite {
    root: Container;
    charSprites: Sprite[];
    avatar: AvatarLayers | null;
    walkTime: number;
    frame: number;
    bubble: Container;
    bubbleTimer: ReturnType<typeof setTimeout> | null;
    target: { x: number; y: number };
    dir: Direction;
    status: PlayerStatus;
    statusDot: Graphics;
    labelHalfWidth: number;
    floaters: { node: Text; age: number }[];
}

const MOVE_SPEED = TILE * 7; // px в секунду

export class OfficeScene {
    private app = new Application();
    private players = new Map<number, PlayerSprite>();
    private playerLayer = new Container();
    private proximityRing = new Graphics();
    private selfId: number | null = null;
    private destroyed = false;
    private sceneTime = 0;
    private portalPads: Graphics[] = [];
    private objectNodes = new Map<string, { icon: Text; ring: Graphics; baseY: number }>();
    private highlightedObject: string | null = null;
    private shakeTime = 0;
    private pings: { node: Text; age: number }[] = [];

    constructor(private map: GameMap) {}

    async init(host: HTMLElement): Promise<void> {
        await this.app.init({
            width: this.map.width * TILE,
            height: this.map.height * TILE,
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
        this.drawPortals();
        this.app.stage.addChild(this.proximityRing);
        this.playerLayer.sortableChildren = true; // кто ниже по карте — тот поверх
        this.app.stage.addChild(this.playerLayer);
        this.drawObjects();

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
            this.setStatus(state.id, state.status);
            return;
        }

        const root = new Container();
        root.position.set(pos.x, pos.y);
        root.zIndex = pos.y;

        const ground = new Graphics();
        ground.ellipse(0, FEET_Y - 2, 10, 4).fill({ color: 0x000000, alpha: 0.18 });
        if (isSelf) {
            ground.ellipse(0, FEET_Y - 2, 13, 6).stroke({ width: 2, color: avatarColor(state.id), alpha: 0.9 });
        }
        root.addChild(ground);

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
        label.position.set(0, FEET_Y + 3);
        root.addChild(label);

        const statusDot = new Graphics();
        root.addChild(statusDot);

        const bubble = new Container();
        bubble.visible = false;
        root.addChild(bubble);

        this.playerLayer.addChild(root);

        const sprite: PlayerSprite = {
            root,
            charSprites: [],
            avatar: null,
            walkTime: 0,
            frame: 0,
            bubble,
            bubbleTimer: null,
            target: pos,
            dir: state.dir,
            status: state.status,
            statusDot,
            labelHalfWidth: label.width / 2,
            floaters: [],
        };
        this.players.set(state.id, sprite);
        this.drawStatusDot(sprite);
        this.loadLook(state.id, sprite, state.avatar);

        if (isSelf) {
            this.selfId = state.id;
            this.proximityRing.visible = true;
            this.proximityRing.position.set(pos.x, pos.y);
        }
    }

    // (пере)загрузка слоёв персонажа: асинхронно, между тенью и именем
    private loadLook(id: number, sprite: PlayerSprite, cfg?: AvatarConfig | null): void {
        loadAvatar(id, cfg).then((layers) => {
            if (this.destroyed || this.players.get(id) !== sprite || layers.length === 0) {
                return;
            }
            for (const old of sprite.charSprites) {
                old.destroy();
            }
            sprite.charSprites = [];
            sprite.avatar = layers;
            layers.forEach((_, i) => {
                const s = new Sprite(layers[i][DIR_ROW[sprite.dir]][Math.min(sprite.frame, layers[i][0].length - 1)]);
                s.anchor.set(0.5, 1);
                s.position.set(0, FEET_Y);
                sprite.charSprites.push(s);
                sprite.root.addChildAt(s, 1 + i);
            });
        });
    }

    setLook(id: number, cfg: AvatarConfig | null): void {
        const sprite = this.players.get(id);
        if (sprite) {
            this.loadLook(id, sprite, cfg);
        }
    }

    // жёлтый прыгающий маркер над игроком (locate)
    pingPlayer(id: number): void {
        const sprite = this.players.get(id);
        if (!sprite) {
            return;
        }
        const marker = new Text({ text: '📍', style: { fontSize: 24 } });
        marker.anchor.set(0.5, 1);
        marker.position.set(0, -52);
        sprite.root.addChild(marker);
        this.pings.push({ node: marker, age: 0 });
    }

    // тряска сцены при buzz
    shake(): void {
        this.shakeTime = 500;
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

    setStatus(id: number, status: PlayerStatus): void {
        const sprite = this.players.get(id);
        if (!sprite || sprite.status === status) {
            return;
        }
        sprite.status = status;
        this.drawStatusDot(sprite);
    }

    showReaction(id: number, emoji: string): void {
        const sprite = this.players.get(id);
        if (!sprite) {
            return;
        }
        const node = new Text({ text: emoji, style: { fontSize: 22 } });
        node.anchor.set(0.5, 1);
        node.position.set(0, -44);
        sprite.root.addChild(node);
        sprite.floaters.push({ node, age: 0 });
    }

    private drawStatusDot(sprite: PlayerSprite): void {
        sprite.statusDot
            .clear()
            .circle(-sprite.labelHalfWidth - 7, FEET_Y + 9, 3.5)
            .fill(STATUS_COLORS[sprite.status])
            .stroke({ width: 1, color: 0x37323f, alpha: 0.6 });
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
        sprite.bubble.position.set(0, -52);
        sprite.bubble.visible = true;

        if (sprite.bubbleTimer) {
            clearTimeout(sprite.bubbleTimer);
        }
        sprite.bubbleTimer = setTimeout(() => {
            sprite.bubble.visible = false;
        }, 4500);
    }

    private tick(deltaMS: number): void {
        this.sceneTime += deltaMS;

        // тряска сцены при buzz
        if (this.shakeTime > 0) {
            this.shakeTime = Math.max(0, this.shakeTime - deltaMS);
            const power = (this.shakeTime / 500) * 5;
            this.app.stage.position.set(Math.sin(this.sceneTime / 12) * power, Math.cos(this.sceneTime / 9) * power);
        } else if (this.app.stage.position.x !== 0) {
            this.app.stage.position.set(0, 0);
        }

        // прыгающие маркеры locate
        if (this.pings.length > 0) {
            this.pings = this.pings.filter((ping) => {
                ping.age += deltaMS;
                if (ping.age >= 3500) {
                    ping.node.destroy();
                    return false;
                }
                ping.node.position.y = -52 - Math.abs(Math.sin(ping.age / 180)) * 10;
                return true;
            });
        }

        // пульс порталов и покачивание иконок объектов
        const pulse = 0.55 + 0.35 * Math.sin(this.sceneTime / 350);
        for (const pad of this.portalPads) {
            pad.alpha = pulse;
        }
        const bob = Math.sin(this.sceneTime / 400) * 3;
        for (const node of this.objectNodes.values()) {
            node.icon.position.y = node.baseY + bob;
        }

        const step = (MOVE_SPEED * deltaMS) / 1000;
        for (const [id, sprite] of this.players) {
            const dx = sprite.target.x - sprite.root.x;
            const dy = sprite.target.y - sprite.root.y;
            const dist = Math.hypot(dx, dy);
            const walking = dist > 0.5;
            if (walking) {
                const k = Math.min(1, step / dist);
                sprite.root.x += dx * k;
                sprite.root.y += dy * k;
                sprite.walkTime += deltaMS;
            } else {
                sprite.root.position.set(sprite.target.x, sprite.target.y);
                sprite.walkTime = 0;
            }
            sprite.root.zIndex = sprite.root.y;

            // кадр 0 — стоя; 1–8 — цикл шага, ~90мс на кадр
            const frame = walking ? 1 + (Math.floor(sprite.walkTime / 90) % (WALK_COLS - 1)) : 0;
            if (frame !== sprite.frame) {
                sprite.frame = frame;
                this.applyFrame(sprite);
            }

            if (sprite.floaters.length > 0) {
                sprite.floaters = sprite.floaters.filter((f) => {
                    f.age += deltaMS;
                    if (f.age >= REACTION_TTL_MS) {
                        f.node.destroy();
                        return false;
                    }
                    const progress = f.age / REACTION_TTL_MS;
                    f.node.position.y = -44 - progress * 26;
                    f.node.alpha = progress < 0.6 ? 1 : 1 - (progress - 0.6) / 0.4;
                    return true;
                });
            }

            if (id === this.selfId) {
                this.proximityRing.position.set(sprite.root.x, sprite.root.y);
            }
        }
    }

    private faceDirection(sprite: PlayerSprite, dir: Direction): void {
        if (sprite.dir === dir) {
            return;
        }
        sprite.dir = dir;
        this.applyFrame(sprite);
    }

    private applyFrame(sprite: PlayerSprite): void {
        if (!sprite.avatar) {
            return;
        }
        const row = DIR_ROW[sprite.dir];
        sprite.charSprites.forEach((s, i) => {
            const frames = sprite.avatar![i][row];
            s.texture = frames[Math.min(sprite.frame, frames.length - 1)];
        });
    }

    private drawMap(): void {
        const g = new Graphics();

        for (let y = 0; y < this.map.height; y++) {
            for (let x = 0; x < this.map.width; x++) {
                const ch = this.map.rows[y][x];
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
                    case '*':
                        // spotlight-сцена: тёплый круг света
                        g.rect(px, py, TILE, TILE).fill(COLORS.spotlightFloor);
                        g.circle(px + TILE / 2, py + TILE / 2, TILE / 2 - 2).fill({ color: COLORS.spotlight, alpha: 0.5 });
                        g.circle(px + TILE / 2, py + TILE / 2, TILE / 4).fill({ color: COLORS.spotlight, alpha: 0.7 });
                        break;
                }
            }
        }

        this.app.stage.addChild(g);
    }

    setObjectHighlight(id: string | null): void {
        if (this.highlightedObject === id) {
            return;
        }
        this.highlightedObject = id;
        for (const [objectId, node] of this.objectNodes) {
            const active = objectId === id;
            node.ring.visible = active;
            node.icon.scale.set(active ? 1.25 : 1);
        }
    }

    private drawPortals(): void {
        for (const portal of this.map.portals) {
            const pad = new Graphics();
            const cx = portal.x * TILE + TILE / 2;
            const cy = portal.y * TILE + TILE / 2;
            pad.ellipse(cx, cy, 13, 9).fill({ color: 0x7c6fae, alpha: 0.55 }).stroke({ width: 2, color: 0xb9aef0, alpha: 0.9 });
            pad.ellipse(cx, cy, 7, 4).fill({ color: 0xe8e2ff, alpha: 0.8 });
            this.app.stage.addChild(pad);
            this.portalPads.push(pad);
        }
    }

    private drawObjects(): void {
        for (const obj of this.map.objects) {
            const cx = obj.x * TILE + TILE / 2;
            const baseY = obj.y * TILE - 4;

            const ring = new Graphics();
            ring.ellipse(cx, obj.y * TILE + TILE / 2, 15, 10).stroke({ width: 2, color: 0xffc914, alpha: 0.9 });
            ring.visible = false;
            this.app.stage.addChild(ring);

            const icon = new Text({ text: OBJECT_EMOJI[obj.type] ?? OBJECT_EMOJI.link, style: { fontSize: 15 } });
            icon.anchor.set(0.5, 1);
            icon.position.set(cx, baseY);
            this.app.stage.addChild(icon);

            this.objectNodes.set(obj.id, { icon, ring, baseY });
        }
    }

    private drawZoneLabels(): void {
        for (const zone of this.map.zones) {
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
