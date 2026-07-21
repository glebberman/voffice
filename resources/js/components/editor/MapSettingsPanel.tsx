import { CollapsiblePanel } from '@/components/editor/CollapsiblePanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MAX_MAP_SIZE } from '@/game/map';

/** Название комнаты и размер карты. */
export function MapSettingsPanel({
    name,
    onName,
    sizeDraft,
    onSize,
    onApplyResize,
}: {
    name: string;
    onName: (v: string) => void;
    sizeDraft: { w: number; h: number };
    onSize: (s: { w: number; h: number }) => void;
    onApplyResize: () => void;
}) {
    return (
        <CollapsiblePanel title="Карта">
            <div className="space-y-3">
                <div>
                    <Label className="mb-1.5 block">Название комнаты</Label>
                    <Input value={name} onChange={(e) => onName(e.target.value)} maxLength={60} />
                </div>
                <div>
                    <Label className="mb-1.5 block">
                        Размер (до {MAX_MAP_SIZE}×{MAX_MAP_SIZE})
                    </Label>
                    <div className="flex items-center gap-2">
                        <Input
                            type="number"
                            min={3}
                            max={MAX_MAP_SIZE}
                            value={sizeDraft.w}
                            onChange={(e) => onSize({ ...sizeDraft, w: Number(e.target.value) || 3 })}
                            className="h-8"
                        />
                        <span className="text-muted-foreground">×</span>
                        <Input
                            type="number"
                            min={3}
                            max={MAX_MAP_SIZE}
                            value={sizeDraft.h}
                            onChange={(e) => onSize({ ...sizeDraft, h: Number(e.target.value) || 3 })}
                            className="h-8"
                        />
                        <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={onApplyResize}>
                            Применить
                        </Button>
                    </div>
                    <p className="text-muted-foreground mt-1.5 text-xs">Новое место заполняется полом, периметр остаётся стеной.</p>
                </div>
            </div>
        </CollapsiblePanel>
    );
}
