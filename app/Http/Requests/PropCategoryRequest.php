<?php

namespace App\Http\Requests;

use App\Models\PropCategory;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class PropCategoryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->is_admin;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $category = $this->route('prop_category');

        return [
            'axis' => ['required', 'string', Rule::in(PropCategory::AXES)],
            // slug уникален внутри своей оси: purpose/kitchen и room/kitchen —
            // разные категории, и это нормально
            'slug' => [
                'required', 'string', 'max:64', 'regex:/^[a-z0-9-]+$/',
                Rule::unique('prop_categories', 'slug')->where('axis', $this->string('axis')->toString())->ignore($category),
            ],
            'label' => ['required', 'string', 'max:80'],
            'sort' => ['sometimes', 'integer', 'min:0', 'max:999'],
        ];
    }

    public function messages(): array
    {
        return [
            'slug.regex' => 'Ключ — латиница в нижнем регистре, цифры и дефис',
            'slug.unique' => 'Такой ключ уже есть на этой оси',
        ];
    }

    /**
     * @return array{axis: string, slug: string, label: string, sort: int}
     */
    public function fields(): array
    {
        $axis = $this->string('axis')->toString();

        return [
            'axis' => $axis,
            'slug' => $this->string('slug')->toString(),
            'label' => $this->string('label')->toString(),
            'sort' => $this->sortValue($axis),
        ];
    }

    /**
     * Место в оси: явное из запроса, иначе прежнее у существующей категории и
     * «в конец» у новой. Инлайн-переименование шлёт только {axis, slug, label},
     * и без этой развилки правка ярлыка каждый раз швыряла бы категорию в конец
     * оси — тихая порча порядка.
     */
    private function sortValue(string $axis): int
    {
        $sort = $this->input('sort');
        if (is_int($sort)) {
            return $sort;
        }

        $category = $this->route('prop_category');
        if ($category instanceof PropCategory) {
            return $category->sort;
        }

        $max = PropCategory::query()->where('axis', $axis)->max('sort');

        return (is_numeric($max) ? (int) $max : 0) + 1;
    }
}
