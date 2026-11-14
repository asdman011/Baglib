import { quranCopyText, quranReferenceLabel } from '../../utils/quran-reference-label';
import type { TranslationKey } from '../../translations';
import { contextActions } from './context-actions';
import { addPassageToSrs, openPassageComment, passageNote, linkPassageToNote, sharePassage } from './passage-actions';
import { studyLinkText } from '../../../shared/study-notes';
export function quranActions(input: {
    reference: {
        surah: number;
        ayah: number;
    };
    script: string;
    profile: 'hafs' | 'warsh';
    language: string;
    text?: string;
    t: (key: TranslationKey) => string;
    tafsir?: () => void;
    translation?: () => void;
    play?: () => void;
}) {
    const { reference, t } = input;
    const label = quranReferenceLabel({ surah: reference.surah, from: reference.ayah, to: reference.ayah }, input.language);
    const target = `quran:${input.profile}:${reference.surah}:${reference.ayah}`;
    const text = async () => {
        if (input.text)
            return input.text;
        const result = await window.electronAPI.quran.inspectAyah({ script: input.script, ...reference });
        if (!result.ok)
            throw new Error(result.error);
        return result.data.canonical;
    };
    return contextActions('quran', {
        copy: async () => navigator.clipboard.writeText(quranCopyText(await text(), reference, input.language)),
        copyPlain: async () => navigator.clipboard.writeText(quranCopyText((await text()).replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/gu, ''), reference, input.language)),
        copyReference: async () => navigator.clipboard.writeText(quranCopyText(await text(), reference, input.language)),
        share: async () => sharePassage(quranCopyText(await text(), reference, input.language)),
        tafsir: input.tafsir, translation: input.translation,
        note: async () => passageNote(target, label, await text()),
        comment: () => openPassageComment('quran:' + reference.surah + ':' + reference.ayah),
        srs: async () => addPassageToSrs({ text: await text(), sourceKind: 'quran', sourceRef: target, sourceLabel: label, language: input.language }),
        bookmark: async () => {
            await window.electronAPI.studyNotes.save({ title: label, content: studyLinkText(target, label), aliases: [], tags: ['bookmark'] });
            window.dispatchEvent(new CustomEvent('baglib:notes-changed'));
            window.dispatchEvent(new CustomEvent('baglib:context-action-done'));
        },
        play: input.play,
        link: () => linkPassageToNote(target, label),
    }, t);
}
