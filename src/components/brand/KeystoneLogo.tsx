type KeystoneLogoProps = {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  className?: string;
};

const sizes = {
  sm: { icon: 20, text: "text-sm" },
  md: { icon: 28, text: "text-xl" },
  lg: { icon: 40, text: "text-3xl" },
};

export function KeystoneLogo({ size = "md", showText = true, className = "" }: KeystoneLogoProps) {
  const s = sizes[size];

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {/* Keystone arch icon */}
      <svg
        width={s.icon}
        height={s.icon}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="keystoneGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
        {/* Keystone / trapezoid arch shape */}
        <path
          d="M8 28L12 4h8l4 24H8z"
          fill="url(#keystoneGrad)"
          rx="2"
        />
        {/* Inner cutout to create arch feel */}
        <path
          d="M13 28v-8a3 3 0 0 1 6 0v8"
          fill="var(--logo-cutout)"
        />
      </svg>

      {showText && (
        <span className={`font-semibold tracking-tight text-gradient ${s.text}`}>
          Keystone
        </span>
      )}
    </div>
  );
}
