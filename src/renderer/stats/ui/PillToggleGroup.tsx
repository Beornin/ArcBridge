import type { ReactNode } from 'react';

type PillToggleOption<T extends string> = {
    value: T;
    label: ReactNode;
};

type PillToggleGroupProps<T extends string> = {
    value: T;
    options: PillToggleOption<T>[];
    onChange: (value: T) => void;
    className?: string;
    activeClassName: string;
    inactiveClassName: string;
};

export const PillToggleGroup = <T extends string>({
    value,
    options,
    onChange,
    className = '',
    activeClassName,
    inactiveClassName
}: PillToggleGroupProps<T>) => (
    <div className={`pill-toggle-group flex items-center gap-1 p-[1px] text-[10px] uppercase tracking-[0.25em] ${className}`} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)', borderRadius: '3px', color: 'var(--text-secondary)' }}>
        {options.map((option) => (
            <button
                key={option.value}
                type="button"
                onClick={() => onChange(option.value)}
                className={`pill-toggle-option px-2.5 py-1 rounded-sm transition-colors ${value === option.value ? `pill-toggle-option--active ${activeClassName}` : inactiveClassName}`}
            >
                {option.label}
            </button>
        ))}
    </div>
);
