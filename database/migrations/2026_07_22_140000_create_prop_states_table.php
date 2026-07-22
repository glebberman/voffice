<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Состояние поставленного предмета (телевизор включён / выключен / без сигнала)
 * — это состояние игры, а не карты, поэтому живёт отдельно от rooms.map, как и
 * door_states: карту правит администратор в редакторе, а предметы переключают
 * игроки, и мешать записи в одном JSON значило бы, что сохранение карты
 * затирает чужие переключения.
 *
 * Строка появляется при первом переключении: предмет без строки показывается в
 * `prop_types.default_state`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('prop_states', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('room_id')->constrained()->cascadeOnDelete();
            $table->string('prop_key', 64); // id предмета из карты
            $table->string('state', 64);    // имя состояния из каталога
            $table->timestamps();

            $table->unique(['room_id', 'prop_key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('prop_states');
    }
};
