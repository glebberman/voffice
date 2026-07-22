import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Настройки embed-предмета: подпись модалки и адрес iframe. Пишет в
 * `props[].settings` карты; форму на сервере проверяет PropBehaviors. Пустой
 * адрес = предмет неинтерактивен, подсказки/модалки в игре не будет.
 */
export function EmbedForm({
    settings,
    onChange,
}: {
    settings: Record<string, string> | undefined;
    onChange: (settings: Record<string, string>) => void;
}) {
    const label = settings?.label ?? '';
    const url = settings?.url ?? '';

    return (
        <div className="border-sidebar-border/70 dark:border-sidebar-border mt-2 space-y-1.5 rounded-md border p-2">
            <p className="text-xs font-medium">Встраиваемое окно</p>
            <div>
                <Label className="text-[11px]">Подпись</Label>
                <Input
                    className="mt-0.5 h-7 text-xs"
                    value={label}
                    placeholder="Доска команды"
                    onChange={(e) => onChange({ label: e.target.value, url })}
                />
            </div>
            <div>
                <Label className="text-[11px]">Адрес (URL)</Label>
                <Input
                    className="mt-0.5 h-7 text-xs"
                    value={url}
                    placeholder="https://…"
                    onChange={(e) => onChange({ label, url: e.target.value })}
                />
            </div>
        </div>
    );
}
