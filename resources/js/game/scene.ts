import { Application, Assets, Container, Graphics, GraphicsContext, Rectangle, Sprite, Text, Texture } from 'pixi.js';
import { DIR_ROW, loadAvatar, WALK_COLS, type AvatarConfig, type AvatarLayers } from './avatar';
import { approach, cameraOffset, CHUNK_TILES, chunkRangeContains, visibleChunkRange, type ChunkRange, type Point, type Size } from './camera';
import { CHAT_RADIUS, TILE, type GameMap, type MapObjectType } from './map';
import { propBaseRect, propSheetUrl, propSpec, propTallRect } from './props';
import type { Direction, PlayerState, PlayerStatus } from './types';

function sameRange(a: ChunkRange, b: ChunkRange): boolean {
    return a.x0 === b.x0 && a.y0 === b.y0 && a.x1 === b.x1 && a.y1 === b.y1;
}

function measureViewport(host: HTMLElement): Size {
    const rect = host.getBoundingClientRect();
    return {
        width: Math.round(rect.width) || DEFAULT_VIEWPORT.width,
        height: Math.round(rect.height) || DEFAULT_VIEWPORT.height,
    };
}

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

// овал прозрачности вокруг своего персонажа, когда он заходит за
// высокий предмет или за верхушку стены
const CUTOUT_RX = 34;
const CUTOUT_RY = 44;
const GHOST_ALPHA = 0.32;

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

// пока хост не измерен (первый кадр), рендерим в этот размер
const DEFAULT_VIEWPORT = { width: 800, height: 520 };

export class OfficeScene {
    private app = new Application();
    private players = new Map<number, PlayerSprite>();
    // Весь игровой мир лежит в отдельном контейнере: камера двигает именно его,
    // а не stage (stage остаётся системой координат экрана).
    private world = new Container();
    private mapLayer = new Container();
    private propBaseLayer = new Container(); // основания предметов — под игроками
    private playerLayer = new Container();
    // Всё, за что можно зайти: верхушки стен и высокие части предметов.
    // Рисуется ПОВЕРХ игроков, поэтому персонаж за ними скрывается.
    private overheadLayer = new Container();
    // Полупрозрачная копия overhead, видимая только внутри овала вокруг своего
    // персонажа: overheadLayer маскируется инверсно, ghost — прямо.
    private overheadGhost = new Container();
    private cutoutMask = new Graphics();
    private ghostMask = new Graphics();
    private proximityRing = new Graphics();
    private selfId: number | null = null;
    private destroyed = false;
    private sceneTime = 0;
    private portalPads: Graphics[] = [];
    private objectNodes = new Map<string, { icon: Text; ring: Graphics; baseY: number }>();
    private highlightedObject: string | null = null;
    private shakeTime = 0;
    private pings: { node: Text; age: number }[] = [];
    private viewport = { ...DEFAULT_VIEWPORT };
    private camera: Point = { x: 0, y: 0 };
    private chunks = new Map<string, { base: Graphics; crown: Graphics; ghost: Graphics }>();
    private chunkGrid: Size;
    private chunkRange: ChunkRange | null = null;

    constructor(private map: GameMap) {
        this.chunkGrid = {
            width: Math.ceil(map.width / CHUNK_TILES),
            height: Math.ceil(map.height / CHUNK_TILES),
        };
    }

    private get worldSize(): Size {
        return { width: this.map.width * TILE, height: this.map.height * TILE };
    }

