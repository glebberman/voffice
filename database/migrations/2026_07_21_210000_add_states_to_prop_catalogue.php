<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Состояния предмета: телевизор включён / выключен / без сигнала. Состояние
 * меняет только регион спрайта, геометрия остаётся геометрией ориентации,
 * поэтому регионы живут json-колонкой на ориентации, а не отдельной таблицей.
 *
 * default_state — что рисуется, пока предметом никто не пользуется; null
 * означает «состояний нет, рисуем базовый регион ориентации». Рантайм-состояние
 * поставленного предмета приедет отдельной таблицей (prop_states, VOF-31).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('prop_orientations', function (Blueprint $table): void {
            // {"on": {"sheet": "...", "sx": 96, "sy": 0}, ...} — размер региона
            // всегда w×(h+tall) своей ориентации
            $table->json('states')->default('{}');
        });
        Schema::table('prop_types', function (Blueprint $table): void {
            $table->string('default_state', 64)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('prop_orientations', function (Blueprint $table): void {
            $table->dropColumn('states');
        });
        Schema::table('prop_types', function (Blueprint $table): void {
            $table->dropColumn('default_state');
        });
    }
};
