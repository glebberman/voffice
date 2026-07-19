<?php

namespace App\Http\Requests;

use App\Support\SpriteSheets;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class PropTypeRequest extends FormRequest
{
    private const TILE = 32;

    public function authorize(): bool
    {
        return (bool) $this->user()?->is_admin;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $type = $this->route('prop_type');

        return [
            // slug — ключ, которым предмет назван в картах; менять его у
            // существующего типа нельзя, иначе карты потеряют свои предметы
            'slug' => [
                'required', 'string', 'max:64', 'regex:/^[a-z0-9-]+$/',
                Rule::unique('prop_types', 'slug')->ignore($type),
            ],
            'label' => ['required', 'string', 'max:80'],
            'sheet' => ['required', 'string', Rule::in(SpriteSheets::all())],
            'sx' => ['required', 'integer', 'min:0', 'multiple_of:'.self::TILE],
            'sy' => ['required', 'integer', 'min:0', 'multiple_of:'.self::TILE],
            'w' => ['required', 'integer', 'min:1', 'max:16'],
            'h' => ['required', 'integer', 'min:1', 'max:16'],
            'tall' => ['required', 'integer', 'min:0', 'max:8'],
        ];
    }

    public function messages(): array
    {
        return [
            'slug.regex' => 'Ключ — латиница в нижнем регистре, цифры и дефис',
            'slug.unique' => 'Такой ключ уже есть в каталоге',
        ];
    }

    // регион не должен вылезать за пределы листа спрайтов
    /**
     * @return list<callable>
     */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                $size = SpriteSheets::size($this->string('sheet')->toString());
                if (! $size) {
                    return;
                }

                $right = $this->integer('sx') + $this->integer('w') * self::TILE;
                $bottom = $this->integer('sy') + ($this->integer('h') + $this->integer('tall')) * self::TILE;

                if ($right > $size['width'] || $bottom > $size['height']) {
                    $validator->errors()->add('sheet', "Регион вылезает за лист ({$size['width']}×{$size['height']} px)");
                }
            },
        ];
    }
}
