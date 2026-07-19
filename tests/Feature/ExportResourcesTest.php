<?php

namespace Tests\Feature;

use App\Models\PropType;
use App\Models\Room;
use App\Support\JsonFile;
use Database\Seeders\PropTypeSeeder;
use Database\Seeders\RoomSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\PendingCommand;
use Tests\TestCase;

class ExportResourcesTest extends TestCase
{
    use RefreshDatabase;

    /** Куда выгружаем в тестах: настоящие resources/ трогать нельзя. */
    private string $to;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PropTypeSeeder::class);
        $this->seed(RoomSeeder::class);

        $this->to = sys_get_temp_dir().'/voffice-export-'.bin2hex(random_bytes(4));
    }

    protected function tearDown(): void
    {
        if (is_dir($this->to)) {
            foreach (glob($this->to.'/maps/*.json') ?: [] as $file) {
                unlink($file);
            }
            @rmdir($this->to.'/maps');
            @unlink($this->to.'/props.json');
            @rmdir($this->to);
        }

        parent::tearDown();
    }

    /**
     * artisan() отдаёт PendingCommand|int, поэтому сужаем тип здесь, а не в
     * каждом тесте.
     *
     * @param  array<string, mixed>  $options
     */
    private function export(array $options = []): PendingCommand
    {
        $command = $this->artisan('voffice:export', ['--to' => $this->to] + $options);
        $this->assertInstanceOf(PendingCommand::class, $command);

        return $command;
    }

    public function test_exports_catalogue_and_every_room(): void
    {
        $this->export()->assertSuccessful();

        $this->assertFileExists($this->to.'/props.json');
        foreach (Room::query()->get() as $room) {
            $this->assertFileExists($this->to."/maps/{$room->slug}.json");
        }
    }

    public function test_type_created_in_the_browser_reaches_the_file(): void
    {
        // ровно тот случай, ради которого команда и заведена: предмет завели
        // через страницу каталога, в файл он не попал и исчез бы при db:seed
        PropType::create([
            'slug' => 'whiteboard',
            'label' => 'Маркерная доска',
            'sheet' => 'office/Desk, Ornate.png',
            'sx' => 0, 'sy' => 0, 'w' => 2, 'h' => 1, 'tall' => 1,
        ]);

        $this->export()->assertSuccessful();

        $items = $this->nested(JsonFile::read($this->to.'/props.json'), 'items');
        $this->assertArrayHasKey('whiteboard', $items);
        $this->assertSame(
            ['label' => 'Маркерная доска', 'sheet' => 'office/Desk, Ornate.png', 'sx' => 0, 'sy' => 0, 'w' => 2, 'h' => 1, 'tall' => 1],
            $items['whiteboard'],
        );
    }

    public function test_map_edited_in_the_browser_reaches_the_file(): void
    {
        $office = Room::where('slug', 'office')->firstOrFail();
        $map = $office->map;
        $map['doors'] = [['id' => 'new-door', 'x' => 13, 'y' => 5, 'lock' => null]];
        $office->update(['map' => $map]);

        $this->export()->assertSuccessful();

        $exported = JsonFile::read($this->to.'/maps/office.json');
        $this->assertSame([['id' => 'new-door', 'x' => 13, 'y' => 5, 'lock' => null]], $exported['doors']);
    }

    public function test_check_reports_drift_and_writes_nothing(): void
    {
        PropType::create([
            'slug' => 'plant-pot', 'label' => 'Кашпо', 'sheet' => 'office/Bins.png',
            'sx' => 0, 'sy' => 0, 'w' => 1, 'h' => 1, 'tall' => 0,
        ]);

        $this->export(['--check' => true])->assertFailed();

        $this->assertFileDoesNotExist($this->to.'/props.json');
    }

    public function test_check_passes_when_files_match_the_database(): void
    {
        $this->export()->assertSuccessful();

        $this->export(['--check' => true])->assertSuccessful();
    }

    public function test_keeps_format_notes_and_orders_map_keys(): void
    {
        $this->export()->assertSuccessful();

        // _comment и tileSize описывают формат, в базе их нет — берём из репозитория
        $catalogue = JsonFile::read($this->to.'/props.json');
        $this->assertNotSame('', $catalogue['_comment']);
        $this->assertSame(32, $catalogue['tileSize']);

        // порядок ключей фиксирован, иначе диф прыгал бы при каждой выгрузке
        $keys = array_keys(JsonFile::read($this->to.'/maps/office.json'));
        $this->assertSame(['rows', 'spawn', 'zones', 'objects', 'portals', 'props', 'doors'], $keys);
    }
}
