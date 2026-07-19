<?php

namespace App\Support;

use FilesystemIterator;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;

/**
 * Листы спрайтов, из которых можно нарезать предметы обстановки.
 *
 * Список нужен в двух местах: страница каталога показывает его в выпадашке, а
 * валидация по нему же проверяет присланный путь — иначе в `sheet` можно было
 * бы подсунуть произвольный путь к файлу.
 */
class SpriteSheets
{
    private const ROOT = 'assets/lpc';

    /**
     * Листы предметов: всё, кроме персонажей (те собираются гардеробом) и
     * служебных файлов вроде палитровых рамп.
     *
     * @return list<string> пути относительно public/assets/lpc
     */
    public static function all(): array
    {
        $root = public_path(self::ROOT);
        if (! is_dir($root)) {
            return [];
        }

        $sheets = [];
        $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS));

        foreach ($files as $file) {
            if ($file->getExtension() !== 'png') {
                continue;
            }
            $relative = str_replace('\\', '/', substr($file->getPathname(), strlen($root) + 1));
            if (str_starts_with($relative, 'characters/') || str_starts_with(basename($relative), '_')) {
                continue;
            }
            $sheets[] = $relative;
        }

        sort($sheets);

        return $sheets;
    }

    /**
     * Размер листа в пикселях — чтобы регион предмета не вылезал за картинку.
     *
     * @return array{width: int, height: int}|null
     */
    public static function size(string $sheet): ?array
    {
        $path = public_path(self::ROOT.'/'.$sheet);
        if (! is_file($path)) {
            return null;
        }
        $size = @getimagesize($path);

        return $size ? ['width' => $size[0], 'height' => $size[1]] : null;
    }
}
