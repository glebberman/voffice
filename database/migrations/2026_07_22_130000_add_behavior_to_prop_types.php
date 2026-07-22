<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Поведение предмета: как с ним взаимодействуют, стоя в его зоне. Первое —
 * `embed` (встраиваемый URL: доска/видео/карта внутри предмета), следующим
 * приедет `switchable` (переключение состояний). Реестр поведений — в коде
 * (App\Support\PropBehaviors, game/behaviors.ts), в БД лежит только имя.
 *
 * Настройки инстанса (для embed — {label, url}) хранятся в самой карте у
 * предмета (`props[].settings`), а не здесь: у каждого поставленного предмета
 * они свои. null — предмет неинтерактивный (обычная мебель).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('prop_types', function (Blueprint $table): void {
            $table->string('behavior', 32)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('prop_types', function (Blueprint $table): void {
            $table->dropColumn('behavior');
        });
    }
};
