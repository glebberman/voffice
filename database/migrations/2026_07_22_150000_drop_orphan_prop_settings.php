<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Настройки инстанса (`props[].settings`) нужны только поведению `embed`. Когда
 * у типа поведение сменили (телевизор стал `switchable`), в уже засиженных базах
 * настройки осели в `rooms.map` осиротевшими: сохранить такую карту из редактора
 * больше нельзя — MapUpdateRequest их отвергает, — а убрать из UI нечем, формы
 * для не-embed не рисуется. Чистим их разом.
 *
 * Обратно не восстанавливаем: это мусор, а не данные.
 */
return new class extends Migration
{
    public function up(): void
    {
        $embedSlugs = DB::table('prop_types')->where('behavior', 'embed')->pluck('slug')->all();

        foreach (DB::table('rooms')->get(['id', 'map']) as $room) {
            $raw = $room->map;
            $map = is_string($raw) ? json_decode($raw, true) : null;
            if (! is_array($map) || ! is_array($map['props'] ?? null)) {
                continue;
            }

            $changed = false;
            $props = [];
            foreach ($map['props'] as $prop) {
                if (is_array($prop) && array_key_exists('settings', $prop) && ! in_array($prop['type'] ?? null, $embedSlugs, true)) {
                    unset($prop['settings']);
                    $changed = true;
                }
                $props[] = $prop;
            }

            if ($changed) {
                $map['props'] = $props;
                DB::table('rooms')->where('id', $room->id)->update([
                    'map' => json_encode($map, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                ]);
            }
        }
    }

    public function down(): void
    {
        // осиротевшие настройки восстанавливать незачем
    }
};
