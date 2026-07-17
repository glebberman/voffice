// ICE-серверы из env. На localhost/LAN host-кандидатов достаточно и список
// может быть пустым; STUN/TURN (coturn) нужны для работы через NAT.
export function iceServers(): RTCIceServer[] {
    const servers: RTCIceServer[] = [];

    const stun = import.meta.env.VITE_STUN_URL as string | undefined;
    if (stun) {
        servers.push({ urls: stun });
    }

    const turn = import.meta.env.VITE_TURN_URL as string | undefined;
    if (turn) {
        servers.push({
            urls: turn,
            username: (import.meta.env.VITE_TURN_USERNAME as string | undefined) ?? '',
            credential: (import.meta.env.VITE_TURN_CREDENTIAL as string | undefined) ?? '',
        });
    }

    return servers;
}
