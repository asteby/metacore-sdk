export interface TimezoneInfo {
    value: string;
    label: string;
    offset: string;
}

/**
 * Returns all supported IANA timezones with their current GMT offset
 */
export function getAllTimezones(): TimezoneInfo[] {
    // @ts-ignore - Intl.supportedValuesOf is relatively new but supported in modern browsers
    const timezones = typeof Intl !== 'undefined' && (Intl as any).supportedValuesOf ? (Intl as any).supportedValuesOf('timeZone') : [
        'UTC', 'America/Mexico_City', 'America/Bogota', 'America/Santiago', 'America/Argentina/Buenos_Aires',
        'America/New_York', 'America/Los_Angeles', 'Europe/Madrid', 'Europe/London', 'Europe/Paris',
        'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Dubai', 'Australia/Sydney'
    ];

    const now = new Date();

    return timezones.map((tz: string) => {
        try {
            const formatter = new Intl.DateTimeFormat('en-US', {
                timeZone: tz,
                timeZoneName: 'shortOffset'
            });
            const parts = formatter.formatToParts(now);
            const offset = parts.find(p => p.type === 'timeZoneName')?.value || '';

            // Format label as: (GMT-6) America/Mexico_City
            return {
                value: tz,
                label: `(${offset}) ${tz.replace(/_/g, ' ')}`,
                offset: offset
            };
        } catch (e) {
            return {
                value: tz,
                label: tz,
                offset: ''
            };
        }
    }).sort((a: TimezoneInfo, b: TimezoneInfo) => {
        // Sort by offset primarily, then by name
        const getOffsetValue = (off: string) => {
            if (!off || off === 'GMT') return 0;
            const match = off.match(/GMT([+-])(\d+)(?::(\d+))?/);
            if (!match) return 0;
            const sign = match[1] === '+' ? 1 : -1;
            const hours = parseInt(match[2]);
            const minutes = parseInt(match[3] || '0');
            return sign * (hours * 60 + minutes);
        };

        const offsetA = getOffsetValue(a.offset);
        const offsetB = getOffsetValue(b.offset);

        if (offsetA !== offsetB) return offsetA - offsetB;
        return a.value.localeCompare(b.value);
    });
}
