/**
 * Точка расширения: настройки поведения выделенного предмета.
 *
 * Поведения (embed — доска/видео/ссылка; switchable — переключаемые состояния)
 * приедут на этапе C: у типа предмета появится поле `behavior`, у предмета на
 * карте — `settings` (JSON, свой на каждое поведение). Тогда здесь по behavior
 * будет выбираться форма из этой папки (EmbedForm и т.п.), а PropSettingsPanel
 * отрисует её в своём слоте. Контракт формы предполагается такой:
 *
 *   { spec: PropSpec; prop: PropData; onChange: (settings: Partial<PropData>) => void }
 *
 * Пока поведений нет — рисовать нечего.
 */
export function BehaviorSettings(): React.ReactNode {
    return null;
}
