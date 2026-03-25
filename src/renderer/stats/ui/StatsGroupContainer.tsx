import { useEffect, useRef, useState, type ReactNode } from 'react';

type StatsGroupContainerProps = {
    groupId: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    accentColor: string;
    sectionCount: number;
    children: ReactNode;
    visible?: boolean;
};

export function StatsGroupContainer({
    groupId,
    label,
    icon: Icon,
    accentColor,
    sectionCount,
    children,
    visible = true,
}: StatsGroupContainerProps) {
    const [animating, setAnimating] = useState(false);
    const prevVisibleRef = useRef(visible);

    useEffect(() => {
        if (visible && !prevVisibleRef.current) {
            setAnimating(true);
            const timer = setTimeout(() => setAnimating(false), 300);
            return () => clearTimeout(timer);
        }
        prevVisibleRef.current = visible;
    }, [visible]);

    return (
        <div style={visible ? undefined : { display: 'none' }}>
            <div
                id={`group-${groupId}`}
                className={`stats-group-container scroll-mt-24 ${animating ? 'stats-group-enter' : ''}`}
                style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-default)',
                    borderLeft: `2px solid ${accentColor}`,
                    borderRadius: 'var(--radius-md)',
                    boxShadow: 'var(--shadow-card)',
                }}
            >
                <div
                    className="flex items-center gap-2.5 px-[18px] py-[14px]"
                    style={{ borderBottom: '1px solid var(--border-subtle)' }}
                >
                    <div
                        className="flex items-center justify-center w-[18px] h-[18px] rounded-[3px]"
                        style={{ background: `${accentColor}33`, color: accentColor }}
                    >
                        <Icon className="w-3 h-3" />
                    </div>
                    <h2
                        className="text-xs font-bold uppercase tracking-[0.08em]"
                        style={{ color: 'var(--text-primary)' }}
                    >
                        {label}
                    </h2>
                    <span
                        className="ml-auto text-[10px]"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        {sectionCount} {sectionCount === 1 ? 'section' : 'sections'}
                    </span>
                </div>
                {children}
            </div>
        </div>
    );
}
