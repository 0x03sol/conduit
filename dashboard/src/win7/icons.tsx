/**
 * Win7-style icons, self-hosted in /public/icons/win7/.
 * Sourced from icons8 (officel set, used per their TOS with attribution
 * in the README).
 */

// Internal map — exposed via IconKey type. Used only by the Icon component below.
const ICONS = {
    myComputer: "extracted/Shell32.dll/imageres_109",
    sender:     "extracted/Standard Folders/imageres_166", // shared folder representing cross-chain transfer/sender
    operator:   "extracted/Shell32.dll/shell32_16",       // display monitor representing settlement feed/operator
    recipient:  "extracted/Standard Folders/imageres_9",   // inbox/mail representing incoming payments/recipient
    arcscan:    "extracted/Internet Explorer/iexplore_32528", // native Internet Explorer
    arcTv:      "extracted/Windows Media Player/player",     // classic WMP 12 stack icon
    cmd:        "extracted/Default Programs/cmd_IDI_APPICON", // native Win7 Command Prompt
    notepad:    "extracted/Default Programs/notepad_2",       // native Notepad
    recycleBin: "extracted/Shell32.dll/imageres_54",       // empty recycle bin
    wallet:     "extracted/Action Center/Action Center_1", // security shield
    home:       "extracted/Special Folders/imageres_123",  // user home
    money:      "extracted/Standard Folders/imageres_77",  // finance cabinet/vault
    mail:       "extracted/Standard Folders/imageres_9",   // mailbox folder
    letter:     "extracted/Standard Folders/imageres_9",
    folder:     "extracted/Standard Folders/imageres_3",   // standard glossy yellow folder
    briefcase:  "extracted/Standard Folders/imageres_3",
    mailbox:    "extracted/Standard Folders/imageres_9",
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
