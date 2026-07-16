<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Room extends Model
{
    protected $fillable = ['slug', 'name', 'map'];

    protected function casts(): array
    {
        return [
            'map' => 'array',
        ];
    }

    public function messages(): HasMany
    {
        return $this->hasMany(Message::class);
    }
}
