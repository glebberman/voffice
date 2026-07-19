<?php

namespace App\Providers;

use Illuminate\Foundation\Console\ServeCommand;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->passReverbAddressToServeWorkers();
    }

    /**
     * Пробрасывает адрес Reverb в воркеры `artisan serve`.
     *
     * В docker-сети сервер публикует события в контейнер `reverb`, поэтому
     * compose.yaml задаёт контейнеру REVERB_HOST=reverb, а в .env остаётся
     * localhost — оттуда ходит браузер. Но `artisan serve` пропускает в свои
     * рабочие процессы только переменные из белого списка, всё остальное они
     * перечитывают из .env. В итоге веб-запрос пытался публиковать события на
     * localhost:8080 и падал, хотя CLI в том же контейнере работал.
     *
     * Проявлялось это не сразу: пока чат уходил через очередь, публиковал его
     * CLI-процесс queue-контейнера с полным окружением.
     */
    private function passReverbAddressToServeWorkers(): void
    {
        foreach (['REVERB_HOST', 'REVERB_PORT', 'REVERB_SCHEME'] as $variable) {
            if (! in_array($variable, ServeCommand::$passthroughVariables, true)) {
                ServeCommand::$passthroughVariables[] = $variable;
            }
        }
    }
}
