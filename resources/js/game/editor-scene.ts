import type { ZoneCell } from '@/editor/availability';
import { clampOffset, EDITOR_ZOOM_DEFAULT, EDITOR_ZOOMS, screenToTile, zoomToCursor } from '@/editor/viewport';
import { zonePreset } from '@/editor/zone-presets';
import { Application, Container, Graphics, Sprite, Text } from 'pixi.js';
import { CHUNK_TILES, chunkRangeContains, visibleChunkRange, type ChunkRange, type Point, type Size } from './camera';
import { TILE, type DoorData, type PortalData, type PropData, type Zone } from './map';
import type { PropCatalogue } from './props';
import { loadPropTextures, resolvePropView } from './render/prop-sprites';
import { drawChunk } from './render/tiles';

const BACKGROUND = 0x37323f;
const DEFAULT_VIEWPORT: Size = { width: 800, height: 520 };

export interface RectPreview {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
}

/** Полупрозрачный предмет под курсором при расстановке/переносе: зелёный — влезает, красный — нет. */
export interface PropGhostView {
    x: number;
    y: number;
    w: number;
    h: number;
    tall: number;
    valid: boolean;
}

/** Габарит выделенного предмета (основание) для рамки-подсветки. */
export interface PropSelectionView {
    x: number;
    y: number;
    w: number;
    h: number;
}

function sameRange(a: ChunkRange, b: ChunkRange): boolean {
    return a.x0 === b.x0 && a.y0 === b.y0 && a.x1 === b.x1 && a.y1 === b.y1;
}

/**
 * Pixi-поле редактора карт: та же процедурная отрисовка тайлов и те же спрайты
 * предметов, что в игре (через game/render/*), но без игроков, тумана и
 * cutout-масок. Зум — масштаб контейнера мира ступенями, панорама свободная.
 *
 * Класс чисто императивный: DOM-события навешивает React-обёртка (EditorCanvas)
 * и дёргает методы. Данные приходят сеттерами, вид (камера/зум) живёт внутри.
 */
export class EditorScene {
    private app = new Application();
    private host: HTMLElement | null = null;

    // мир двигается и масштабируется целиком; слои снизу вверх
    private world = new Container();
    private mapLayer = new Container(); // основания чанков: пол, стены, символьная мебель
    // верхушки стен — отдельным слоем ПОВЕРХ всех оснований: корона рисуется на
    // строке выше своей стены и принадлежит нижнему чанку, поэтому в общем слое
    // база соседнего чанка перекрывала бы её после пересборки чанков
    private crownLayer = new Container();
    private propBaseLayer = new Container(); // основания предметов
    private overheadLayer = new Container(); // высокие части предметов
    private propOutline = new Graphics(); // рамки оснований (видны сразу, до загрузки спрайтов)
    private doorLayer = new Container();
    private markerLayer = new Container(); // спавн, порталы, объекты
    private zoneLayer = new Container(); // оверлей областей поверх всего, кроме курсора
    private interactionZoneG = new Graphics(); // зона взаимодействия: зелёные/красные клетки
    private selectG = new Graphics(); // рамка выделенного предмета
    private ghostG = new Graphics(); // предмет-призрак при расстановке/переносе
    private unavailableG = new Graphics(); // значки «недоступен» у отрезанных предметов
    private hoverG = new Graphics();
    private rectG = new Graphics();

    private zones: Zone[] = [];
    private selectedZone: number | null = null;
    private propGhost: PropGhostView | null = null;
    private propSelection: PropSelectionView | null = null;
    private interactionZone: ZoneCell[] | null = null;
    private unavailableMarks: { x: number; y: number }[] = [];

    private rows: string[];
    private width: number;
    private height: number;
    private readonly catalogue: PropCatalogue;

