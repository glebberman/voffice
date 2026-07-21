import { Input } from '@/components/ui/input';

/** Числовое поле координаты с зажимом в [0, max] — общее для панелей редактора. */
export function CoordInput({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (v: number) => void }) {
    return (
        <label className="flex items-center gap-1 text-xs">
            <span className="text-muted-foreground">{label}</span>
            <Input
                type="number"
                min={0}
                max={max}
                value={value}
                onChange={(e) => onChange(Math.max(0, Math.min(max, Number(e.target.value) || 0)))}
                className="h-7 w-14 px-1.5 text-xs"
            />
        </label>
    );
}
