<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Каталог предметов обстановки. Раньше лежал только в resources/props.json —
 * теперь файл сидирует таблицу (как resources/maps/*.json для комнат), а
 * править каталог можно из браузера.
 *
 * В карте комнаты хранится лишь `type` и позиция: размеры приходят отсюда,
 * поэтому правка каталога меняет геометрию сразу на всех картах.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('prop_types', function (Blueprint $table): void {
            $table->id();
            $table->string('slug', 64)->unique(); // ключ, которым предмет назван в карте
            $table->string('label', 80);
            $table->string('sheet', 200); // путь внутри public/assets/lpc
            $table->unsignedInteger('sx')->default(0); // регион спрайта на листе, px
            $table->unsignedInteger('sy')->default(0);
            $table->unsignedTinyInteger('w')->default(1); // основание в тайлах — блокирует проход
            $table->unsignedTinyInteger('h')->default(1);
            $table->unsignedTinyInteger('tall')->default(0); // тайлов «в воздухе» над основанием
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('prop_types');
    }
};