    private zoomIndex = EDITOR_ZOOM_DEFAULT;
    private camera: Point = { x: 0, y: 0 };
    private viewport: Size = { ...DEFAULT_VIEWPORT };
    private chunkGrid: Size;
    private chunks = new Map<string, { base: Graphics; crown: Graphics }>();
    private range: ChunkRange | null = null;
    private hoverTile: Point | null = null;
    private rect: RectPreview | null = null;
    private propGen = 0;

    private destroyed = false;
    private ready = false;

    constructor(rows: string[], catalogue: PropCatalogue) {
        this.rows = rows;
        this.width = rows[0]?.length ?? 0;
        this.height = rows.length;
        this.catalogue = catalogue;
        this.chunkGrid = this.gridFor(this.width, this.height);
    }

    private get scale(): number {
        return EDITOR_ZOOMS[this.zoomIndex];
    }

    async init(host: HTMLElement): Promise<void> {
        this.host = host;
        this.viewport = this.measure();

        await this.app.init({
            width: this.viewport.width,
            height: this.viewport.height,
            background: BACKGROUND,
            antialias: false, // пиксель-арт: чёткие края, а ступени зума дают целые TILE·scale
            resolution: Math.min(window.devicePixelRatio || 1, 2),
            autoDensity: true,
        });

        if (this.destroyed) {
            this.app.destroy(true, { children: true });
            return;
        }

        // канвас — абсолютный слой поверх хоста: блочный канвас своей высотой
        // раздул бы flex-хост, а тот мы же и измеряем (петля обратной связи)
        host.appendChild(this.app.canvas);
        this.app.canvas.style.position = 'absolute';
        this.app.canvas.style.inset = '0';
        this.app.canvas.style.display = 'block';

        this.world.addChild(
            this.mapLayer,
            this.crownLayer,
            this.propBaseLayer,
            this.overheadLayer,
            this.propOutline,
            this.doorLayer,
            this.markerLayer,
            this.zoneLayer,
            this.interactionZoneG,
            this.selectG,
            this.ghostG,
            this.unavailableG,
            this.hoverG,
            this.rectG,
        );
        this.app.stage.addChild(this.world);

        this.clampCamera();
        this.applyView();
        this.updateChunks(true);
        this.ready = true;
    }

    destroy(): void {
        this.destroyed = true;
        if (this.ready) {
            this.app.destroy(true, { children: true });
        }
    }

    resize(): void {
        if (!this.ready) {
            return;
        }
        this.viewport = this.measure();
        this.app.renderer.resize(this.viewport.width, this.viewport.height);
        this.clampCamera();
        this.applyView();
        this.updateChunks(true);
    }

    // --- данные карты -----------------------------------------------------

    /**
     * Синхронизирует ряды: при том же размере перерисовывает только чанки с
     * изменившимися клетками (diff по строкам — правка одного тайла трогает
     * один-два чанка), при смене размера пересобирает всё.
     */
    applyRows(next: string[]): void {
        const prev = this.rows;
        const structural = next.length !== this.height || (next[0]?.length ?? 0) !== this.width;
        this.rows = next;

        if (structural) {
            this.width = next[0]?.length ?? 0;
            this.height = next.length;
            this.chunkGrid = this.gridFor(this.width, this.height);
            this.rebuildAllChunks();
            return;
        }

        const dirty = new Set<string>();
        for (let y = 0; y < next.length; y++) {
            if (prev[y] === next[y]) {
                continue; // строка не менялась (setTile переиспользует ссылку)
            }
            const a = prev[y];
            const b = next[y];
            for (let x = 0; x < b.length; x++) {
                if (a[x] === b[x]) {
                    continue;
                }
                // тайл (x,y) влияет на верхушку своей строки (её рисует чанк
                // строки y) и на верхушку строки ниже (её рисует чанк строки y+1)
                for (const yy of [y, y + 1]) {
                    if (yy < this.height) {
                        dirty.add(this.chunkId(Math.floor(x / CHUNK_TILES), Math.floor(yy / CHUNK_TILES)));
                    }
                }
            }
        }
        for (const id of dirty) {
            this.redrawChunk(id);
        }
    }