    async init(host: HTMLElement): Promise<void> {
        // вьюпорт = размер контейнера на странице, а не размер карты:
        // иначе на большой карте канвас упёрся бы в предел WebGL (~16384 px)
        this.viewport = measureViewport(host);

        await this.app.init({
            width: this.viewport.width,
            height: this.viewport.height,
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
        this.app.canvas.style.display = 'block';

        this.proximityRing
            .circle(0, 0, CHAT_RADIUS * TILE)
            .fill({ color: 0xffffff, alpha: 0.05 })
            .stroke({ width: 1.5, color: 0xffffff, alpha: 0.18 });
        this.proximityRing.visible = false;
        this.playerLayer.sortableChildren = true; // кто ниже по карте — тот поверх

        // порядок слоёв: карта → зоны → порталы → кольцо → основания предметов
        // → игроки → высокие части (overhead) → объекты
        this.world.addChild(this.mapLayer);
        this.drawZoneLabels();
        this.drawPortals();
        this.world.addChild(this.proximityRing);
        this.world.addChild(this.propBaseLayer);
        this.world.addChild(this.playerLayer);
        this.world.addChild(this.overheadLayer);
        this.world.addChild(this.overheadGhost);
        this.drawObjects();
        this.app.stage.addChild(this.world);

        // овал-вырез: overhead виден везде, КРОМЕ овала, а ghost — только внутри
        this.overheadGhost.alpha = GHOST_ALPHA;
        this.world.addChild(this.cutoutMask, this.ghostMask);
        this.overheadLayer.setMask({ mask: this.cutoutMask, inverse: true });
        this.overheadGhost.mask = this.ghostMask;
        this.drawCutout(-9999, -9999);

        this.drawProps();

        this.updateChunks();
        this.centerCameraOnSelf(true);

        this.app.ticker.add((ticker) => this.tick(ticker.deltaMS));
    }

    /**
     * Предметы обстановки: основание уходит под игроков, высокая часть —
     * в overhead (и в его полупрозрачную копию), чтобы за ней можно было
     * проходить и персонаж просвечивал сквозь овал.
     */
    private drawProps(): void {
        for (const prop of this.map.props) {
            const spec = propSpec(prop.type);
            if (!spec) {
                continue;
            }

            const url = propSheetUrl(spec);
            Assets.load(url)
                .then((texture: Texture) => {
                    if (this.destroyed) {
                        return;
                    }
                    texture.source.scaleMode = 'nearest';

                    const base = propBaseRect(spec);
                    const baseSprite = new Sprite(new Texture({ source: texture.source, frame: new Rectangle(base.x, base.y, base.width, base.height) }));
                    baseSprite.position.set(prop.x * TILE, prop.y * TILE);
                    this.propBaseLayer.addChild(baseSprite);

                    const tall = propTallRect(spec);
                    if (!tall) {
                        return;
                    }
                    const tallTexture = new Texture({ source: texture.source, frame: new Rectangle(tall.x, tall.y, tall.width, tall.height) });
                    for (const layer of [this.overheadLayer, this.overheadGhost]) {
                        const sprite = new Sprite(tallTexture);
                        sprite.position.set(prop.x * TILE, (prop.y - spec.tall) * TILE);
                        layer.addChild(sprite);
                    }
                })
                .catch(() => {
                    // спрайтшита нет — предмет просто не отрисуется
                });
        }
    }

    /** Перерисовывает овал-вырез вокруг точки (мировые координаты). */
    private drawCutout(x: number, y: number): void {
        for (const mask of [this.cutoutMask, this.ghostMask]) {
            mask.clear().ellipse(x, y, CUTOUT_RX, CUTOUT_RY).fill(0xffffff);
        }
    }

    /** Состояние камеры — для отладки и e2e-проверок. */
    debugState(): { viewport: Size; world: Size; camera: Point; worldPos: Point; chunks: number; selfId: number | null } {
        return {
            viewport: { ...this.viewport },
            world: this.worldSize,
            camera: { ...this.camera },
            worldPos: { x: this.world.position.x, y: this.world.position.y },
            chunks: this.chunks.size,
            selfId: this.selfId,
        };
    }

    /** Принудительный кадр: в фоновой вкладке тикер Pixi засыпает. */
    forceTick(deltaMS = 16): void {
        if (!this.destroyed && this.app.renderer) {
            this.tick(deltaMS);
        }
    }

    /** Пересчёт под новый размер контейнера (ResizeObserver на странице). */
    resize(width: number, height: number): void {
        if (this.destroyed || !this.app.renderer || width <= 0 || height <= 0) {
            return;
        }
        this.viewport = { width: Math.round(width), height: Math.round(height) };
        this.app.renderer.resize(this.viewport.width, this.viewport.height);
        this.updateChunks();
    }

    destroy(): void {
        this.destroyed = true;
        for (const sprite of this.players.values()) {
            if (sprite.bubbleTimer) {
                clearTimeout(sprite.bubbleTimer);
            }
        }
        this.players.clear();
        this.chunks.clear(); // сами Graphics уничтожит app.destroy вместе с деревом
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
            // при входе в комнату камера сразу встаёт на персонажа, без «долёта»
            this.centerCameraOnSelf(true);
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
                // овал держится на середине роста персонажа, а не на ногах
                this.drawCutout(sprite.root.x, sprite.root.y - 14);
            }
        }

        this.updateCamera(deltaMS);
    }

