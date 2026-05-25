/**
 * Hand-drawn Windows-style 4-color flag, vector. Used inside the Win7 start
 * orb. Original geometry — quadrilaterals with a slight wave skew.
 */
export function Win7Flag({ size = 18 }: { size?: number }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox="0 0 18 18"
            aria-hidden="true"
        >
            <defs>
                <linearGradient id="w7r" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#ff6b6b" />
                    <stop offset="1" stopColor="#cc0000" />
                </linearGradient>
                <linearGradient id="w7g" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#7be07b" />
                    <stop offset="1" stopColor="#1aa31a" />
                </linearGradient>
                <linearGradient id="w7b" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#5fa3ff" />
                    <stop offset="1" stopColor="#0050b3" />
                </linearGradient>
                <linearGradient id="w7y" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#ffe066" />
                    <stop offset="1" stopColor="#e6a800" />
                </linearGradient>
            </defs>
            <path d="M2 3 L8.5 2 L8.5 8.5 L2 9.5 Z" fill="url(#w7r)" />
            <path d="M9.5 2 L16 1 L16 7.5 L9.5 8.5 Z" fill="url(#w7g)" />
            <path d="M2 10 L8.5 9 L8.5 15.5 L2 16.5 Z" fill="url(#w7b)" />
            <path d="M9.5 9 L16 8 L16 14.5 L9.5 15.5 Z" fill="url(#w7y)" />
            {/* subtle white highlight */}
            <path d="M2 3 L8.5 2 L8.5 4 L2 5 Z" fill="rgba(255,255,255,0.30)" />
            <path d="M9.5 2 L16 1 L16 3 L9.5 4 Z" fill="rgba(255,255,255,0.30)" />
        </svg>
    );
}
