<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Ориентации предмета: один предмет может быть повёрнут разными сторонами,
 * если для этого есть спрайты. У каждой ориентации свой регион на листе и
 * своя геометрия — при повороте меняется и footprint (стол 4×1 становится 1×2).
 *
 * Регион и геометрия переезжают из плоских колонок prop_types сюда: прежний
 * каталог становится единственной ориентацией «south» (канон LPC — спрайты
 * смотрят на юг). В карте у предмета появляется опциональный `dir`; его
 * отсутствие означает south, поэтому старые карты остаются валидными.
 */
return new class extends Migration
{
    private const FLAT = ['sheet', 'sx', 'sy', 'w', 'h', 'tall'];

    public function up(): void
    {
        Schema::create('prop_orientations', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('prop_type_id')->constrained()->cascadeOnDelete();
            $table->string('dir', 8); // south | west | east | north
            $table->string('sheet', 200); // путь внутри public/assets/lpc
            $table->unsignedInteger('sx')->default(0); // регион спрайта на листе, px
            $table->unsignedInteger('sy')->default(0);
            $table->unsignedTinyInteger('w')->default(1); // основание в тайлах — блокирует проход
            $table->unsignedTinyInteger('h')->default(1);
            $table->unsignedTinyInteger('tall')->default(0); // тайлов «в воздухе» над основанием
            $table->timestamps();
            $table->unique(['prop_type_id', 'dir']);
        });

        foreach (DB::table('prop_types')->orderBy('id')->get() as $type) {
            DB::table('prop_orientations')->insert([
                'prop_type_id' => $type->id,
                'dir' => 'south',
                'sheet' => $type->sheet,
                'sx' => $type->sx,
                'sy' => $type->sy,
                'w' => $type->w,
                'h' => $type->h,
                'tall' => $type->tall,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        Schema::table('prop_types', function (Blueprint $table): void {
            $table->dropColumn(self::FLAT);
        });
    }

    public function down(): void
    {
        Schema::table('prop_types', function (Blueprint $table): void {
            $table->string('sheet', 200)->default('');
            $table->unsignedInteger('sx')->default(0);
            $table->unsignedInteger('sy')->default(0);
            $table->unsignedTinyInteger('w')->default(1);
            $table->unsignedTinyInteger('h')->default(1);
            $table->unsignedTinyInteger('tall')->default(0);
        });

        // обратно в плоские колонки уходит south (или первая, если south нет)
        foreach (DB::table('prop_types')->orderBy('id')->get() as $type) {
            $orientation = DB::table('prop_orientations')
                ->where('prop_type_id', $type->id)
                ->orderByRaw("dir = 'south' desc")
                ->orderBy('id')
                ->first();
            if ($orientation === null) {
                continue;
            }
            DB::table('prop_types')->where('id', $type->id)->update([
                'sheet' => $orientation->sheet,
                'sx' => $orientation->sx,
                'sy' => $orientation->sy,
                'w' => $orientation->w,
                'h' => $orientation->h,
                'tall' => $orientation->tall,
            ]);
        }

        Schema::dropIfExists('prop_orientations');
    }
};
