function csrfToken(): string {
    return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? '';
}

export async function postJson<T>(url: string, data: Record<string, unknown>, headers: Record<string, string> = {}): Promise<T> {
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'X-CSRF-TOKEN': csrfToken(),
            ...headers,
        },
        body: JSON.stringify(data),
    });
    if (!response.ok) {
        throw new Error(`POST ${url}: ${response.status}`);
    }
    return response.json() as Promise<T>;
}

// для pagehide: sendBeacon не умеет заголовки, csrf уходит полем формы
export function beacon(url: string, data: Record<string, string | number>): void {
    const form = new FormData();
    form.set('_token', csrfToken());
    for (const [key, value] of Object.entries(data)) {
        form.set(key, String(value));
    }
    navigator.sendBeacon(url, form);
}
