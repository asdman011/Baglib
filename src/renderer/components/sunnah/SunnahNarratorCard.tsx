'use client';

import React, { useEffect, useState } from 'react';
import type { SunnahNarrator, SunnahNarratorLink } from '../../../shared/types/sunnah';
import type { TranslationKey } from '../../translations';
import type { SunnahTranslate } from './SunnahChapterView';

export const tierKeys: Record<string, TranslationKey> = { Sahabi: 'sunnahTierSahabi', 'Thiqah Thabt': 'sunnahTierThabt', Thiqah: 'sunnahTierThiqah', Saduq: 'sunnahTierSaduq', 'Saduq Yahim': 'sunnahTierYahim', 'Maqbul / Layyin': 'sunnahTierLayyin', 'Majhul al-Hal': 'sunnahTierMajhulHal', Majhul: 'sunnahTierMajhul', "Da'if": 'sunnahTierDaif', "Da'if Jiddan": 'sunnahTierDaifJiddan', Matruk: 'sunnahTierMatruk', Kadhdhab: 'sunnahTierKadhdhab', Ungraded: 'sunnahTierUngraded' };
const sourceGradeKeys: Record<string, TranslationKey> = { companion: 'sunnahTierSahabi', reliable: 'sunnahTierThiqah', mostly_reliable: 'sunnahTierSaduq', weak: 'sunnahTierDaif', abandoned: 'sunnahTierMatruk', fabricator: 'sunnahTierKadhdhab', unknown: 'sunnahTierUngraded' };
const sourceKeys: Record<string, TranslationKey> = { taqrib: 'sunnahRijalTaqrib', kashif: 'sunnahRijalKashif', thiqat: 'sunnahRijalThiqat', jarh: 'sunnahRijalJarh', tahdhib_tahdhib: 'sunnahRijalTahdhibTahdhib', tahdhib_kamal: 'sunnahRijalTahdhibKamal', isaba: 'sunnahRijalIsaba', tabaqat: 'sunnahRijalTabaqat', tarikh_islam: 'sunnahRijalTarikhIslam', mizan: 'sunnahRijalMizan', tadhkirat_huffaz: 'sunnahRijalTadhkirat', siyar: 'sunnahRijalSiyar', mucin_tabaqat: 'sunnahRijalMuin', durar_kamina: 'sunnahRijalDurar', kamil: 'sunnahRijalKamil', diwan_ducafa: 'sunnahRijalDiwan', tarikh: 'sunnahRijalTarikh', lisan_mizan: 'sunnahRijalLisan', mughni_ducafa: 'sunnahRijalMughni', mucjam_shuyukh: 'sunnahRijalMujam', macrifa_qurra: 'sunnahRijalMarifa', dhayl_diwan: 'sunnahRijalDhayl' };

function NarratorLinks({ title, total, links, t, onNarrator }: { title: TranslationKey; total: number; links: SunnahNarratorLink[]; t: SunnahTranslate; onNarrator: (id: string) => void }) {
  if (!total) return null;
  return <section>
    <h5>{t(title, { count: total })}</h5>
    <div className="sunnah-root-chips">{links.map(link => <button type="button" key={link.id} dir="rtl" lang="ar" title={t(tierKeys[link.tier] || 'sunnahTierUngraded')} onClick={() => onNarrator(link.id)} aria-label={t(tierKeys[link.tier] || 'sunnahTierUngraded')}>{link.name}</button>)}</div>
    {total > links.length && <p>{t('sunnahNarratorMore', { shown: links.length, total })}</p>}
  </section>;
}

export function SunnahNarratorCard({ id, t, onHadiths }: { id: string; t: SunnahTranslate; onHadiths: (id: string, name: string) => void }) {
  const [profile, setProfile] = useState<SunnahNarrator | null>(null);
  const [selected, setSelected] = useState(id);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    void window.electronAPI?.sunnah.narrator?.(selected).then(result => {
      if (!alive) return;
      if (result?.ok) { setProfile(result.data); setFailed(false); } else setFailed(true);
    }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [selected]);
  if (failed) return <p role="alert">{t('sunnahResearchError')}</p>;
  if (!profile) return <p role="status">{t('sunnahLoading')}</p>;
  const fields: [TranslationKey, string, boolean][] = [
    ['sunnahNarratorKunya', profile.kunya, true], ['sunnahNarratorNasab', profile.nasab, true], ['sunnahNarratorLaqab', profile.laqab, true],
    ['sunnahNarratorTabaqah', profile.tabaqah, true],
    ['sunnahNarratorDied', profile.deathText || (profile.deathYear ? t('sunnahNarratorDeath', { year: profile.deathYear }) : ''), true],
    ['sunnahNarratorGrade', profile.grade, true], ['sunnahNarratorTier', t(tierKeys[profile.tier] || 'sunnahTierUngraded'), false],
  ];
  return <div className="sunnah-narrator-card" data-sunnah-narrator={profile.id}>
    <strong dir="rtl" lang="ar">{profile.name}</strong>
    <dl>{fields.map(([label, value, arabic]) => value ? <React.Fragment key={label}><dt>{t(label)}</dt><dd dir={arabic ? 'auto' : undefined} lang={arabic ? 'ar' : undefined}>{value}</dd></React.Fragment> : null)}</dl>
    {profile.variants.length > 0 && <p><span>{t('sunnahNarratorVariants')}: </span><bdi dir="rtl" lang="ar">{profile.variants.join(' · ')}</bdi></p>}
    {profile.sources.length > 0 && <section><h5>{t('sunnahNarratorSources')}</h5><dl>{profile.sources.map(entry => <React.Fragment key={entry.source}><dt>{sourceKeys[entry.source] ? t(sourceKeys[entry.source]) : entry.source}</dt><dd dir={entry.gradeAr ? 'auto' : undefined} lang={entry.gradeAr ? 'ar' : undefined}>{entry.gradeAr || t(sourceGradeKeys[entry.gradeEn] || 'sunnahTierUngraded')}</dd></React.Fragment>)}</dl></section>}
    <NarratorLinks title="sunnahNarratorTeachers" total={profile.teacherCount} links={profile.teachers} t={t} onNarrator={next => { setProfile(null); setSelected(next); }} />
    <NarratorLinks title="sunnahNarratorStudents" total={profile.studentCount} links={profile.students} t={t} onNarrator={next => { setProfile(null); setSelected(next); }} />
    <p><button type="button" className="sunnah-button" disabled={!profile.hadithCount} onClick={() => onHadiths(profile.id, profile.name)}>{t('sunnahNarratorHadiths', { count: profile.hadithCount })}</button></p>
  </div>;
}
