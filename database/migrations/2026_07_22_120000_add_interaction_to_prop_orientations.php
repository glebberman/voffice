<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Зона взаимодействия предмета: клетки, стоя на которых персонаж сможет им
 * пользоваться. Зона своя на каждую ориентацию — повёрнутый телевизор
 * разворачивает и зону, — поэтому хранится json-колонкой на ориентации.
 *
 * Список смещений `{dx, dy}` относительно origin (левый верхний тайл
 * основания); отрицательные допустимы (клетка слева/сверху). Пустой список =
 * с предметом не взаимодействуют. Форму гарантирует PropTypeRequest, читает
 * interactionCells(). Само взаимодействие в игре приедет с поведениями (VOF-30).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('prop_orientations', function (Blueprint $table): void {
            // [{"dx": 0, "dy": 1}, ...] — смещения клеток зоны от origin
            $table->json('interaction')->default('[]');
        });
    }

    public function down(): void
    {
        Schema::table('prop_orientations', function (Blueprint $table): void {
            $table->dropColumn('interaction');
        });
    }
};
