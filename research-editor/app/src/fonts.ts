// Canvas (edgeless) text fonts, bundled locally instead of AFFiNE's CDN font list (KEY-362).
// Satoshi, Lora, Bebas Neue and Orelega One are not bundled: they are not available
// offline in the source tree, so those families fall back to the system font. See the KEY-362 report.
import { FontFamily, FontStyle, FontWeight } from '@blocksuite/affine/model';
import type { FontConfig } from '@blocksuite/affine/shared/services';

import interUrl from '../fonts/Inter-Variable.woff?url';
import kalamBoldUrl from '../fonts/Kalam-Bold.woff?url';
import kalamLightUrl from '../fonts/Kalam-Light.woff?url';
import kalamRegularUrl from '../fonts/Kalam-Regular.woff?url';
import poppinsLightUrl from '../fonts/Poppins-Light.woff?url';
import poppinsMediumUrl from '../fonts/Poppins-Medium.woff?url';
import poppinsRegularUrl from '../fonts/Poppins-Regular.woff?url';
import poppinsSemiBoldUrl from '../fonts/Poppins-SemiBold.woff?url';

export const BaglibCanvasTextFonts: FontConfig[] = [
  { font: FontFamily.Inter, url: interUrl, weight: FontWeight.Light, style: FontStyle.Normal },
  { font: FontFamily.Inter, url: interUrl, weight: FontWeight.Regular, style: FontStyle.Normal },
  { font: FontFamily.Inter, url: interUrl, weight: FontWeight.SemiBold, style: FontStyle.Normal },
  { font: FontFamily.Kalam, url: kalamLightUrl, weight: FontWeight.Light, style: FontStyle.Normal },
  { font: FontFamily.Kalam, url: kalamRegularUrl, weight: FontWeight.Regular, style: FontStyle.Normal },
  { font: FontFamily.Kalam, url: kalamBoldUrl, weight: FontWeight.SemiBold, style: FontStyle.Normal },
  { font: FontFamily.Poppins, url: poppinsLightUrl, weight: FontWeight.Light, style: FontStyle.Normal },
  { font: FontFamily.Poppins, url: poppinsLightUrl, weight: FontWeight.Light, style: FontStyle.Italic },
  { font: FontFamily.Poppins, url: poppinsRegularUrl, weight: FontWeight.Regular, style: FontStyle.Normal },
  { font: FontFamily.Poppins, url: poppinsRegularUrl, weight: FontWeight.Regular, style: FontStyle.Italic },
  { font: FontFamily.Poppins, url: poppinsMediumUrl, weight: FontWeight.Medium, style: FontStyle.Normal },
  { font: FontFamily.Poppins, url: poppinsMediumUrl, weight: FontWeight.Medium, style: FontStyle.Italic },
  { font: FontFamily.Poppins, url: poppinsSemiBoldUrl, weight: FontWeight.SemiBold, style: FontStyle.Normal },
  { font: FontFamily.Poppins, url: poppinsSemiBoldUrl, weight: FontWeight.SemiBold, style: FontStyle.Italic },
];