    setProps(props: PropData[]): void {
        // старое поколение асинхронных спрайтов отбрасываем: правки предмета в
        // панели идут пачкой, и доехавший позже промис не должен дорисовать лишнее
        const gen = ++this.propGen;
        for (const c of this.propBaseLayer.removeChildren()) {
            c.destroy({ texture: true });
        }
        for (const c of this.overheadLayer.removeChildren()) {
            c.destroy({ texture: true });
        }
        this.propOutline.clear();

        for (const prop of props) {
            const orientation = resolvePropView(this.catalogue, prop);
            if (!orientation) {
                continue;
            }
            // рамка основания видна сразу — не ждём загрузки листа
            this.propOutline
                .rect(prop.x * TILE, prop.y * TILE, orientation.w * TILE, orientation.h * TILE)
                .stroke({ width: 1, color: 0x2b2733, alpha: 0.45 });

            void loadPropTextures(orientation)
                .then(({ base, tall }) => {
                    if (this.destroyed || gen !== this.propGen) {
                        base.destroy();
                        tall?.destroy();
                        return;
                    }
                    const baseSprite = new Sprite(base);
                    baseSprite.position.set(prop.x * TILE, prop.y * TILE);
                    this.propBaseLayer.addChild(baseSprite);
                    if (tall) {
                        const tallSprite = new Sprite(tall);
                        tallSprite.position.set(prop.x * TILE, (prop.y - orientation.tall) * TILE);
                        this.overheadLayer.addChild(tallSprite);
                    }
                })
                .catch(() => {
                    // листа нет — предмет просто не отрисуется, рамка остаётся
                });
        }
    }

    setDoors(doors: DoorData[]): void {
        for (const c of this.doorLayer.removeChildren()) {
            c.destroy();
        }
        for (const door of doors) {
            const g = new Graphics();
            g.position.set(door.x * TILE, door.y * TILE);
            // рамка на всю клетку + точка со стороны замка — это разметка двери
            // в редакторе, а не её игровой вид (открыта/закрыта)
            g.roundRect(1, 1, TILE - 2, TILE - 2, 3).stroke({ width: 2, color: door.lock ? 0xb45309 : 0x6b6478 });
            if (door.lock) {
                const lx = door.lock === 'west' ? 4 : door.lock === 'east' ? TILE - 4 : TILE / 2;
                const ly = door.lock === 'north' ? 4 : door.lock === 'south' ? TILE - 4 : TILE / 2;
                g.circle(lx, ly, 3).fill(0xb45309);
            }
            this.doorLayer.addChild(g);
        }
    }

    setMarkers(spawn: Point, portals: PortalData[]): void {
        for (const c of this.markerLayer.removeChildren()) {
            c.destroy();
        }
        const spawnFrame = new Graphics();
        spawnFrame.rect(spawn.x * TILE + 1, spawn.y * TILE + 1, TILE - 2, TILE - 2).stroke({ width: 2, color: 0x22c55e });
        this.markerLayer.addChild(spawnFrame);
        this.markerLayer.addChild(this.emoji('⚑', spawn.x, spawn.y));
        for (const portal of portals) {
            this.markerLayer.addChild(this.emoji('🌀', portal.x, portal.y));
        }
    }

    setZones(zones: Zone[], selected: number | null): void {
        this.zones = zones;
        this.selectedZone = selected;
        this.drawZones();
    }

    setPropGhost(ghost: PropGhostView | null): void {
        this.propGhost = ghost;
        this.drawGhost();
    }

    setPropSelection(rect: PropSelectionView | null): void {
        this.propSelection = rect;
        this.drawSelection();
    }

    /** Зона взаимодействия активного предмета: куда можно встать — зелёным, куда нет — красным. */
    setInteractionZone(cells: ZoneCell[] | null): void {
        this.interactionZone = cells;
        this.drawInteractionZone();
    }

