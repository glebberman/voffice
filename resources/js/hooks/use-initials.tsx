export function useInitials() {
    const getInitials = (fullName: string): string => {
        const names = fullName.trim().split(' ');
        const first = names[0] ?? '';
        const last = names[names.length - 1] ?? '';

        if (names.length === 0) return '';
        if (names.length === 1) return first.charAt(0).toUpperCase();

        return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
    };

    return getInitials;
}
