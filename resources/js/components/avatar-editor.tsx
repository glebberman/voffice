import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { layerUrl, lookFromConfig, WARDROBE, type AvatarConfig } from '@/game/avatar';
import { useMemo, useState } from 'react';

const HAIR_LABELS: Record<string, string> = {
    afro: 'Афро',
    bangs: 'Чёлка',
    bob: 'Каре',
    buzzcut: 'Ёжик',
    curly_short: 'Кудри',
    curtains: 'На пробор',
    long: 'Длинные',
    mop: 'Шапка волос',
    parted: 'Пробор сбоку',
    pixie: 'Пикси',
    plain: 'Простая',
    shorthawk: 'Ирокез',
    spiked: 'Торчком',
    swoop: 'Волна',
};

interface AvatarEditorProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    initial: AvatarConfig | null;
    onSave: (cfg: AvatarConfig) => Promise<unknown>;
}

function defaultConfig(initial: AvatarConfig | null): AvatarConfig {
    if (initial && lookFromConfig(initial)) {
        return initial;
    }
    const body = Object.keys(WARDROBE.bodies)[0];
    return {
        body,
        hair: WARDROBE.hairs[0],
        top: Object.keys(WARDROBE.bodies[body].tops)[0],
        legs: Object.keys(WARDROBE.bodies[body].legs)[0],
        tie: false,
    };
}

export function AvatarEditor({ open, onOpenChange, initial, onSave }: AvatarEditorProps) {
    const [cfg, setCfg] = useState<AvatarConfig>(() => defaultConfig(initial));
    const [saving, setSaving] = useState(false);

    const bodyConfig = WARDROBE.bodies[cfg.body];

    // при смене тела верх/низ переключаются на существующие ключи
    const setBody = (body: string) => {
        const next = WARDROBE.bodies[body];
        setCfg((prev) => ({
            body,
            hair: prev.hair,
            top: next.tops[prev.top] ? prev.top : Object.keys(next.tops)[0],
            legs: next.legs[prev.legs] ? prev.legs : Object.keys(next.legs)[0],
            tie: next.tie ? prev.tie : false,
        }));
    };

    const layers = useMemo(() => lookFromConfig(cfg) ?? [], [cfg]);

    const save = async () => {
        setSaving(true);
        try {
            await onSave(cfg);
            onOpenChange(false);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Настроить персонажа</DialogTitle>
                </DialogHeader>

                <div className="flex gap-5">
                    {/* превью: кадр «стоя, лицом вниз» = ряд 2 walk-листа */}
                    <div className="bg-muted relative h-36 w-28 shrink-0 overflow-hidden rounded-lg border">
                        <div className="absolute top-1/2 left-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 scale-[1.8]">
                            {layers.map((path) => (
                                <div
                                    key={path}
                                    className="absolute inset-0"
                                    style={{
                                        backgroundImage: `url(${layerUrl(path)})`,
                                        backgroundPosition: '0px -128px',
                                        imageRendering: 'pixelated',
                                    }}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="flex flex-1 flex-col gap-3">
                        <div className="grid gap-1.5">
                            <Label>Тело</Label>
                            <Select value={cfg.body} onValueChange={setBody}>
                                <SelectTrigger className="h-8">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.entries(WARDROBE.bodies).map(([key, b]) => (
                                        <SelectItem key={key} value={key}>
                                            {b.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid gap-1.5">
                            <Label>Причёска</Label>
                            <Select value={cfg.hair} onValueChange={(hair) => setCfg((p) => ({ ...p, hair }))}>
                                <SelectTrigger className="h-8">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {WARDROBE.hairs.map((h) => (
                                        <SelectItem key={h} value={h}>
                                            {HAIR_LABELS[h] ?? h}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid gap-1.5">
                            <Label>Верх</Label>
                            <Select value={cfg.top} onValueChange={(top) => setCfg((p) => ({ ...p, top }))}>
                                <SelectTrigger className="h-8">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.entries(bodyConfig.tops).map(([key, item]) => (
                                        <SelectItem key={key} value={key}>
                                            {item.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid gap-1.5">
                            <Label>Низ</Label>
                            <Select value={cfg.legs} onValueChange={(legs) => setCfg((p) => ({ ...p, legs }))}>
                                <SelectTrigger className="h-8">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.entries(bodyConfig.legs).map(([key, item]) => (
                                        <SelectItem key={key} value={key}>
                                            {item.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {bodyConfig.tie && (
                            <label className="flex items-center gap-2 text-sm">
                                <Checkbox checked={cfg.tie === true} onCheckedChange={(v) => setCfg((p) => ({ ...p, tie: v === true }))} />
                                Галстук
                            </label>
                        )}
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Отмена
                    </Button>
                    <Button onClick={save} disabled={saving || layers.length === 0}>
                        {saving ? 'Сохраняю…' : 'Сохранить'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