    /** Камера следует за своим персонажем; тряска — слагаемое поверх неё. */
    private updateCamera(deltaMS: number): void {
        const self = this.selfId === null ? null : this.players.get(this.selfId);
        if (self) {
            const target = cameraOffset({ x: self.root.x, y: self.root.y }, this.viewport, this.worldSize);
            this.camera.x = approach(this.camera.x, target.x, deltaMS);
            this.camera.y = approach(this.camera.y, target.y, deltaMS);
        }

        let shakeX = 0;
        let shakeY = 0;
        if (this.shakeTime > 0) {
            this.shakeTime = Math.max(0, this.shakeTime - deltaMS);
            const power = (this.shakeTime / 500) * 5;
            shakeX = Math.sin(this.sceneTime / 12) * power;
            shakeY = Math.cos(this.sceneTime / 9) * power;
        }

        // округление до пикселя — иначе на дробном смещении видны швы между тайлами
        this.world.position.set(Math.round(this.camera.x + shakeX), Math.round(this.camera.y + shakeY));
        this.updateChunks();
    }

    /** Ставит камеру на своего персонажа; instant — без сглаживания (при входе). */
    private centerCameraOnSelf(instant = false): void {
        const self = this.selfId === null ? null : this.players.get(this.selfId);
        const center = self ? { x: self.root.x, y: self.root.y } : { x: this.worldSize.width / 2, y: this.worldSize.height / 2 };
        const target = cameraOffset(center, this.viewport, this.worldSize);
        if (instant) {
            this.camera = target;
            this.world.position.set(Math.round(target.x), Math.round(target.y));
            this.updateChunks();
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

    /**
     * Пересобирает набор нарисованных чанков под текущую камеру: недостающие
     * рисует, уехавшие далеко — уничтожает. Вызывается только при пересечении
     * границы чанка, а не каждый кадр.
     */
    private updateChunks(): void {
        const chunkPx = CHUNK_TILES * TILE;
        const range = visibleChunkRange(this.camera, this.viewport, chunkPx, this.chunkGrid);

        if (this.chunkRange && sameRange(this.chunkRange, range)) {
            return;
        }
        this.chunkRange = range;

        for (const [id, parts] of this.chunks) {
            const [cx, cy] = id.split(':').map(Number);
            if (!chunkRangeContains(range, cx, cy)) {
                parts.base.destroy();
                parts.crown.destroy();
                parts.ghost.destroy();
                this.chunks.delete(id);
            }
        }

        for (let cy = range.y0; cy <= range.y1; cy++) {
            for (let cx = range.x0; cx <= range.x1; cx++) {
                const id = `${cx}:${cy}`;
                if (!this.chunks.has(id)) {
                    const parts = this.drawChunk(cx, cy);
                    this.chunks.set(id, parts);
                    this.mapLayer.addChild(parts.base);
                    this.overheadLayer.addChild(parts.crown);
                    this.overheadGhost.addChild(parts.ghost);
                }
            }
        }
    }

    /**
     * Рисует один чанк карты (CHUNK_TILES × CHUNK_TILES тайлов).
     * Возвращает две части: низ (под игроками) и верхушки стен (над ними).
     * Верхушка и её полупрозрачная копия делят один GraphicsContext.
     */
    private drawChunk(cx: number, cy: number): { base: Graphics; crown: Graphics; ghost: Graphics } {
        const g = new Graphics();
        const crownContext = new GraphicsContext();
        const startX = cx * CHUNK_TILES;
        const startY = cy * CHUNK_TILES;
        const endX = Math.min(startX + CHUNK_TILES, this.map.width);
        const endY = Math.min(startY + CHUNK_TILES, this.map.height);

        for (let y = startY; y < endY; y++) {
            for (let x = startX; x < endX; x++) {
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

                // верхушка стены: рисуем её НАД клеткой со стеной, если сверху
                // не стена. Клетка остаётся проходимой — за стеной можно пройти
                if (this.map.isWallCrown(x, y - 1) && y > 0) {
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

        return { base: g, crown: new Graphics(crownContext), ghost: new Graphics(crownContext) };
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
            this.world.addChild(pad);
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
            this.world.addChild(ring);

            const icon = new Text({ text: OBJECT_EMOJI[obj.type] ?? OBJECT_EMOJI.link, style: { fontSize: 15 } });
            icon.anchor.set(0.5, 1);
            icon.position.set(cx, baseY);
            this.world.addChild(icon);

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
            this.world.addChild(label);
        }
    }
}
