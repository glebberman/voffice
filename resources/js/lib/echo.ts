import { echo } from '@laravel/echo-react';
import type EchoInstance from 'laravel-echo';

// Echo конфигурируется один раз в app.tsx через configureEcho()
export function getEcho(): EchoInstance<'reverb'> {
    return echo<'reverb'>();
}
