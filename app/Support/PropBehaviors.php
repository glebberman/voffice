<?php

namespace App\Support;

use Illuminate\Support\Str;

/**
 * Реестр поведений предмета — в коде, не в БД: у типа хранится только имя
 * поведения (`prop_types.behavior`), а что оно значит и какие настройки инстанса
 * принимает, знает этот класс. Клиентская калька — game/behaviors.ts.
 *
 * Настройки инстанса живут в карте у предмета (`props[].settings`), потому что у
 * каждого поставленного предмета они свои: у одной доски свой URL, у другой свой.
 * Проверяет их MapUpdateRequest, вызывая settingsErrors().
 */
class PropBehaviors
{
    /** Известные поведения: embed — встраиваемый URL, switchable — переключение состояний. */
    public const ALL = ['embed', 'switchable'];

    /**
     * Ошибки настроек инстанса для поведения (настройки уже присутствуют в
     * карте — отсутствие проверяет вызывающий). Пустой список — всё в порядке.
     * embed требует {label, url}; остальным поведениям настройки в карте не
     * нужны, поэтому любые — ошибка.
     *
     * @return list<string>
     */
    public static function settingsErrors(?string $behavior, mixed $settings): array
    {
        return match ($behavior) {
            'embed' => self::embedErrors($settings),
            default => ['Этому предмету настройки не нужны'],
        };
    }

    /**
     * @return list<string>
     */
    private static function embedErrors(mixed $settings): array
    {
        if (! is_array($settings)) {
            return ['Настройки встраиваемого предмета — объект с подписью и адресом'];
        }

        $label = $settings['label'] ?? null;
        $url = $settings['url'] ?? null;
        $labelText = is_string($label) ? trim($label) : '';
        $urlText = is_string($url) ? trim($url) : '';

        // Пустой адрес = предмет ещё не настроен. Это допустимо (он просто
        // неинтерактивен) — иначе форма в редакторе блокировала бы сохранение
        // всей карты, пока админ дозаполняет поля.
        if ($urlText === '') {
            return mb_strlen($labelText) > 80 ? ['Подпись встраиваемого предмета — до 80 символов'] : [];
        }

        $errors = [];
        if ($labelText === '' || mb_strlen($labelText) > 80) {
            $errors[] = 'Подпись встраиваемого предмета — непустая строка до 80 символов';
        }
        // Адрес уезжает в iframe, поэтому только http(s): filter_var пропускает
        // javascript:/file:/foo:, а рядом (map.objects.*.url) правило `url`
        // такое режет — проверки не должны расходиться.
        if (! Str::isUrl($urlText, ['http', 'https']) || mb_strlen($urlText) > 500) {
            $errors[] = 'Адрес встраиваемого предмета — http(s)-ссылка до 500 символов';
        }

        return $errors;
    }
}
