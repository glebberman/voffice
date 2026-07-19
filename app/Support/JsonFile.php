<?php

namespace App\Support;

use RuntimeException;

/**
 * Чтение JSON из resources/. Файлы там — часть репозитория (карты, каталог,
 * гардероб), и если такой файл не читается или битый, это ошибка сборки, а не
 * ситуация, которую стоит молча обходить: без него сидер наполнит базу мусором.
 */
class JsonFile
{
    /**
     * @return array<string, mixed>
     */
    public static function read(string $path): array
    {
        $raw = file_get_contents($path);
        if ($raw === false) {
            throw new RuntimeException("Не удалось прочитать {$path}");
        }

        $data = json_decode($raw, true);
        if (! is_array($data)) {
            throw new RuntimeException("{$path} — не JSON-объект");
        }

        $out = [];
        foreach ($data as $key => $value) {
            $out[(string) $key] = $value;
        }

        return $out;
    }
}
