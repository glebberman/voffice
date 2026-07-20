<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Категории каталога предметов — две оси группировки, как в Sims: «назначение»
 * (рабочее место, техника, …) и «тип помещения» (переговорка, кухня, …).
 * Предмет может состоять в нескольких категориях каждой оси, каталог в
 * редакторе карт переключается между осями.
 *
 * Категории редактируемые (CRUD на странице /props), поэтому таблица, а не
 * список в коде. Слоги оси «тип помещения» сознательно совпадут со слогами
 * kind у зон — каталог сможет подсказывать предметы под область.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('prop_categories', function (Blueprint $table): void {
            $table->id();
            $table->string('axis', 16); // purpose | room
            $table->string('slug', 64);
            $table->string('label', 80);
            $table->unsignedInteger('sort')->default(0);
            $table->timestamps();
            $table->unique(['axis', 'slug']);
        });

        Schema::create('prop_category_prop_type', function (Blueprint $table): void {
            $table->foreignId('prop_type_id')->constrained()->cascadeOnDelete();
            $table->foreignId('prop_category_id')->constrained()->cascadeOnDelete();
            $table->unique(['prop_type_id', 'prop_category_id']);
        });

        Schema::table('prop_types', function (Blueprint $table): void {
            $table->text('description')->default(''); // карточка каталога
        });
    }

    public function down(): void
    {
        Schema::table('prop_types', function (Blueprint $table): void {
            $table->dropColumn('description');
        });
        Schema::dropIfExists('prop_category_prop_type');
        Schema::dropIfExists('prop_categories');
    }
};
