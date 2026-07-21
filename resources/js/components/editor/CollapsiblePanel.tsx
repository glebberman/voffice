import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';

/**
 * Сворачивающаяся секция боковины редактора: заголовок-переключатель со
 * стрелкой и необязательным счётчиком, тело раскрывается по клику. Обёртка
 * над radix Collapsible в едином стиле карточек редактора.
 */
export function CollapsiblePanel({
    title,
    count,
    defaultOpen = true,
    children,
}: {
    title: string;
    count?: number;
    defaultOpen?: boolean;
    children: React.ReactNode;
}) {
    return (
        <Collapsible defaultOpen={defaultOpen} className="border-sidebar-border/70 dark:border-sidebar-border rounded-xl border">
            <CollapsibleTrigger className="group flex w-full items-center gap-2 p-4">
                <ChevronDown className="text-muted-foreground size-4 transition-transform group-data-[state=closed]:-rotate-90" />
                <h3 className="text-sm font-semibold">{title}</h3>
                {count !== undefined && <span className="text-muted-foreground ml-auto text-xs">{count} шт.</span>}
            </CollapsibleTrigger>
            <CollapsibleContent className="px-4 pb-4">{children}</CollapsibleContent>
        </Collapsible>
    );
}
