<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    /**
     * Разбирает JSON, пришедший в ответе строкой (например channel_data в
     * ответе авторизации канала), и заодно проверяет, что это вообще объект.
     *
     * @return array<string, mixed>
     */
    protected function decodeJson(mixed $json): array
    {
        $this->assertIsString($json, 'ожидалась строка с JSON');
        $decoded = json_decode($json, true);
        $this->assertIsArray($decoded, 'ожидался JSON-объект');

        $out = [];
        foreach ($decoded as $key => $value) {
            $out[(string) $key] = $value;
        }

        return $out;
    }

    /**
     * Вложенный объект: обращения вида $data['user_info']['avatar'] иначе
     * работают с неизвестным значением.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    protected function nested(array $data, string $key): array
    {
        $value = $data[$key] ?? null;
        $this->assertIsArray($value, "ожидался объект в {$key}");

        $out = [];
        foreach ($value as $k => $v) {
            $out[(string) $k] = $v;
        }

        return $out;
    }
}
