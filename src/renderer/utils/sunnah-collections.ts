import type { SunnahCollectionId } from '../../shared/types/sunnah';
import type { TranslationKey } from '../translations';
export const collectionKeys: Record<SunnahCollectionId, TranslationKey> = {
  Bukhari: 'sunnahBukhari', Muslim: 'sunnahMuslim', AbuDaud: 'sunnahAbuDawud',
  Tirmizi: 'sunnahTirmidhi', Nesai: 'sunnahNasai', IbnMaja: 'sunnahIbnMajah',
  MuwattaMalik: 'sunnahMuwatta', MusnadAhmad: 'sunnahAhmad', SunanDarimi: 'sunnahDarimi',
  Nawawi40: 'sunnahNawawi40', Qudsi40: 'sunnahQudsi40', Dehlawi40: 'sunnahDehlawi40', HadeethEnc: 'sunnahHadeethEnc',
  SourceOnly: 'sunnahSourceOnlyBook', ReviewQueue: 'sunnahReviewBook',
};
