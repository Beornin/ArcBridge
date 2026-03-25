import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

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
    index = 0,
}: SectionPanelProps) {
    return (
        <motion.div
            id={sectionId}
            className="scroll-mt-24 page-break-avoid"
            style={{
                padding: '18px',
                borderBottom: isLast ? 'none' : '1px solid var(--border-subtle)',
            }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut', delay: index * 0.04 }}
        >
            {children}
        </motion.div>
    );
}
