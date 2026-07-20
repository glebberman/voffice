<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * «Стол поперёк» — это не отдельный предмет, а стол для встреч, повёрнутый
 * боком: оба нарезаны с одного листа Card Table.png. До появления ориентаций
 * ракурс приходилось заводить отдельным типом; теперь desk-vertical становится
 * стороной east у meeting-table, а предметы на картах получают dir.
 *
 * На пустой базе (свежая установка, тесты) миграция ничего не делает: каталог
 * сидируется из props.json, где слияние уже отражено.
 */
return new class extends Migration
{
    public function up(): void
    {
        $vertical = DB::table('prop_types')->where('slug', 'desk-vertical')->first();
        $table = DB::table('prop_types')->where('slug', 'meeting-table')->first();
        if ($vertical === null || $table === null) {
            return;
        }

        $region = DB::table('prop_orientations')->where('prop_type_id', $vertical->id)->orderBy('id')->first();
        if ($region !== null) {
            DB::table('prop_orientations')->updateOrInsert(
                ['prop_type_id' => $table->id, 'dir' => 'east'],
                [
                    'sheet' => $region->sheet,
                    'sx' => $region->sx,
                    'sy' => $region->sy,
                    'w' => $region->w,
                    'h' => $region->h,
                    'tall' => $region->tall,
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
            );
        }

        $this->rewriteMaps(function (array $prop): array {
            if (($prop['type'] ?? null) === 'desk-vertical') {
                $prop['type'] = 'meeting-table';
                $prop['dir'] = 'east';
            }

            return $prop;
        });

        DB::table('prop_orientations')->where('prop_type_id', $vertical->id)->delete();
        DB::table('prop_types')->where('id', $vertical->id)->delete();
    }

    public function down(): void
    {
        $table = DB::table('prop_types')->where('slug', 'meeting-table')->first();
        if ($table === null) {
            return;
        }
        $east = DB::table('prop_orientations')->where('prop_type_id', $table->id)->where('dir', 'east')->first();
        if ($east === null) {
            return;
        }

        $verticalId = DB::table('prop_types')->insertGetId([
            'slug' => 'desk-vertical',
            'label' => 'Стол поперёк',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('prop_orientations')->insert([
            'prop_type_id' => $verticalId,
            'dir' => 'south',
            'sheet' => $east->sheet,
            'sx' => $east->sx,
            'sy' => $east->sy,
            'w' => $east->w,
            'h' => $east->h,
            'tall' => $east->tall,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->rewriteMaps(function (array $prop): array {
            if (($prop['type'] ?? null) === 'meeting-table' && ($prop['dir'] ?? null) === 'east') {
                $prop['type'] = 'desk-vertical';
                unset($prop['dir']);
            }

            return $prop;
        });

        DB::table('prop_orientations')->where('id', $east->id)->delete();
    }

    /**
     * Прогоняет каждый предмет каждой карты через $rewrite и сохраняет только
     * реально изменившиеся комнаты.
     *
     * @param  callable(array<string, mixed>): array<string, mixed>  $rewrite
     */
    private function rewriteMaps(callable $rewrite): void
    {
        foreach (DB::table('rooms')->orderBy('id')->get() as $room) {
            if (! is_string($room->map)) {
                continue;
            }
            $map = json_decode($room->map, true);
            if (! is_array($map) || ! is_array($map['props'] ?? null)) {
                continue;
            }

            $props = [];
            foreach ($map['props'] as $prop) {
                if (! is_array($prop)) {
                    $props[] = $prop;

                    continue;
                }
                $fields = [];
                foreach ($prop as $field => $value) {
                    $fields[(string) $field] = $value;
                }
                $props[] = $rewrite($fields);
            }

            if ($props !== $map['props']) {
                $map['props'] = $props;
                DB::table('rooms')->where('id', $room->id)->update([
                    'map' => json_encode($map, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                ]);
            }
        }
    }
};