    /** Центры (в тайлах) предметов, к которым не подойти. */
    setUnavailableMarks(marks: { x: number; y: number }[]): void {
        this.unavailableMarks = marks;
        this.drawUnavailable();
    }

    setHover(tile: Point | null): void {
        this.hoverTile = tile;
        this.drawHover();
    }

    setRectPreview(rect: RectPreview | null): void {
        this.rect = rect;
        this.drawRect();
    }

    // --- вид (камера и зум) ------------------------------------------------

    /** Тайл под экранной точкой (client-координаты) или null за пределами карты. */
    screenToTile(clientX: number, clientY: number): Point | null {
        if (!this.host) {
            return null;
        }
        const rect = this.host.getBoundingClientRect();
        const tile = screenToTile(clientX - rect.left, clientY - rect.top, this.camera, this.scale);
        return tile.x >= 0 && tile.y >= 0 && tile.x < this.width && tile.y < this.height ? tile : null;
    }

    panBy(dx: number, dy: number): void {
        this.camera.x += dx;
        this.camera.y += dy;
        this.clampCamera();
        this.applyView();
        this.updateChunks();
    }

    /** Зум на ступень (dir +1/−1) с сохранением точки под курсором (client-координаты). */
    zoomAt(dir: number, clientX: number, clientY: number): void {
        const next = Math.min(EDITOR_ZOOMS.length - 1, Math.max(0, this.zoomIndex + dir));
        if (next === this.zoomIndex) {
            return;
        }
        const rect = this.host?.getBoundingClientRect();
        const cx = clientX - (rect?.left ?? 0);
        const cy = clientY - (rect?.top ?? 0);
        const oldScale = this.scale;
        this.zoomIndex = next;
        this.camera = zoomToCursor(this.camera, oldScale, this.scale, cx, cy);
        this.clampCamera();
        this.applyView();
        this.updateChunks(); // содержимое чанков от масштаба не зависит — только их набор
        this.drawZones();
        this.drawInteractionZone();
        this.drawSelection();
        this.drawGhost();
        this.drawUnavailable();
        this.drawHover();
        this.drawRect();
    }

    /** Зум кнопкой — к центру вьюпорта. */
    zoomButton(dir: number): void {
        const rect = this.host?.getBoundingClientRect();
        this.zoomAt(dir, (rect?.left ?? 0) + this.viewport.width / 2, (rect?.top ?? 0) + this.viewport.height / 2);
    }

    // --- внутреннее --------------------------------------------------------

    private gridFor(width: number, height: number): Size {
        return { width: Math.ceil(width / CHUNK_TILES), height: Math.ceil(height / CHUNK_TILES) };
    }

    private measure(): Size {
        if (!this.host) {
            return { ...DEFAULT_VIEWPORT };
        }
        const rect = this.host.getBoundingClientRect();
        return { width: Math.max(320, Math.round(rect.width)), height: Math.max(240, Math.round(rect.height)) };
    }

    private applyView(): void {
        this.world.scale.set(this.scale);
        // целые пиксели — чтобы пиксель-арт не размывался
        this.world.position.set(Math.round(this.camera.x), Math.round(this.camera.y));
    }

    private clampCamera(): void {
        this.camera.x = clampOffset(this.camera.x, this.viewport.width, this.width * TILE * this.scale);
        this.camera.y = clampOffset(this.camera.y, this.viewport.height, this.height * TILE * this.scale);
    }

    private chunkId(cx: number, cy: number): string {
        return `${cx}:${cy}`;
    }

