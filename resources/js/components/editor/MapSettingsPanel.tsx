import { CollapsiblePanel } from '@/components/editor/CollapsiblePanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MAX_MAP_SIZE } from '@/game/map';
import { useEffect, useState } from 'react';

export interface ResizeLoss {
    props: number;
    doors: number;
    portals: number;
    zones: number;
}

const LOSS_LABEL: [keyof ResizeLoss, string][] = [
    ['props', 'предметов'],
    ['doors', 'дверей'],
    ['portals', 'порталов'],
    ['zones', 'зон'],
];

/** Название комнаты и размер карты. */
export function MapSettingsPanel({
    name,
    onName,
    sizeDraft,
    onSize,
    onApplyResize,
    resizeLoss,
}: {
    name: string;
    onName: (v: string) => void;
    sizeDraft: { w: number; h: number };
    onSize: (s: { w: number; h: number }) => void;
    onApplyResize: () => void;
    resizeLoss: ResizeLoss;
}) {
    // Ужатие удаляет то, что оказалось за краем, и возврат прежнего размера
    // это не воскрешает — поэтому первый клик показывает счёт потерь, а
    // применяет только второй.
    const losses = LOSS_LABEL.filter(([key]) => resizeLoss[key] > 0);
    const [armed, setArmed] = useState(false);

    useEffect(() => setArmed(false), [sizeDraft.w, sizeDraft.h]);

    const apply = () => {
        if (losses.length > 0 && !armed) {
            setArmed(true);
            return;
        }
        setArmed(false);
        onApplyResize();
    };

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
                        <Button
                            size="sm"
                            variant={armed ? 'destructive' : 'outline'}
                            className="h-8 shrink-0"
                            onClick={apply}
                            title={armed ? 'Ещё раз — и перечисленное будет удалено' : undefined}
                        >
                            {armed ? 'Всё равно применить' : 'Применить'}
                        </Button>
                    </div>
                    {losses.length > 0 && (
                        <p className={`mt-1.5 text-xs ${armed ? 'text-destructive' : 'text-amber-600 dark:text-amber-400'}`}>
                            За новыми границами останется: {losses.map(([key, label]) => `${resizeLoss[key]} ${label}`).join(', ')}. Применение удалит
                            их без возврата.
                        </p>
                    )}
                    <p className="text-muted-foreground mt-1.5 text-xs">Новое место заполняется полом, периметр остаётся стеной.</p>
                </div>
            </div>
        </CollapsiblePanel>
    );
}
