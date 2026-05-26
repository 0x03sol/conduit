/**
 * Arc arch logo. Used as the Start-button glyph (replaces the classic Win7
 * 4-color flag in the orb). White-only, sizeable, no text.
 *
 * Geometry from the user-supplied path: a Λ outline with a horizontal cross-
 * bar near the apex, drawn as a single fill-rule="evenodd" shape so the
 * cross-bar carves a hole through the body of the Λ.
 */
export function ArcLogo({ size = 22 }: { size?: number }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox="0 0 40 40"
            fill="white"
            fillRule="evenodd"
            aria-hidden="true"
        >
            <path d="M20 4 L6 36 L11 36 L20 14 L29 36 L34 36 Z M14 26 L26 26 L24 21 L16 21 Z" />
        </svg>
    );
}
