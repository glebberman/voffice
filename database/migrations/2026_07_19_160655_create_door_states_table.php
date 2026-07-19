<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Открыта дверь или заперта — это состояние игры, а не карты, поэтому оно
 * живёт отдельно от rooms.map: карту правит администратор в редакторе, а
 * двери дёргают игроки, и мешать эти записи в одном JSON значило бы, что
 * сохранение карты затрёт чужие двери.
 *
 * Строка появляется при первом изменении: дверь без строки открыта и не
 * заперта.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('door_states', function (Blueprint $table) {
            $table->id();
            $table->foreignId('room_id')->constrained()->cascadeOnDelete();
            $table->string('door_key', 64); // id двери из карты
            $table->boolean('closed')->default(false);
            $table->boolean('locked')->default(false);
            $table->timestamps();

            $table->unique(['room_id', 'door_key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('door_states');
    }
};
