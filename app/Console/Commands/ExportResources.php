<?php

namespace App\Console\Commands;

use App\Models\PropCategory;
use App\Models\PropType;
use App\Models\Room;
use App\Support\JsonFile;
use Illuminate\Console\Command;

/**
 * Выгружает карты и каталог предметов из БД обратно в resources/.
 *
 * Правки из браузерных редакторов живут в базе, а файлы в репозитории —
 * стартовое наполнение сидеров. Без этой команды правка карты или каталога
 * не попадала в git и тихо исчезала при пересоздании базы.
 */
class ExportResources extends Command
{
    protected $signature = 'voffice:export
        {--check : только показать расхождения, ничего не записывая}
        {--to= : каталог назначения (по умолчанию resources/) — удобно выгрузить копию для сверки}';

    protected $description = 'Выгрузить карты и каталог предметов из БД в resources/';

    /** Порядок ключей карты: чтобы диф оставался читаемым, а не прыгал. */
    private const MAP_KEYS = ['rows', 'spawn', 'zones', 'objects', 'portals', 'props', 'doors'];

    public function handle(): int
    {
        $changed = [];

        foreach ($this->files() as $path => $data) {
            // Сравниваем данные, а не текст: файлы в репозитории отформатированы
            // Prettier, а PHP печатает JSON по-своему, и посимвольное сравнение
            // ругалось бы на каждый файл при полном совпадении содержимого.
            if (is_file($path) && JsonFile::read($path) === $data) {
                continue;
            }
            $changed[] = $path;

            if (! $this->option('check')) {
                $dir = dirname($path);
                if (! is_dir($dir)) {
                    mkdir($dir, 0o755, true);
                }
                file_put_contents($path, $this->encode($data));
            }
        }

        return $this->report($changed);
    }

    /**
     * Файлы, какими они должны быть по состоянию БД: путь → данные.
     *
     * @return array<string, array<string, mixed>>
     */
    private function files(): array
    {
        $root = $this->root();
        $files = ["{$root}/props.json" => $this->catalogue()];

        foreach (Room::query()->orderBy('id')->get() as $room) {
            $files["{$root}/maps/{$room->slug}.json"] = $this->orderMapKeys($room->map);
        }

        return $files;
    }

    private function root(): string
    {
        $to = $this->option('to');

        return is_string($to) && $to !== '' ? rtrim($to, '/') : rtrim(resource_path(), '/');
    }

    /**
     * Каталог: пояснение и размер тайла берём из существующего файла — они
     * описывают формат, а не данные, и в БД их нет.
     */
    /**
     * @return array<string, mixed>
     */
    private function catalogue(): array
    {
        // пояснение и размер тайла всегда берём из репозитория: они описывают
        // формат, а не данные, и при выгрузке в другой каталог теряться не должны
        $source = resource_path('props.json');
        $existing = is_file($source) ? JsonFile::read($source) : [];

        $categories = [];
        foreach (PropCategory::query()->orderBy('axis')->orderBy('sort')->orderBy('slug')->get() as $category) {
            $categories[$category->axis][$category->slug] = ['label' => $category->label, 'sort' => $category->sort];
        }

        $items = [];
        foreach (PropType::query()->with(['orientations', 'categories'])->orderBy('id')->get() as $type) {
            $orientations = [];
            foreach ($type->sortedOrientations() as $orientation) {
                $entry = [
                    'sheet' => $orientation->sheet,
                    'sx' => $orientation->sx,
                    'sy' => $orientation->sy,
                    'w' => $orientation->w,
                    'h' => $orientation->h,
                    'tall' => $orientation->tall,
                ];
                // пустые состояния не пишем: у большинства предметов их нет,
                // и файл не должен зарастать пустыми объектами
                $states = $orientation->stateRegions();
                if ($states !== []) {
                    $entry['states'] = $states;
                }
                // так же и с зоной взаимодействия: пустую не пишем
                $interaction = $orientation->interactionCells();
                if ($interaction !== []) {
                    $entry['interaction'] = $interaction;
                }
                $orientations[$orientation->dir] = $entry;
            }
            $item = ['label' => $type->label];
            if ($type->description !== '') {
                $item['description'] = $type->description;
            }
            if ($type->default_state !== null) {
                $item['defaultState'] = $type->default_state;
            }
            if ($type->behavior !== null) {
                $item['behavior'] = $type->behavior;
            }
            $purposes = $type->categorySlugs('purpose');
            if ($purposes !== []) {
                $item['purposes'] = $purposes;
            }
            $roomKinds = $type->categorySlugs('room');
            if ($roomKinds !== []) {
                $item['roomKinds'] = $roomKinds;
            }
            $item['orientations'] = $orientations;
            $items[$type->slug] = $item;
        }

        $out = [
            '_comment' => $existing['_comment'] ?? '',
            'tileSize' => $existing['tileSize'] ?? 32,
        ];
        if ($categories !== []) {
            $out['categories'] = $categories;
        }
        $out['items'] = $items;

        return $out;
    }

    /**
     * @param  array<string, mixed>  $map
     * @return array<string, mixed>
     */
    private function orderMapKeys(array $map): array
    {
        $ordered = [];
        foreach (self::MAP_KEYS as $key) {
            if (array_key_exists($key, $map)) {
                $ordered[$key] = $map[$key];
            }
        }

        // ключи, которых ещё нет в списке, теряться не должны
        return $ordered + $map;
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function encode(array $data): string
    {
        return json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)."\n";
    }

    /**
     * @param  list<string>  $changed
     */
    private function report(array $changed): int
    {
        if ($changed === []) {
            $this->info('Файлы уже совпадают с базой.');

            return self::SUCCESS;
        }

        foreach ($changed as $path) {
            $this->line('  '.str_replace(base_path().'/', '', $path));
        }

        if ($this->option('check')) {
            $this->warn(count($changed).' файл(ов) разошлись с базой. Выгрузить: php artisan voffice:export');

            return self::FAILURE;
        }

        $this->info(count($changed).' файл(ов) обновлено.');
        $this->line('Отформатируйте их как остальной репозиторий: npm run format');

        return self::SUCCESS;
    }
}
