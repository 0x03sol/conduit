/**
 * Win7-style icons, self-hosted in /public/icons/win7/.
 * Sourced from icons8 (officel set, used per their TOS with attribution
 * in the README).
 */

export const ICONS = {
    myComputer: "my-computer",
    sender:     "sender",       // exchange icon — represents cross-chain transfer
    operator:   "operator",     // monitor — settlement feed
    recipient:  "recipient",    // inbox — incoming payments
    arcscan:    "internet-explorer",
    readme:     "readme",       // document
    recycleBin: "recycle-bin",
    wallet:     "wallet",
    home:       "home",
    money:      "money",
    mail:       "email",
    letter:     "secured-letter",
    folder:     "folder-invoices",
    briefcase:  "briefcase",
    mailbox:    "mailbox",
} as const;

export type IconKey = keyof typeof ICONS;

interface IconProps {
    icon: IconKey;
    size?: number;
    style?: React.CSSProperties;
    className?: string;
    alt?: string;
}

export function Icon({ icon, size = 32, style, className, alt }: IconProps) {
    const file = ICONS[icon];
    return (
        <img
            src={`/icons/win7/${file}.png`}
            alt={alt ?? icon}
            width={size}
            height={size}
            style={{
                width: size,
                height: size,
                display: "inline-block",
                userSelect: "none",
                ...style,
            }}
            className={className}
            draggable={false}
        />
    );
}
