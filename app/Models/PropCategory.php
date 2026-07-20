<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * Категория каталога предметов. Две оси группировки, как в Sims: предмет
 * может состоять в нескольких категориях каждой оси, и каталог в редакторе
 * карт переключается между осями.
 */
class PropCategory extends Model
{
    /** Оси группировки: назначение предмета и тип помещения, куда он просится. */
    public const AXES = ['purpose', 'room'];

    public const AXIS_LABEL = ['purpose' => 'Назначение', 'room' => 'Тип помещения'];

    protected $fillable = ['axis', 'slug', 'label', 'sort'];

    protected function casts(): array
    {
        return [
            'sort' => 'integer',
        ];
    }

    /**
     * @return BelongsToMany<PropType, $this>
     */
    public function propTypes(): BelongsToMany
    {
        return $this->belongsToMany(PropType::class);
    }
}
