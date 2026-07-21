import { EditorScene, type RectPreview } from '@/game/editor-scene';
import type { DoorData, MapObjectData, PortalData, PropData } from '@/game/map';
import type { PropCatalogue } from '@/game/props';
import { useEffect, useImperativeHandle, useRef, useState } from 'react';

export interface EditorCanvasHandle {
    zoomIn: () => void;
    zoomOut: () => void;
}

export interface Tile {
    x: number;
    y: number;
}

interface EditorCanvasProps {
    ref?: React.Ref<EditorCanvasHandle>;
    rows: string[];
    props: PropData[];
    doors: DoorData[];
    spawn: Tile;
    objects: MapObjectData[];
    portals: PortalData[];
    catalogue: PropCatalogue;
    rectPreview: RectPreview | null;
    panTool: boolean; // активен инструмент «рука»
    onTileDown: (tile: Tile) => void;
    onTileDrag: (tile: Tile) => void;
    onTileUp: () => void;
    onHover: (tile: Tile | null) => void;
}

function isTyping(target: EventTarget | null): boolean {
    return target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
}

/**
 * React-обёртка над EditorScene: держит жизненный цикл Pixi, синхронизирует
 * данные карты в сцену и переводит DOM-события в вызовы сцены и колбэки
 * инструментов. Вид (камера/зум) целиком внутри сцены.
 */
export function EditorCanvas({
    ref,
    rows,
    props,
    doors,
    spawn,
    objects,
    portals,
    catalogue,
    rectPreview,
    panTool,
    onTileDown,
    onTileDrag,
    onTileUp,
    onHover,
}: EditorCanvasProps) {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const sceneRef = useRef<EditorScene | null>(null);
    // режим текущего перетаскивания: рисуем инструментом или тащим камеру
    const drag = useRef<{ mode: 'tool' | 'pan'; lastX: number; lastY: number } | null>(null);
    const spaceRef = useRef(false);
    const hoveringRef = useRef(false); // курсор над полем — только тогда пробел = пан
    const [spacePan, setSpacePan] = useState(false);

    // начальные данные читаем из ref — эффект инициализации запускается один раз
    const initial = useRef({ rows, catalogue });
    // свежие колбэки без переподписки слушателей
    const cb = useRef({ onTileDown, onTileDrag, onTileUp, onHover });
    cb.current = { onTileDown, onTileDrag, onTileUp, onHover };
    const panToolRef = useRef(panTool);
    panToolRef.current = panTool;

    useEffect(() => {
        const host = hostRef.current;
        if (!host) {
            return;
        }
        const scene = new EditorScene(initial.current.rows, initial.current.catalogue);
        sceneRef.current = scene;
        void scene.init(host);
        const observer = new ResizeObserver(() => scene.resize());
        observer.observe(host);
        return () => {
            observer.disconnect();
            scene.destroy();
            sceneRef.current = null;
        };
    }, []);

    // синхронизация данных карты в сцену
    useEffect(() => sceneRef.current?.applyRows(rows), [rows]);
    useEffect(() => sceneRef.current?.setProps(props), [props]);
    useEffect(() => sceneRef.current?.setDoors(doors), [doors]);
    useEffect(() => sceneRef.current?.setMarkers(spawn, objects, portals), [spawn, objects, portals]);
    useEffect(() => sceneRef.current?.setRectPreview(rectPreview), [rectPreview]);

    // зум колесом — нативный слушатель: React onWheel пассивен, preventDefault не сработал бы
    useEffect(() => {
        const host = hostRef.current;
        if (!host) {
            return;
        }
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            sceneRef.current?.zoomAt(e.deltaY < 0 ? 1 : -1, e.clientX, e.clientY);
        };
        host.addEventListener('wheel', onWheel, { passive: false });
        return () => host.removeEventListener('wheel', onWheel);
    }, []);

    // пробел удерживает режим панорамирования — только пока курсор над полем,
    // иначе бы глотали пробел у кнопок и скролл страницы
    useEffect(() => {
        const clearSpace = () => {
            spaceRef.current = false;
            setSpacePan(false);
        };
        const down = (e: KeyboardEvent) => {
            if (e.code === 'Space' && hoveringRef.current && !isTyping(e.target)) {
                spaceRef.current = true;
                setSpacePan(true);
                e.preventDefault();
            }
        };
        const up = (e: KeyboardEvent) => {
            if (e.code === 'Space') {
                clearSpace();
            }
        };
        window.addEventListener('keydown', down);
        window.addEventListener('keyup', up);
        window.addEventListener('blur', clearSpace); // отпустили пробел вне окна (alt-tab) — не залипаем
        return () => {
            window.removeEventListener('keydown', down);
            window.removeEventListener('keyup', up);
            window.removeEventListener('blur', clearSpace);
        };
    }, []);

    useImperativeHandle(
        ref,
        () => ({
            zoomIn: () => sceneRef.current?.zoomButton(1),
            zoomOut: () => sceneRef.current?.zoomButton(-1),
        }),
        [],
    );

    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        const scene = sceneRef.current;
        if (!scene) {
            return;
        }
        try {
            e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
            // синтетические события могут не иметь указателя — рисованию не мешает
        }
        // средняя кнопка, пробел или инструмент «рука» — панорамирование
        if (e.button === 1 || spaceRef.current || panToolRef.current) {
            drag.current = { mode: 'pan', lastX: e.clientX, lastY: e.clientY };
            return;
        }
        const tile = scene.screenToTile(e.clientX, e.clientY);
        if (!tile) {
            return;
        }
        drag.current = { mode: 'tool', lastX: e.clientX, lastY: e.clientY };
        cb.current.onTileDown(tile);
    };

    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const scene = sceneRef.current;
        if (!scene) {
            return;
        }
        const d = drag.current;
        if (d?.mode === 'pan') {
            scene.panBy(e.clientX - d.lastX, e.clientY - d.lastY);
            d.lastX = e.clientX;
            d.lastY = e.clientY;
            return;
        }
        const tile = scene.screenToTile(e.clientX, e.clientY);
        scene.setHover(tile);
        cb.current.onHover(tile);
        if (tile && d?.mode === 'tool') {
            cb.current.onTileDrag(tile);
        }
    };

    const onPointerUp = () => {
        if (drag.current?.mode === 'tool') {
            cb.current.onTileUp();
        }
        drag.current = null;
    };

    const grab = spacePan || panTool;

    return (
        <div
            ref={hostRef}
            className={`border-sidebar-border/70 dark:border-sidebar-border relative h-[72vh] max-h-[820px] min-h-[420px] w-full overflow-hidden rounded-xl border ${
                grab ? 'cursor-grab' : 'cursor-crosshair'
            }`}
            style={{ touchAction: 'none' }}
            onPointerEnter={() => (hoveringRef.current = true)}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={() => {
                hoveringRef.current = false;
                sceneRef.current?.setHover(null);
                cb.current.onHover(null);
            }}
            onContextMenu={(e) => e.preventDefault()}
        />
    );
}
