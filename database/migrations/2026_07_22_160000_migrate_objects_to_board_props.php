<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Функциональные объекты карты (`map.objects`) переезжают внутрь предметов:
 * доска, видео и карта — это один и тот же embed, отличаются только подписью и
 * адресом, поэтому им хватает типа «Доска» с настройками инстанса.
 *
 * Предмет встаёт ровно в клетку объекта, и это меняет две вещи:
 *
 * - клетка становится непроходимой — раньше маркер объекта проходу не мешал;
 * - подойти можно только с четырёх ортогональных сторон, а прежний радиус 1.6
 *   тайла доставал и по диагонали. Доска, у которой все четыре соседа заняты,
 *   станет недоступной — в редакторе она загорится перечёркнутым кружком.
 *
 * На пустой базе (свежая установка, тесты) миграция ничего не делает: каталог
 * сидируется из props.json, а карты из resources/maps/*.json, где переезд уже
 * отражён.
 */
return new class extends Migration
{
    /** Снимок записи каталога на момент миграции — props.json потом живёт своей жизнью. */
    private const BOARD = [
        'slug' => 'board',
        'label' => 'Доска',
        'description' => 'Доска на стене: открывает встроенное окно — доску, карту или видео. Сторона «вправо» — для вертикальной стены.',
        'behavior' => 'embed',
        'purposes' => ['media'],
        'roomKinds' => ['openspace', 'meeting', 'kitchen', 'lounge'],
        'orientations' => [
            'south' => ['sheet' => 'office/Office Portraits.png', 'sx' => 32, 'sy' => 0],
            'east' => ['sheet' => 'office/Office Portraits.png', 'sx' => 0, 'sy' => 0],
        ],
    ];

    public function up(): void
    {
        $this->ensureBoardType();

        foreach (DB::table('rooms')->orderBy('id')->get() as $room) {
            $map = $this->readMap($room->map);
            if ($map === null || ! is_array($map['objects'] ?? null)) {
                continue;
            }

            $props = is_array($map['props'] ?? null) ? array_values($map['props']) : [];
            $taken = [];
            foreach ($props as $prop) {
                if (is_array($prop) && is_string($prop['id'] ?? null)) {
                    $taken[$prop['id']] = true;
                }
            }

            foreach ($map['objects'] as $object) {
                if (! is_array($object)) {
                    continue;
                }
                $id = $this->freeId(is_string($object['id'] ?? null) ? $object['id'] : 'board', $taken);
                $url = is_string($object['url'] ?? null) ? $object['url'] : '';
                // Правило `url` у объектов пропускало любую схему, а embed берёт
                // только http(s). Адрес не трогаем — молча потерять его хуже, —
                // но пишем в лог: иначе карта просто перестанет сохраняться из
                // редактора, и админ не поймёт почему.
                if ($url !== '' && ! Str::isUrl($url, ['http', 'https'])) {
                    Log::warning("VOF-33: адрес объекта {$id} не http(s), предмет придётся поправить вручную", [
                        'room' => $room->id,
                        'url' => $url,
                    ]);
                }
                $props[] = [
                    'id' => $id,
                    'type' => self::BOARD['slug'],
                    'x' => is_int($object['x'] ?? null) ? $object['x'] : 0,
                    'y' => is_int($object['y'] ?? null) ? $object['y'] : 0,
                    'settings' => [
                        'label' => is_string($object['label'] ?? null) ? $object['label'] : '',
                        'url' => $url,
                    ],
                ];
            }

            unset($map['objects']);
            $map['props'] = $props;
            $this->saveMap($room->id, $map);
        }
    }

    public function down(): void
    {
        foreach (DB::table('rooms')->orderBy('id')->get() as $room) {
            $map = $this->readMap($room->map);
            if ($map === null) {
                continue;
            }

            $props = [];
            $objects = [];
            foreach (is_array($map['props'] ?? null) ? $map['props'] : [] as $prop) {
                if (! is_array($prop) || ($prop['type'] ?? null) !== self::BOARD['slug']) {
                    $props[] = $prop;

                    continue;
                }
                // Возвращаем объектом каждую доску, даже ненастроенную: тип
                // уходит из каталога следом, и оставленный предмет осиротеет —
                // он перестанет рисоваться и заблокирует сохранение карты.
                // Тип объекта (board/video/map/link) при переезде потерялся,
                // различал их только значок, поэтому всё возвращается доской.
                $settings = is_array($prop['settings'] ?? null) ? $prop['settings'] : [];
                $objects[] = [
                    'id' => $prop['id'] ?? 'board',
                    'type' => 'board',
                    'label' => $settings['label'] ?? '',
                    'url' => $settings['url'] ?? '',
                    'x' => $prop['x'] ?? 0,
                    'y' => $prop['y'] ?? 0,
                ];
            }

            $map['props'] = $props;
            $map['objects'] = $objects; // ключ был обязательным, поэтому вернуть надо даже пустым
            $this->saveMap($room->id, $map);
        }

        $board = DB::table('prop_types')->where('slug', self::BOARD['slug'])->first();
        if ($board !== null) {
            DB::table('prop_orientations')->where('prop_type_id', $board->id)->delete();
            DB::table('prop_category_prop_type')->where('prop_type_id', $board->id)->delete();
            DB::table('prop_types')->where('id', $board->id)->delete();
        }
    }

    /**
     * Заводит тип «Доска», если каталог его ещё не знает: базу могли и не
     * сидировать заново. Пустой каталог не трогаем вовсе — его наполнит сидер
     * из props.json, а вклиниваться туда первой записью миграции незачем.
     */
    private function ensureBoardType(): void
    {
        if (DB::table('prop_types')->count() === 0) {
            return;
        }

        $existing = DB::table('prop_types')->where('slug', self::BOARD['slug'])->first();
        if ($existing !== null) {
            return;
        }

        $typeId = DB::table('prop_types')->insertGetId([
            'slug' => self::BOARD['slug'],
            'label' => self::BOARD['label'],
            'description' => self::BOARD['description'],
            'behavior' => self::BOARD['behavior'],
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // зона взаимодействия — четыре соседние клетки: к доске подходят с любой стороны
        $interaction = json_encode([
            ['dx' => 0, 'dy' => -1],
            ['dx' => -1, 'dy' => 0],
            ['dx' => 1, 'dy' => 0],
            ['dx' => 0, 'dy' => 1],
        ]);

        foreach (self::BOARD['orientations'] as $dir => $region) {
            DB::table('prop_orientations')->insert([
                'prop_type_id' => $typeId,
                'dir' => $dir,
                'sheet' => $region['sheet'],
                'sx' => $region['sx'],
                'sy' => $region['sy'],
                'w' => 1,
                'h' => 1,
                'tall' => 0,
                'interaction' => $interaction,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        foreach ([['purpose', self::BOARD['purposes']], ['room', self::BOARD['roomKinds']]] as [$axis, $slugs]) {
            foreach ($slugs as $slug) {
                $category = DB::table('prop_categories')->where('axis', $axis)->where('slug', $slug)->first();
                if ($category !== null) {
                    DB::table('prop_category_prop_type')->insert([
                        'prop_type_id' => $typeId,
                        'prop_category_id' => $category->id,
                    ]);
                }
            }
        }
    }

    /**
     * @return array<string, mixed>|null
     */
    private function readMap(mixed $raw): ?array
    {
        if (! is_string($raw)) {
            return null;
        }
        $map = json_decode($raw, true);
        if (! is_array($map)) {
            return null;
        }

        $fields = [];
        foreach ($map as $key => $value) {
            $fields[(string) $key] = $value;
        }

        return $fields;
    }

    /**
     * @param  array<string, mixed>  $map
     */
    private function saveMap(mixed $roomId, array $map): void
    {
        DB::table('rooms')->where('id', $roomId)->update([
            'map' => json_encode($map, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ]);
    }

    /**
     * @param  array<string, true>  $taken
     */
    private function freeId(string $wanted, array &$taken): string
    {
        $id = $wanted;
        $n = 2;
        while (isset($taken[$id])) {
            $id = "{$wanted}-{$n}";
            $n++;
        }
        $taken[$id] = true;

        return $id;
    }
};
