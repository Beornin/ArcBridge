import type { ReactNode } from 'react';

type SectionPanelProps = {
    sectionId: string;
    children: ReactNode;
    isLast?: boolean;
    index?: number;
};

export function SectionPanel({
    sectionId,
    children,
    isLast = false,
}: SectionPanelProps) {
    // Children are always rendered inside the id-bearing div so that DOM queries by
    // id remain stable whether the section is collapsed or expanded.  When expanded,
    // the section component itself applies position:fixed (fixed inset-0 z-50) which
    // takes it out of normal flow — the wrapper padding is irrelevant in that state.
    return (
        <div
            id={sectionId}
            className="scroll-mt-24 page-break-avoid"
            style={{
                padding: '18px',
                borderBottom: isLast ? 'none' : '1px solid var(--border-subtle)',
            }}
        >
            {children}
        </div>
    );
}
