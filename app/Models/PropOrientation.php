<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Ориентация предмета: регион спрайта на листе и геометрия «основание /
 * висит в воздухе» для одной из сторон. У повёрнутого предмета меняется не
 * только картинка, но и footprint, поэтому w/h/tall живут здесь, а не на типе.
 */
class PropOrientation extends Model
{
    /** Канонический порядок сторон; south — дефолт (LPC-спрайты смотрят на юг). */
    public const DIRS = ['south', 'west', 'east', 'north'];

    protected $fillable = ['prop_type_id', 'dir', 'sheet', 'sx', 'sy', 'w', 'h', 'tall'];

    protected function casts(): array
    {
        return [
            'sx' => 'integer',
            'sy' => 'integer',
            'w' => 'integer',
            'h' => 'integer',
            'tall' => 'integer',
        ];
    }

    /**
     * @return BelongsTo<PropType, $this>
     */
    public function propType(): BelongsTo
    {
        return $this->belongsTo(PropType::class);
    }
}