    private updateChunks(force = false): void {
        if (this.destroyed) {
            return;
        }
        const chunkPx = CHUNK_TILES * TILE * this.scale;
        const range = visibleChunkRange(this.camera, this.viewport, chunkPx, this.chunkGrid);
        if (!force && this.range && sameRange(this.range, range)) {
            return;
        }
        this.range = range;

        for (const [id, parts] of this.chunks) {
            const [cx, cy] = id.split(':').map(Number);
            if (!chunkRangeContains(range, cx, cy)) {
                this.destroyChunk(parts);
                this.chunks.delete(id);
            }
        }
        for (let cy = range.y0; cy <= range.y1; cy++) {
            for (let cx = range.x0; cx <= range.x1; cx++) {
                const id = this.chunkId(cx, cy);
                if (!this.chunks.has(id)) {
                    this.chunks.set(id, this.buildChunk(cx, cy));
                }
            }
        }
    }

    private buildChunk(cx: number, cy: number): { base: Graphics; crown: Graphics } {
        // редактор показывает все верхушки стен (skipCrown = null): прятать
        // нечего — тут нет персонажа, за которого стена загораживала бы комнату
        const parts = drawChunk(this.tileSource(), cx, cy, null);
        parts.ghost.destroy(); // полупрозрачный двойник overhead нужен только игре
        this.mapLayer.addChild(parts.base);
        this.crownLayer.addChild(parts.crown);
        return { base: parts.base, crown: parts.crown };
    }

    /** Освобождает и собственный контекст базы, и общий контекст короны. */
    private destroyChunk(parts: { base: Graphics; crown: Graphics }): void {
        parts.base.destroy({ context: true });
        parts.crown.destroy({ context: true });
    }

    private redrawChunk(id: string): void {
        const old = this.chunks.get(id);
        if (!old) {
            return; // чанк сейчас за кадром — построится заново, когда вернётся
        }
        this.destroyChunk(old);
        this.chunks.delete(id);
        const [cx, cy] = id.split(':').map(Number);
        if (this.range && chunkRangeContains(this.range, cx, cy)) {
            this.chunks.set(id, this.buildChunk(cx, cy));
        }
    }

    private rebuildAllChunks(): void {
        for (const parts of this.chunks.values()) {
            this.destroyChunk(parts);
        }
        this.chunks.clear();
        this.range = null;
        this.clampCamera();
        this.applyView();
        this.updateChunks(true);
    }

    private tileSource(): { rows: string[]; width: number; height: number; isWallCrown: (x: number, y: number) => boolean } {
        return {
            rows: this.rows,
            width: this.width,
            height: this.height,
            isWallCrown: (x, y) => this.tileAt(x, y) !== '#' && this.tileAt(x, y + 1) === '#',
        };
    }

    private tileAt(x: number, y: number): string {
        return x < 0 || y < 0 || x >= this.width || y >= this.height ? '#' : this.rows[y][x];
    }

    private drawZones(): void {
        for (const c of this.zoneLayer.removeChildren()) {
            c.destroy();
        }
        this.zones.forEach((zone, i) => {
            const preset = zonePreset(zone.kind);
            // нормализуем углы: перевёрнутый прямоугольник рисуем как его габарит
            const x = Math.min(zone.x1, zone.x2) * TILE;
            const y = Math.min(zone.y1, zone.y2) * TILE;
            const w = (Math.abs(zone.x2 - zone.x1) + 1) * TILE;
            const h = (Math.abs(zone.y2 - zone.y1) + 1) * TILE;
            const selected = i === this.selectedZone;

            const g = new Graphics();
            g.rect(x, y, w, h)
                .fill({ color: preset.color, alpha: selected ? 0.28 : 0.16 })
                .stroke({ width: (selected ? 3 : 2) / this.scale, color: preset.color, alpha: 0.9 });
            this.zoneLayer.addChild(g);

            const label = new Text({
                text: `${zone.name}${zone.isPrivate ? ' 🔒' : ''}`,
                style: { fontFamily: 'Instrument Sans, sans-serif', fontSize: 11, fontWeight: '700', fill: preset.color },
            });
            label.position.set(x + 3, y + 2);
            this.zoneLayer.addChild(label);
        });
    }

