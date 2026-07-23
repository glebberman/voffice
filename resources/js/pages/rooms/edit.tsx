import { CataloguePanel, type PropCategoryInfo } from '@/components/editor/CataloguePanel';
import { DoorsPanel } from '@/components/editor/DoorsPanel';
import { EditorCanvas } from '@/components/editor/EditorCanvas';
import { MapSettingsPanel } from '@/components/editor/MapSettingsPanel';
import { PortalsPanel } from '@/components/editor/PortalsPanel';
import { PropSettingsPanel } from '@/components/editor/PropSettingsPanel';
import { TilePanel } from '@/components/editor/TilePanel';
import { ToolBar } from '@/components/editor/ToolBar';
import { ZonesPanel } from '@/components/editor/ZonesPanel';
import { Button } from '@/components/ui/button';
import { type MapData } from '@/game/map';
import { type PropCatalogue } from '@/game/props';
import { TILE_LABEL } from '@/game/tile-colors';
import { useMapEditor } from '@/hooks/use-map-editor';
import AppLayout from '@/layouts/app-layout';
import { type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import { Save } from 'lucide-react';

interface RoomInfo {
    id: number;
    slug: string;
    name: string;
    map: MapData;
}

interface EditProps extends SharedData {
    room: RoomInfo;
    rooms: { slug: string; name: string }[];
    propTypes: PropCatalogue;
    propCategories: PropCategoryInfo[];
}

export default function RoomEdit() {
    const { room, rooms, propTypes, propCategories } = usePage<EditProps>().props;
    const ed = useMapEditor(room, propTypes);

    // индексный доступ под noUncheckedIndexedAccess даёт T | undefined — считаем
    // один раз и передаём готовые значения в JSX
    const hoverChar = ed.hover ? (ed.rows[ed.hover.y]?.[ed.hover.x] ?? '') : '';
    const selectedProp = ed.selectedProp !== null ? ed.props[ed.selectedProp] : undefined;

    return (
        <AppLayout
            breadcrumbs={[
                { title: 'Комнаты', href: '/rooms' },
                { title: room.name, href: `/rooms/${room.slug}` },
                { title: 'Редактор', href: `/rooms/${room.slug}/edit` },
            ]}
        >
            <Head title={`Редактор — ${room.name}`} />
            <div className="flex h-full flex-1 flex-col gap-4 p-4 lg:flex-row">
                {/* поле фиксированной высоты, закреплено — панели скроллятся рядом */}
                <div className="flex min-w-0 flex-1 flex-col gap-2 lg:sticky lg:top-4 lg:self-start">
                    <EditorCanvas
                        ref={ed.editorRef}
                        rows={ed.rows}
                        props={ed.props}
                        doors={ed.doors}
                        spawn={ed.spawn}
                        portals={ed.portals}
                        zones={ed.zones}
                        selectedZone={ed.selectedZone}
                        catalogue={propTypes}
                        rectPreview={ed.rectPreview}
                        propGhost={ed.propGhost}
                        propSelection={ed.propSelection}
                        interactionZone={ed.interactionZone}
                        unavailableMarks={ed.unavailableMarks}
                        panTool={ed.tool === 'pan'}
                        onTileDown={ed.onTileDown}
                        onTileDrag={ed.onTileDrag}
                        onTileUp={ed.onTileUp}
                        onHover={ed.setHover}
                    />
                    {/* строка статуса заменяет per-cell тултипы, которых нет у канваса */}
                    <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs">
                        <span>
                            Карта {ed.width}×{ed.height}
                        </span>
                        {ed.hover && hoverChar && (
                            <span>
                                ({ed.hover.x}, {ed.hover.y}) — {TILE_LABEL[hoverChar] ?? hoverChar}
                            </span>
                        )}
                        <span className="ml-auto">Колесо — зум · пробел, средняя кнопка или «рука» — сдвиг</span>
                    </div>
                </div>

                <div className="flex w-full flex-col gap-3 overflow-y-auto lg:w-96">
                    <ToolBar tool={ed.tool} onTool={ed.setTool} editorRef={ed.editorRef} />
                    {/* панель настроек всплывает наверху, когда выделен предмет (при установке или клике) */}
                    {ed.selectedProp !== null && selectedProp && (
                        <PropSettingsPanel
                            prop={selectedProp}
                            index={ed.selectedProp}
                            catalogue={propTypes}
                            width={ed.width}
                            height={ed.height}
                            onRotate={ed.rotateProp}
                            onPatch={ed.patchProp}
                            onRemove={ed.removeProp}
                            onDeselect={() => ed.setSelectedProp(null)}
                        />
                    )}
                    <TilePanel brush={ed.brush} tool={ed.tool} onBrush={ed.setBrush} onTool={ed.setTool} />
                    <MapSettingsPanel
                        name={ed.name}
                        onName={ed.setName}
                        sizeDraft={ed.sizeDraft}
                        onSize={ed.setSizeDraft}
                        onApplyResize={ed.applyResize}
                        resizeLoss={ed.resizeLoss}
                    />
                    <ZonesPanel
                        zones={ed.zones}
                        selected={ed.selectedZone}
                        zoneKind={ed.zoneKind}
                        tool={ed.tool}
                        width={ed.width}
                        height={ed.height}
                        onPickPreset={(kind) => {
                            ed.setZoneKind(kind);
                            ed.setTool('zone');
                        }}
                        onSelect={ed.setSelectedZone}
                        onChange={ed.setZones}
                    />
                    <DoorsPanel doors={ed.doors} width={ed.width} height={ed.height} onChange={ed.setDoors} />
                    <CataloguePanel
                        catalogue={propTypes}
                        categories={propCategories}
                        props={ed.props}
                        placingType={ed.placing?.type ?? null}
                        selected={ed.selectedProp}
                        onPick={ed.pickCatalog}
                        onSelect={ed.setSelectedProp}
                        onRemove={ed.removeProp}
                    />
                    <PortalsPanel
                        portals={ed.portals}
                        rooms={rooms}
                        spawn={ed.spawn}
                        fallbackSlug={room.slug}
                        width={ed.width}
                        height={ed.height}
                        onChange={ed.setPortals}
                    />

                    {ed.errors.length > 0 && (
                        <div className="text-destructive space-y-1 text-xs">
                            {ed.errors.map((e, i) => (
                                <p key={i}>{e}</p>
                            ))}
                        </div>
                    )}

                    <div className="flex gap-2">
                        <Button className="flex-1" onClick={ed.save} disabled={ed.saving}>
                            <Save className="size-4" />
                            {ed.saving ? 'Сохраняю…' : 'Сохранить'}
                        </Button>
                        <Button variant="outline" onClick={() => router.visit(`/rooms/${room.slug}`)}>
                            Отмена
                        </Button>
                    </div>

                    <p className="text-muted-foreground text-xs">
                        Карта сохраняется в базу. Чтобы правка пережила пересоздание базы, выгрузите её в репозиторий:{' '}
                        <code>php artisan voffice:export</code>
                    </p>
                </div>
            </div>
        </AppLayout>
    );
}
