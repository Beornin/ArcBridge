import type { CSSProperties, ReactNode } from 'react';

type StatsTableLayoutProps = {
    expanded?: boolean;
    className?: string;
    sidebarClassName?: string;
    sidebarStyle?: CSSProperties;
    contentClassName?: string;
    contentStyle?: CSSProperties;
    sidebar: ReactNode;
    content: ReactNode;
};

export const StatsTableLayout = ({
    expanded,
    className = '',
    sidebarClassName = '',
    sidebarStyle,
    contentClassName = '',
    contentStyle,
    sidebar,
    content
}: StatsTableLayoutProps) => (
    <div className={`stats-table-layout grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 ${expanded ? 'flex-1 min-h-0 h-full' : ''} ${className}`}>
        <div className={`stats-table-layout__sidebar ${sidebarClassName}`} style={sidebarStyle}>{sidebar}</div>
        <div className={`stats-table-layout__content ${contentClassName}`} style={contentStyle}>{content}</div>
    </div>
);