    private drawGhost(): void {
        this.ghostG.clear();
        const g = this.propGhost;
        if (!g) {
            return;
        }
        const color = g.valid ? 0x22c55e : 0xef4444;
        // часть в воздухе прохода не блокирует — рисуем её бледнее основания
        if (g.tall > 0) {
            this.ghostG
                .rect(g.x * TILE, (g.y - g.tall) * TILE, g.w * TILE, g.tall * TILE)
                .fill({ color, alpha: 0.12 })
                .stroke({ width: 1.5 / this.scale, color, alpha: 0.7 });
        }
        this.ghostG
            .rect(g.x * TILE, g.y * TILE, g.w * TILE, g.h * TILE)
            .fill({ color, alpha: 0.3 })
            .stroke({ width: 2 / this.scale, color });
    }

    private drawInteractionZone(): void {
        this.interactionZoneG.clear();
        for (const cell of this.interactionZone ?? []) {
            // светло-зелёная — есть куда встать, красная — до клетки не дойти
            const color = cell.ok ? 0x86efac : 0xf87171;
            this.interactionZoneG
                .rect(cell.x * TILE, cell.y * TILE, TILE, TILE)
                .fill({ color, alpha: 0.42 })
                .stroke({ width: 1.5 / this.scale, color, alpha: 0.95 });
        }
    }

    /**
     * Перечёркнутый красный кружок над предметом, к которому не подойти.
     * Размер держим в экранных пикселях (делим на масштаб): это значок-предупреждение,
     * его должно быть видно на любом зуме.
     */
    private drawUnavailable(): void {
        this.unavailableG.clear();
        const r = 9 / this.scale;
        const d = r * 0.7; // конец диагонали внутри окружности
        for (const mark of this.unavailableMarks) {
            const cx = mark.x * TILE;
            const cy = mark.y * TILE;
            this.unavailableG
                .circle(cx, cy, r)
                .fill({ color: 0x7f1d1d, alpha: 0.55 })
                .stroke({ width: 2 / this.scale, color: 0xf87171 })
                .moveTo(cx - d, cy - d)
                .lineTo(cx + d, cy + d)
                .stroke({ width: 2 / this.scale, color: 0xf87171 });
        }
    }

    private drawSelection(): void {
        this.selectG.clear();
        const r = this.propSelection;
        if (!r) {
            return;
        }
        this.selectG.rect(r.x * TILE, r.y * TILE, r.w * TILE, r.h * TILE).stroke({ width: 2.5 / this.scale, color: 0x3b82f6 });
    }

    private drawHover(): void {
        this.hoverG.clear();
        if (this.hoverTile) {
            this.hoverG
                .rect(this.hoverTile.x * TILE, this.hoverTile.y * TILE, TILE, TILE)
                .stroke({ width: 2 / this.scale, color: 0xffffff, alpha: 0.6 }); // 2/scale → ~2 экранных px на любом зуме
        }
    }

    private drawRect(): void {
        this.rectG.clear();
        if (!this.rect) {
            return;
        }
        const left = Math.min(this.rect.x0, this.rect.x1);
        const top = Math.min(this.rect.y0, this.rect.y1);
        const w = Math.abs(this.rect.x1 - this.rect.x0) + 1;
        const h = Math.abs(this.rect.y1 - this.rect.y0) + 1;
        this.rectG
            .rect(left * TILE, top * TILE, w * TILE, h * TILE)
            .fill({ color: 0xffc914, alpha: 0.35 })
            .stroke({ width: 2 / this.scale, color: 0xffc914 });
    }

    private emoji(text: string, tx: number, ty: number): Text {
        const node = new Text({ text, style: { fontSize: 18 } });
        node.anchor.set(0.5);
        node.position.set(tx * TILE + TILE / 2, ty * TILE + TILE / 2);
        return node;
    }
}
