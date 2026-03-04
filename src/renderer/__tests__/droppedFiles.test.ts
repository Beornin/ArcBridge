import { describe, expect, it } from 'vitest';
import { extractDroppedLogFiles } from '../app/utils/droppedFiles';

describe('extractDroppedLogFiles', () => {
    it('accepts supported log files from items and files', () => {
        const transfer = {
            items: [
                {
                    kind: 'file',
                    getAsFile: () => ({ name: 'FightA.ZEVTC', path: '/logs/FightA.ZEVTC' })
                }
            ],
            files: [
                { name: 'FightA.ZEVTC', path: '/logs/FightA.ZEVTC' },
                { name: 'FightB.evtc', path: '/logs/FightB.evtc' },
                { name: 'notes.txt', path: '/logs/notes.txt' }
            ]
        };

        expect(extractDroppedLogFiles(transfer)).toEqual([
            { filePath: '/logs/FightA.ZEVTC', fileName: 'FightA.ZEVTC' },
            { filePath: '/logs/FightB.evtc', fileName: 'FightB.evtc' }
        ]);
    });

    it('ignores entries without a path', () => {
        const transfer = {
            files: [
                { name: 'FightA.zevtc' },
                { name: 'FightB.zevtc', path: '' }
            ]
        };

        expect(extractDroppedLogFiles(transfer)).toEqual([]);
    });

    it('falls back to electron path resolution when file.path is unavailable', () => {
        const originalResolver = window.electronAPI.resolveDroppedFilePath;
        window.electronAPI.resolveDroppedFilePath = ((file: File) => file.name === 'FightC.zevtc' ? '/logs/FightC.zevtc' : '') as any;

        try {
            const transfer = {
                files: [
                    { name: 'FightC.zevtc' }
                ]
            };

            expect(extractDroppedLogFiles(transfer)).toEqual([
                { filePath: '/logs/FightC.zevtc', fileName: 'FightC.zevtc' }
            ]);
        } finally {
            window.electronAPI.resolveDroppedFilePath = originalResolver;
        }
    });
});
