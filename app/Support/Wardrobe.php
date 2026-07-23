<?php

namespace App\Support;

use RuntimeException;

/**
 * Гардероб из resources/wardrobe.json — единый источник правды для клиента
 * (game/avatar.ts), валидации сохранения и теста, который проверяет наличие
 * спрайтов на диске.
 *
 * Файл правится руками, поэтому форму проверяем при чтении: опечатка должна
 * давать внятную ошибку, а не расходиться по коду неизвестными значениями.
 *
 * @phpstan-type BodyShape array{label: string, body: string, head: string, feet: string, tie: string|false, tops: array<string, string>, legs: array<string, string>}
 * @phpstan-type WardrobeShape array{eyes: string, hairs: list<string>, layeredHairs: list<string>, bodies: array<string, BodyShape>}
 */
class Wardrobe
{
    /** @var WardrobeShape|null */
    private static ?array $cache = null;

    /**
     * @return WardrobeShape
     */
    public static function all(): array
    {
        return self::$cache ??= self::parse(JsonFile::read(resource_path('wardrobe.json')));
    }

    /**
     * @param  array<string, mixed>  $raw
     * @return WardrobeShape
     */
    private static function parse(array $raw): array
    {
        $bodies = [];
        foreach (self::dict($raw, 'bodies') as $slug => $body) {
            if (! is_array($body)) {
                throw new RuntimeException("wardrobe.json: тело {$slug} — не объект");
            }
            $tie = $body['tie'] ?? false;
            $bodies[(string) $slug] = [
                'label' => self::str($body, 'label', (string) $slug),
                'body' => self::str($body, 'body', (string) $slug),
                'head' => self::str($body, 'head', (string) $slug),
                'feet' => self::str($body, 'feet', (string) $slug),
                'tie' => is_string($tie) ? $tie : false,
                'tops' => self::paths($body, 'tops', (string) $slug),
                'legs' => self::paths($body, 'legs', (string) $slug),
            ];
        }

        $hairs = [];
        foreach (self::dict($raw, 'hairs') as $hair) {
            if (! is_string($hair)) {
                throw new RuntimeException('wardrobe.json: причёска — не строка');
            }
            $hairs[] = $hair;
        }

        // причёски, у которых walk разбит на задний (bg) и передний (fg) слой
        $layered = [];
        foreach (is_array($raw['layeredHairs'] ?? null) ? $raw['layeredHairs'] : [] as $hair) {
            if (is_string($hair)) {
                $layered[] = $hair;
            }
        }

        return ['eyes' => self::str($raw, 'eyes', 'корень'), 'hairs' => $hairs, 'layeredHairs' => $layered, 'bodies' => $bodies];
    }

    /**
     * @param  array<mixed, mixed>  $source
     * @return array<mixed, mixed>
     */
    private static function dict(array $source, string $key): array
    {
        $value = $source[$key] ?? null;
        if (! is_array($value)) {
            throw new RuntimeException("wardrobe.json: нет раздела {$key}");
        }

        return $value;
    }

    /**
     * @param  array<mixed, mixed>  $source
     */
    private static function str(array $source, string $key, string $where): string
    {
        $value = $source[$key] ?? null;
        if (! is_string($value)) {
            throw new RuntimeException("wardrobe.json: {$where}.{$key} — не строка");
        }

        return $value;
    }

    /**
     * Вещи одного раздела: ключ → путь к спрайту. Подпись (`label`) нужна
     * только клиенту, сюда её не тащим.
     *
     * @param  array<mixed, mixed>  $body
     * @return array<string, string>
     */
    private static function paths(array $body, string $key, string $where): array
    {
        $items = [];
        foreach (self::dict($body, $key) as $slug => $item) {
            if (! is_array($item)) {
                throw new RuntimeException("wardrobe.json: {$where}.{$key}.{$slug} — не объект");
            }
            $items[(string) $slug] = self::str($item, 'path', "{$where}.{$key}.{$slug}");
        }

        return $items;
    }
}
